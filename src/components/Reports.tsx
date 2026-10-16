import { useMemo } from "react";
import { AiResult, DIVISIONS, DIVISION_IDS, District, districts, tierFor } from "../data/sites";

interface Props {
  onSelect: (id: string) => void;
  /** AI analysis results by district id (only districts that have been analysed). */
  aiResults: Record<string, AiResult>;
  /** Number of districts currently queued or running in the AI worker. */
  pending: number;
  onRunAll: () => void;
  /** Clears all AI results, briefs and solar farm layouts. */
  onReset: () => void;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Lowest and highest district for one metric, used for the "in this dataset" range chips. */
function span(pick: (d: District) => number) {
  const sorted = [...districts].sort((a, b) => pick(a) - pick(b));
  return { lo: sorted[0], hi: sorted[sorted.length - 1] };
}

interface MetricCardProps {
  abbr: string;
  title: string;
  explanation: string;
  impact: string;
  range: string;
}

function MetricCard({ abbr, title, explanation, impact, range }: MetricCardProps) {
  return (
    <div className="flex flex-col rounded-lg border border-navy-600/60 bg-navy-900 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-leaf-500/15 px-2 py-0.5 text-xs font-bold tracking-wide text-leaf-300 ring-1 ring-leaf-500/30">
          {abbr}
        </span>
        <h4 className="text-sm font-semibold text-white">{title}</h4>
      </div>
      <dl className="mt-3 space-y-3 text-sm leading-relaxed">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">What it is</dt>
          <dd className="mt-0.5 text-slate-300">{explanation}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Why it matters</dt>
          <dd className="mt-0.5 text-slate-300">{impact}</dd>
        </div>
      </dl>
      <div className="mt-auto pt-3 text-xs text-slate-400">
        <div className="rounded-md bg-navy-800 px-2.5 py-1.5 leading-snug ring-1 ring-navy-600">{range}</div>
      </div>
    </div>
  );
}

/** Analysed districts first, highest AI rating down to lowest; the rest follow by their GHI/DNI index. */
function sortByAi(list: District[], ai: Record<string, AiResult>): District[] {
  return [...list].sort((a, b) => {
    const sa = ai[a.id]?.score;
    const sb = ai[b.id]?.score;
    if (sa !== undefined && sb !== undefined) return sb - sa || b.ghi - a.ghi;
    if (sa !== undefined) return -1;
    if (sb !== undefined) return 1;
    return b.solar - a.solar || b.ghi - a.ghi;
  });
}

export default function Reports({ onSelect, aiResults, pending, onRunAll, onReset }: Props) {
  const rows = useMemo(() => sortByAi(districts, aiResults), [aiResults]);
  const analysed = Object.keys(aiResults).filter((id) => districts.some((x) => x.id === id)).length;
  const remaining = districts.length - analysed;
  const top = rows[0];
  const topGhi = [...districts].sort((a, b) => b.ghi - a.ghi)[0];
  const ghiSpan = span((d) => d.ghi);
  const dniSpan = span((d) => d.dni);
  const altSpan = span((d) => d.altitude);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-navy-600/60 bg-navy-800 p-5">
        <h2 className="text-lg font-bold text-white">Executive summary</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          GreenMap AI covers {districts.length} Karnataka districts across four administrative divisions, using
          taluka-level altitude, Global Horizontal Irradiance (GHI) and Direct Normal Irradiance (DNI) averaged per district.{" "}
          <button className="font-semibold text-sun underline-offset-2 hover:underline" onClick={() => onSelect(top.id)}>
            {top.name}
          </button>{" "}
          ranks first{analysed ? " on the AI rating" : " on the irradiance index"} ({aiResults[top.id]?.score ?? top.solar}/100; GHI{" "}
          {top.ghi.toFixed(2)}, DNI {top.dni.toFixed(2)} kWh/m²/day). {topGhi.name} has the highest average GHI (
          {topGhi.ghi.toFixed(2)} kWh/m²/day). The Terrain Height Map shows where ground is flat enough to build.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {DIVISION_IDS.map((id) => {
          const ds = districts.filter((d) => d.division === id);
          return (
            <div key={id} className="rounded-xl border border-navy-600/60 bg-navy-800 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <i className="h-3 w-3 rounded-sm" style={{ background: DIVISIONS[id].color }} />
                {DIVISIONS[id].name}
              </div>
              <div className="mt-2 text-2xl font-bold text-white">
                {mean(ds.map((d) => d.ghi)).toFixed(2)}
                <span className="ml-1 text-xs font-normal text-slate-400">GHI</span>
              </div>
              <div className="text-xs text-slate-400">
                DNI {mean(ds.map((d) => d.dni)).toFixed(2)} · {ds.length} districts · kWh/m²/day
              </div>
            </div>
          );
        })}
      </section>

      <section className="overflow-hidden rounded-xl border border-navy-600/60 bg-navy-800">
        <div className="flex flex-col gap-3 border-b border-navy-600/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">District ranking by AI rating</h3>
            <p className="text-xs text-slate-400">
              {analysed} of {districts.length} districts analysed · sorted highest to lowest; districts not yet analysed follow in order of
              their irradiance index.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={onReset}
              className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-500"
            >
              🔄 Reset Solar Analysis
            </button>
            <button
              onClick={onRunAll}
              disabled={pending > 0 || remaining === 0}
              className="rounded-lg bg-leaf-500 px-4 py-2 text-xs font-semibold text-navy-950 transition hover:bg-leaf-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending > 0
                ? `Analysing… ${pending} remaining`
                : remaining === 0
                  ? "All districts analysed"
                  : `🤖 Run AI on ${remaining === districts.length ? "all districts" : `${remaining} remaining`}`}
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-navy-700 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-4 py-3">Rank</th>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">City</th>
                <th className="px-4 py-3">Division</th>
                <th className="px-4 py-3 text-right">Altitude (m)</th>
                <th className="px-4 py-3 text-right">GHI</th>
                <th className="px-4 py-3 text-right">DNI</th>
                <th className="px-4 py-3 text-right">AI rating</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                const r = aiResults[s.id];
                return (
                  <tr key={s.id} className="border-t border-navy-600/60 hover:bg-navy-700/50">
                    <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-white">
                      <button className="hover:underline" onClick={() => onSelect(s.id)}>
                        {s.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{s.city}</td>
                    <td className="px-4 py-3 text-slate-300">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: DIVISIONS[s.division].color }} />
                      {DIVISIONS[s.division].name}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">{s.altitude.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">{s.ghi.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-300">{s.dni.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums" style={{ color: r ? tierFor(r.score).color : undefined }}>
                      {r ? r.score : <span className="font-normal text-slate-500">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-navy-600/60 px-4 py-2 text-[11px] text-slate-500">
          GHI and DNI in kWh/m²/day, altitude in metres; each value is the mean of the district's talukas.
        </p>
      </section>

      <section className="rounded-xl border border-navy-600/60 bg-navy-800 p-5">
        <h3 className="text-lg font-bold text-white">📊 Solar Telemetry Metrics &amp; Evaluation Matrix</h3>
        <p className="mt-1 text-sm text-slate-400">
          The three measurements in the dataset, what each one tells an engineer, and how they feed the suitability rating.
        </p>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <MetricCard
            abbr="GHI"
            title="Global Horizontal Irradiation"
            explanation="The total shortwave solar radiation received by a flat, horizontal surface. It includes direct sunbeams plus diffuse light scattered by the atmosphere and clouds."
            impact="The primary metric for standard fixed-tilt solar panels. A higher GHI directly sets a higher baseline energy yield."
            range={`Dataset range: ${ghiSpan.lo.ghi.toFixed(2)} (${ghiSpan.lo.name}) to ${ghiSpan.hi.ghi.toFixed(2)} (${ghiSpan.hi.name}) kWh/m²/day`}
          />
          <MetricCard
            abbr="DNI"
            title="Direct Normal Irradiation"
            explanation="The solar radiation received by a surface held perfectly perpendicular (normal) to the incoming sunbeams, so it captures only the pure direct rays."
            impact="Critical for installations with sun-tracking systems that follow the sun through the day. A high DNI means tracking systems reach their best peak performance."
            range={`Dataset range: ${dniSpan.lo.dni.toFixed(2)} (${dniSpan.lo.name}) to ${dniSpan.hi.dni.toFixed(2)} (${dniSpan.hi.name}) kWh/m²/day`}
          />
          <MetricCard
            abbr="ALT"
            title="Altitude / Elevation"
            explanation="The height of the district's terrain above sea level."
            impact="Photovoltaic panels lose efficiency as they heat up. Higher-altitude regions typically have cooler ambient air, which helps prevent overheating and supports better energy conversion."
            range={`Dataset range: ${altSpan.lo.altitude.toLocaleString("en-IN")} m (${altSpan.lo.name}) to ${altSpan.hi.altitude.toLocaleString("en-IN")} m (${altSpan.hi.name})`}
          />
        </div>

        <div className="mt-3 rounded-lg border border-leaf-500/30 bg-navy-900 p-4">
          <h4 className="text-sm font-semibold text-white">Why the AI suitability score matters</h4>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            The dashboard's suitability rating is a macro-level site-screening matrix. It balances 60% GHI and 40% DNI across
            all districts in the dataset and ranks the regions instantly, which helps prevent capital waste. Engineering firms
            can rule out low-yield and heavy-monsoon-cloud zones straight away, before committing budget to deploying physical
            land-survey teams.
          </p>
          <div className="mt-3" aria-label="Score weighting: 60 percent GHI, 40 percent DNI">
            <div className="flex h-6 overflow-hidden rounded-md text-[11px] font-semibold text-navy-950">
              <div className="flex w-[60%] items-center justify-center bg-leaf-500">GHI 60%</div>
              <div className="flex w-[40%] items-center justify-center bg-sun">DNI 40%</div>
            </div>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            Each value is scaled across the districts and mapped to a 50–100 rating, so it ranks regions against one another.
            Altitude is shown for context and is not part of the score. Shortlisted districts still need on-site assessment
            before any build decision.
          </p>
        </div>
      </section>
    </div>
  );
}
