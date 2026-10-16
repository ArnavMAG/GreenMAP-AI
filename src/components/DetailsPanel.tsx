import { useEffect, useState } from "react";
import { AiResult, DIVISIONS, District, PROFILES, reasonsFor, tierFor } from "../data/sites";
import { FARM_ASSUMPTIONS, FarmLayout, useRefinedFarm } from "../data/farm";
import { BaseLayerName } from "../map/layers";

/** Progress of one on-device AI run, reported by the background worker. */
export type AiJob =
  | { phase: "queued" }
  | { phase: "start" }
  | { phase: "download"; file?: string; pct?: number; loadedMB?: number; totalMB?: number }
  | { phase: "load" }
  | { phase: "generate"; tokens?: number; maxTokens?: number }
  | { phase: "error"; message: string };

interface Props {
  district: District | null;
  baseLayer: BaseLayerName;
  onViewLayer: (name: BaseLayerName) => void;
  /** Result of the AI analysis for this district, once it has run. */
  result?: AiResult;
  /** Live progress while the analysis is running (or its error). */
  job?: AiJob;
  /** Solar farm layout (exists from the moment the AI button is pressed until the analysis is reset). */
  farm?: FarmLayout;
  onRun: () => void;
}

const layerButtons: { name: BaseLayerName; label: string }[] = [
  { name: "Terrain Height Map", label: "Check terrain" },
  { name: "Street Map", label: "Street view" },
];

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      className="h-2 overflow-hidden rounded-full bg-navy-600"
    >
      <div className="h-full rounded-full bg-leaf-500 transition-[width] duration-200" style={{ width: `${v}%` }} />
    </div>
  );
}

function LoadingCard({ job }: { job: Exclude<AiJob, { phase: "error" }> }) {
  let title = "Starting background worker…";
  let detail = "Waiting for the AI worker to pick up the request.";
  let pct: number | undefined = 3;
  let key: string = job.phase;
  if (job.phase === "start") {
    title = "Contacting Hugging Face…";
    detail = "Looking up the model files.";
  } else if (job.phase === "download") {
    title = "Downloading AI model";
    pct = job.pct;
    const mb = job.loadedMB !== undefined ? `${job.loadedMB.toFixed(1)}${job.totalMB ? ` of ${job.totalMB.toFixed(1)}` : ""} MB` : "";
    detail = [job.file, mb, pct !== undefined ? `${Math.round(pct)}%` : ""].filter(Boolean).join(" · ") || "Connecting…";
    key = `d:${job.file}:${Math.round((job.loadedMB ?? 0) * 5)}`;
  } else if (job.phase === "load") {
    title = "Starting the model";
    detail = "Initialising SmolLM2 in the browser (a few seconds).";
    pct = undefined;
  } else if (job.phase === "generate") {
    const max = job.maxTokens ?? 80;
    const t = job.tokens ?? 0;
    title = "Writing the specialist brief";
    detail = `Generated ${t} of up to ${max} tokens`;
    pct = (t / max) * 100;
    key = `g:${t}`;
  }

  // If nothing changes for 20 s, say where to look instead of spinning silently.
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    setStalled(false);
    const t = window.setTimeout(() => setStalled(true), 20000);
    return () => window.clearTimeout(t);
  }, [key]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-4 rounded-lg border border-leaf-500/30 bg-navy-900 p-4 ring-1 ring-leaf-500/10"
    >
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-leaf-400 border-t-transparent" aria-hidden />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="truncate text-xs text-slate-400">{detail}</div>
        </div>
      </div>
      <div className="mt-3">
        {pct === undefined ? (
          <div className="h-2 overflow-hidden rounded-full bg-navy-600" role="progressbar" aria-label={title}>
            <div className="h-full w-1/3 animate-pulse rounded-full bg-leaf-500" />
          </div>
        ) : (
          <ProgressBar pct={pct} label={title} />
        )}
      </div>
      {stalled && (
        <p className="mt-2 text-[11px] leading-snug text-amber-300">
          No progress for 20 seconds. Open DevTools (F12) → Network and look for blocked or pending requests to huggingface.co or cdn.jsdelivr.net.
        </p>
      )}
      <div className="mt-2 text-[11px] text-slate-500">HuggingFaceTB/SmolLM2-135M-Instruct · runs locally in your browser</div>
    </div>
  );
}

