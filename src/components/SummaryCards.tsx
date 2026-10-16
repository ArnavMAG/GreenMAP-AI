import { AiResult, District, HIGH_SCORE_THRESHOLD, districts as allDistricts } from "../data/sites";

interface CardProps {
  label: string;
  value: string;
  sub: string;
  accent: string;
  bar?: number;
}

function Card({ label, value, sub, accent, bar }: CardProps) {
  return (
    <div className="rounded-xl border border-navy-600/60 bg-navy-800 px-4 py-3 shadow-glow">
      <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-1 truncate text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-xs text-slate-400">{sub}</div>
      {bar !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-navy-600">
          <div className="h-full rounded-full bg-current opacity-80" style={{ width: `${bar}%` }} />
        </div>
      )}
    </div>
  );
}

interface Props {
  districts: District[];
  /** AI analysis results by district id. Rating cards only count districts that appear here. */
  aiResults: Record<string, AiResult>;
}

export default function SummaryCards({ districts, aiResults }: Props) {
  const analysed = districts.filter((d) => aiResults[d.id]);
  const scores = analysed.map((d) => aiResults[d.id].score);
  const none = analysed.length === 0;
  const avgScore = none ? 0 : Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const strong = scores.filter((s) => s >= HIGH_SCORE_THRESHOLD).length;
  const top = [...analysed].sort((a, b) => aiResults[b.id].score - aiResults[a.id].score || b.ghi - a.ghi)[0];
  const pendingSub = "Run the AI analysis to see this";

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Card
        label="Districts analysed"
        value={`${analysed.length} / ${districts.length}`}
        sub={`of ${allDistricts.length} in Karnataka (shown: ${districts.length})`}
        accent="text-white"
      />
      <Card
        label="Average AI rating"
        value={none ? "—" : String(avgScore)}
        sub={none ? pendingSub : `Across ${analysed.length} analysed district${analysed.length === 1 ? "" : "s"} /100`}
        accent="text-sun"
        bar={none ? undefined : avgScore}
      />
      <Card
        label="High-rated districts"
        value={none ? "—" : String(strong)}
        sub={none ? pendingSub : `AI rating ≥ ${HIGH_SCORE_THRESHOLD}`}
        accent="text-leaf-400"
      />
      <Card
        label="Top-rated district"
        value={top ? top.name : "—"}
        sub={top ? `${aiResults[top.id].score}/100` : pendingSub}
        accent="text-white"
      />
    </div>
  );
}
