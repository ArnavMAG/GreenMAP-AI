/// <reference lib="webworker" />
/**
 * Background worker: loads HuggingFaceTB/SmolLM2-135M-Instruct once (cached by the browser afterwards) and, per
 * request, returns
 *   1. the district's suitability rating (computed from its GHI / DNI by the same formula as the dashboard), and
 *   2. a two-sentence brief written by the language model about the district's altitude, GHI and DNI.
 * The model only writes the brief. If its text is malformed or quotes a figure that is not in the supplied data,
 * the brief is replaced by a data-grounded sentence pair and flagged with source: "data".
 */
import { env, pipeline, TextStreamer } from "@huggingface/transformers";
import { STATE_AVG, suitabilityScore, type AiResult } from "../data/sites";

export const MODEL_ID = "HuggingFaceTB/SmolLM2-135M-Instruct";
const MAX_NEW_TOKENS = 80;

export interface AnalyzeRequest {
  type: "analyze";
  id: string;
  district: { name: string; altitude: number; ghi: number; dni: number };
}

export type WorkerMessage =
  | { type: "progress"; id: string; phase: "start" }
  | { type: "progress"; id: string; phase: "download"; file?: string; pct?: number; loadedMB?: number; totalMB?: number }
  | { type: "progress"; id: string; phase: "load" }
  | { type: "progress"; id: string; phase: "generate"; tokens: number; maxTokens: number }
  | { type: "result"; id: string; result: AiResult }
  | { type: "error"; id: string; message: string };

const ctx = self as unknown as {
  postMessage: (m: WorkerMessage) => void;
  onmessage: ((e: MessageEvent<AnalyzeRequest>) => void) | null;
};

env.allowLocalModels = false;

type Generator = ((messages: unknown, options: Record<string, unknown>) => Promise<unknown>) & { tokenizer: ConstructorParameters<typeof TextStreamer>[0] };

let generatorPromise: Promise<Generator> | null = null;
let currentId = "";
const files = new Map<string, { loaded: number; total: number }>();

function loadModel(): Promise<Generator> {
  if (!generatorPromise) {
    generatorPromise = (
      pipeline("text-generation", MODEL_ID, {
        dtype: "q8",
        device: "wasm",
        progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
          const short = (f?: string) => (f ? f.split("/").pop() : undefined);
          if ((p.status === "initiate" || p.status === "download") && p.file) {
            // A file is about to be fetched: show its name so a stall is visible (and diagnosable).
            ctx.postMessage({ type: "progress", id: currentId, phase: "download", file: short(p.file) });
          } else if (p.status === "progress" && p.file) {
            files.set(p.file, { loaded: p.loaded ?? 0, total: p.total ?? 0 });
            // The model weights (.onnx) are by far the largest file, so report the largest file's progress
            // rather than a running total that would hit 100 % after the small config files.
            let big = { file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 };
            files.forEach((f, file) => {
              if (f.total > big.total) big = { file, ...f };
            });
            ctx.postMessage({
              type: "progress",
              id: currentId,
              phase: "download",
              file: short(big.file),
              pct: big.total ? Math.min(100, (big.loaded / big.total) * 100) : undefined,
              loadedMB: big.loaded / 1e6,
              totalMB: big.total / 1e6,
            });
          } else if (p.status === "done" && p.file?.endsWith(".onnx")) {
            ctx.postMessage({ type: "progress", id: currentId, phase: "load" }); // weights fetched; the runtime now starts
          } else if (p.status === "ready") {
            ctx.postMessage({ type: "progress", id: currentId, phase: "load" });
          }
        },
      }) as unknown as Promise<Generator>
    ).catch((err) => {
      generatorPromise = null; // allow a retry on the next click
      throw err;
    });
  }
  return generatorPromise;
}

const f2 = (n: number) => n.toFixed(2);