export default function DetailsPanel({ district, baseLayer, onViewLayer, result, job, farm: farmProp, onRun }: Props) {
  const farm = useRefinedFarm(farmProp) ?? undefined; // same OpenStreetMap-checked site the map draws
  if (!district) {
    return (
      <section className="rounded-xl border border-dashed border-navy-600 bg-navy-800 p-6 text-center text-sm text-slate-400">
        Click Karnataka on the map, then a district (or pick one from the ranking) to see its city, altitude, GHI and
        DNI, and run the on-device AI analysis.
      </section>
    );
  }
  const profile = PROFILES[district.profile];
  const division = DIVISIONS[district.division];
  const active = job && job.phase !== "error" ? job : null;
  const failed = job && job.phase === "error" ? job : null;
  const running = active !== null;

  const cells: [string, string][] = [
    ["Administrative city", district.city],
    ["Mean altitude", `${district.altitude.toLocaleString("en-IN")} m`],
    ["GHI (avg.)", `${district.ghi.toFixed(2)} kWh/m²/day`],
    ["DNI (avg.)", `${district.dni.toFixed(2)} kWh/m²/day`],
    ["Landscape profile", profile.label],
    ["Talukas averaged", String(district.talukas)],
  ];

  return (
    <section className="rounded-xl border border-navy-600/60 bg-navy-800 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-white">{district.name}</h2>
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <i className="h-2.5 w-2.5 rounded-sm" style={{ background: division.color }} />
            {division.name} · Karnataka
          </p>
        </div>
        {result ? (
          <span
            className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-navy-950"
            style={{ background: tierFor(result.score).color }}
            title="Suitability rating computed from GHI and DNI"
          >
            {result.score}/100
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-navy-900 px-3 py-1 text-xs font-medium text-slate-400 ring-1 ring-navy-600">
            Not analysed
          </span>
        )}
      </div>

      {/* AI trigger sits directly under the district header */}
      {!running &&
        (result ? (
          <button
            disabled
            aria-disabled="true"
            className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white opacity-95"
          >
            ✓ AI Analysis Done
          </button>
        ) : (
          <button
            onClick={onRun}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-leaf-500 px-4 py-2.5 text-sm font-semibold text-navy-950 shadow-lg shadow-leaf-500/20 transition hover:bg-leaf-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf-300"
          >
            🤖 Run Hugging Face AI Optimization
          </button>
        ))}
      {active && <LoadingCard job={active} />}
      {failed && (
        <div role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-xs leading-relaxed text-red-200">
          The on-device model could not run: {failed.message}. Check your internet connection (needed once to fetch the model) and try again.
        </div>
      )}

      {(result || !running) && (
        <div className="mt-4 rounded-lg border border-leaf-500/30 bg-navy-900 p-4">
          <h3 className="text-sm font-semibold text-white">⚡ On-Device AI Specialist Brief</h3>
          {result ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-slate-200">{result.brief}</p>
              <p className="mt-2 text-[11px] leading-snug text-slate-500">
                {result.source === "model"
                  ? `Generated on this device by SmolLM2-135M-Instruct in ${(result.ms / 1000).toFixed(1)} s.`
                  : "Summary composed directly from the district's data (the model's wording did not match the supplied figures)."}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm italic leading-relaxed text-slate-500">Click the AI Optimization button to evaluate...</p>
          )}
        </div>
      )}

      {farm && (
        <div className="mt-4 rounded-lg border border-blue-500/30 bg-navy-900 p-4">
          <h3 className="text-sm font-semibold text-white">📊 Inbuilt Digital Twin Optimization Metrics</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3 rounded-lg bg-navy-800 px-3 py-2.5">
              <dt className="text-slate-300">Optimized Farm Size:</dt>
              <dd className="font-bold text-white">{farm.metrics.acres} Acres</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-lg bg-navy-800 px-3 py-2.5">
              <dt className="text-slate-300">Generated Peak Capacity:</dt>
              <dd className="font-bold text-white">{farm.metrics.peakMW} MW</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-lg bg-navy-800 px-3 py-2.5">
              <dt className="text-slate-300">Total Active Panel Strings:</dt>
              <dd className="font-bold text-white">{farm.panels.length} Sub-arrays</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            {farm.metrics.blocks} solar blocks, about {farm.metrics.distanceKm} km {farm.metrics.direction} of {farm.hq.name}, with a
            substation and a grid tie-in line back to the city. Sizing: {FARM_ASSUMPTIONS.mwPerBlock} MW per block, about{" "}
            {FARM_ASSUMPTIONS.acresPerMW} acres per MW, {FARM_ASSUMPTIONS.moduleWatts} W modules, {FARM_ASSUMPTIONS.modulesPerString} modules per
            string ({farm.metrics.strings.toLocaleString("en-IN")} strings in total). Each sub-array above is one block. Schematic layout, not a surveyed design. {farm.siting === "osm-verified" ? "Site checked against mapped roads, water and built-up land." : farm.siting === "osm-best-effort" ? "Mapped roads or settlements are close; this was the clearest site found." : "Not yet checked against map data (needs an internet connection)."}
          </p>
        </div>
      )}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        {cells.map(([k, v]) => (
          <div key={k} className="rounded-lg bg-navy-900 p-3">
            <dt className="text-slate-400">{k}</dt>
            <dd className="mt-0.5 font-medium text-white">{v}</dd>
          </div>
        ))}
      </dl>

      {result && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
            <span>Suitability rating</span>
            <span>{result.score} / 100</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-navy-600">
            <div className="h-full rounded-full" style={{ width: `${result.score}%`, background: tierFor(result.score).color }} />
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Map layer">
        {layerButtons.map((b) => (
          <button
            key={b.name}
            onClick={() => onViewLayer(b.name)}
            aria-pressed={baseLayer === b.name}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ring-1 transition ${
              baseLayer === b.name
                ? "bg-leaf-500 text-navy-950 ring-leaf-500"
                : "bg-navy-900 text-slate-300 ring-navy-600 hover:text-white"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>

      {/* Revealed only after the AI analysis has run */}
      {result && (
        <>
          <h3 className="mt-5 text-sm font-semibold text-white">Why it may be suitable</h3>
          <ul className="mt-2 space-y-2 text-sm text-slate-300">
            {reasonsFor(district).map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-leaf-400" />
                {r}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mt-5 text-sm font-semibold text-white">To verify next</h3>
      <ul className="mt-2 space-y-2 text-sm text-slate-300">
        {profile.considerations.map((r) => (
          <li key={r} className="flex gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            {r}
          </li>
        ))}
      </ul>

      {district.boundaryNote && <p className="mt-4 text-xs leading-relaxed text-slate-400">Note: {district.boundaryNote}</p>}
    </section>
  );
}
