import { AiResult, DIVISIONS, District, tierFor } from "../data/sites";

interface Props {
  /** Districts to list (any order; the list orders itself). */
  districts: District[];
  /** AI analysis results by district id. A district has no rating until it appears here. */
  aiResults: Record<string, AiResult>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Analysed districts first (highest AI rating down); the rest follow alphabetically so the order reveals nothing. */
function order(list: District[], ai: Record<string, AiResult>): District[] {
  return [...list].sort((a, b) => {
    const sa = ai[a.id]?.score;
    const sb = ai[b.id]?.score;
    if (sa !== undefined && sb !== undefined) return sb - sa || b.ghi - a.ghi;
    if (sa !== undefined) return -1;
    if (sb !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}

export default function Ranking({ districts, aiResults, selectedId, onSelect }: Props) {
  const rows = order(districts, aiResults);
  let rank = 0;
  return (
    <section className="rounded-xl border border-navy-600/60 bg-navy-800 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-white">Ranked districts</h2>
        <span className="text-xs text-slate-400">AI suitability rating</span>
      </div>
      <ol className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
        {rows.map((s) => {
          const active = s.id === selectedId;
          const result = aiResults[s.id];
          if (result) rank += 1;
          return (
            <li key={s.id}>
              <button
                onClick={() => onSelect(s.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  active ? "border-leaf-500/60 bg-leaf-500/10" : "border-navy-600/60 bg-navy-900 hover:border-leaf-500/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-600 text-xs font-bold text-leaf-300">
                    {result ? rank : "–"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-white">{s.name}</div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <i className="h-2 w-2 shrink-0 rounded-full" style={{ background: DIVISIONS[s.division].color }} />
                      {DIVISIONS[s.division].name}
                    </div>
                  </div>
                  <div className="text-right">
                    {result ? (
                      <div className="text-lg font-bold text-white">{result.score}</div>
                    ) : (
                      <span className="inline-block rounded-full bg-navy-700 px-2.5 py-1 text-[11px] font-medium text-slate-400 ring-1 ring-navy-600">
                        Pending AI
                      </span>
                    )}
                  </div>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-600">
                  {result && (
                    <div className="h-full rounded-full" style={{ width: `${result.score}%`, background: tierFor(result.score).color }} />
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