/** Deterministic two-sentence brief built straight from the numbers (used only if the model output is rejected). */
function dataBrief(d: AnalyzeRequest["district"]): string {
  const alt =
    d.altitude < 200
      ? "a low-lying coastal setting"
      : d.altitude < STATE_AVG.altitude - 100
        ? "below the state's average elevation"
        : d.altitude > STATE_AVG.altitude + 100
          ? "above the state's average elevation"
          : "close to the state's average elevation";
  const cmp = (v: number, a: number) => (Math.abs(v - a) < 0.005 ? "in line with" : v > a ? "above" : "below");
  return (
    `${d.name} lies at a mean altitude of ${Math.round(d.altitude)} m, ${alt}. ` +
    `Its GHI of ${f2(d.ghi)} kWh/m²/day is ${cmp(d.ghi, STATE_AVG.ghi)} the Karnataka average of ${f2(STATE_AVG.ghi)}, ` +
    `and its DNI of ${f2(d.dni)} kWh/m²/day is ${cmp(d.dni, STATE_AVG.dni)} the average of ${f2(STATE_AVG.dni)}.`
  );
}

/** Accept the model text only if it is two sentences and every number it quotes comes from the supplied data. */
function validate(text: string, d: AnalyzeRequest["district"]): string | null {
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 3);
  if (sentences.length < 2) return null;
  const brief = sentences.slice(0, 2).join(" ");
  const allowed = new Set([
    String(Math.round(d.altitude)),
    f2(d.ghi),
    f2(d.dni),
    f2(STATE_AVG.ghi),
    f2(STATE_AVG.dni),
    String(Math.round(STATE_AVG.altitude)),
  ]);
  const quoted: string[] = brief.match(/\d+(?:\.\d+)?/g) ?? [];
  if (quoted.some((q) => !allowed.has(q))) return null;
  // must actually talk about all three parameters
  if (!quoted.includes(String(Math.round(d.altitude))) || !quoted.includes(f2(d.ghi)) || !quoted.includes(f2(d.dni))) return null;
  return brief;
}

async function analyze(req: AnalyzeRequest) {
  currentId = req.id;
  const started = performance.now();
  const d = req.district;
  ctx.postMessage({ type: "progress", id: req.id, phase: "start" });
  const generator = await loadModel();

  const messages = [
    {
      role: "system",
      content:
        "You are a solar energy analyst. Reply with exactly two short sentences. Use only the numbers given by the user and do not invent any other figures.",
    },
    {
      role: "user",
      content:
        `District: ${d.name}, Karnataka.\n` +
        `Altitude: ${Math.round(d.altitude)} m (state average ${Math.round(STATE_AVG.altitude)} m).\n` +
        `GHI: ${f2(d.ghi)} kWh/m²/day (state average ${f2(STATE_AVG.ghi)}).\n` +
        `DNI: ${f2(d.dni)} kWh/m²/day (state average ${f2(STATE_AVG.dni)}).\n` +
        `Write two sentences about this district's altitude, GHI and DNI and what they mean for solar development.`,
    },
  ];

  let tokens = 0;
  const streamer = new TextStreamer(generator.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    token_callback_function: () => {
      tokens += 1;
      ctx.postMessage({ type: "progress", id: req.id, phase: "generate", tokens, maxTokens: MAX_NEW_TOKENS });
    },
  });
  ctx.postMessage({ type: "progress", id: req.id, phase: "generate", tokens: 0, maxTokens: MAX_NEW_TOKENS });

  const out = (await generator(messages, {
    max_new_tokens: MAX_NEW_TOKENS,
    do_sample: false,
    repetition_penalty: 1.1,
    streamer,
  })) as { generated_text: { role: string; content: string }[] }[];

  const turns = out?.[0]?.generated_text ?? [];
  const text = turns.length ? turns[turns.length - 1].content : "";
  const checked = validate(text, d);
  const result: AiResult = {
    score: suitabilityScore(d.ghi, d.dni),
    brief: checked ?? dataBrief(d),
    source: checked ? "model" : "data",
    ms: Math.round(performance.now() - started),
  };
  ctx.postMessage({ type: "result", id: req.id, result });
}

// One request at a time: the model is single-threaded and requests must not interleave their progress events.
let chain: Promise<void> = Promise.resolve();
ctx.onmessage = (e) => {
  if (e.data?.type !== "analyze") return;
  const req = e.data;
  chain = chain.then(() =>
    analyze(req).catch((err: unknown) => {
      ctx.postMessage({ type: "error", id: req.id, message: err instanceof Error ? err.message : String(err) });
    }),
  );
};
