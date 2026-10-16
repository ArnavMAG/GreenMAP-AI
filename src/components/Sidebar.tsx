import { useEffect, useState } from "react";

export type View = "overview" | "map" | "solar" | "terrain" | "reports";

const items: { id: View; label: string; icon: string }[] = [
  { id: "overview", label: "Overview", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { id: "map", label: "Explore Map", icon: "M9 20l-6-2V4l6 2 6-2 6 2v14l-6-2-6 2zM9 6v14M15 4v14" },
  { id: "solar", label: "Solar Potential", icon: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z" },
  { id: "terrain", label: "Terrain Explorer", icon: "M3 20l6-11 4 6 3-4 5 9z" },
  { id: "reports", label: "Reports", icon: "M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

interface Props {
  view: View;
  onChange: (v: View) => void;
  /** Clears all AI results, briefs and solar farm layouts (the downloaded model stays cached in the browser). */
  onReset: () => void;
}

export default function Sidebar({ view, onChange, onReset }: Props) {
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    if (!cleared) return;
    const t = window.setTimeout(() => setCleared(false), 1800);
    return () => window.clearTimeout(t);
  }, [cleared]);

  return (
    <aside className="flex shrink-0 flex-col border-b border-navy-600/60 bg-navy-900 lg:w-64 lg:border-b-0 lg:border-r">
      <div className="flex items-center gap-3 px-5 py-4 lg:py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-leaf-500/15 text-leaf-400 ring-1 ring-leaf-500/40">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21c-4-3-7-6.5-7-10a7 7 0 0114 0c0 3.5-3 7-7 10z" />
            <circle cx="12" cy="11" r="2.5" />
          </svg>
        </div>
        <div>
          <div className="text-lg font-bold leading-tight text-white">
            GreenMap <span className="text-leaf-400">AI</span>
          </div>
          <div className="text-xs text-slate-400">Karnataka solar siting</div>
        </div>
      </div>

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Main">
        {items.map((it) => {
          const active = it.id === view;
          return (
            <button
              key={it.id}
              onClick={() => onChange(it.id)}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-leaf-500/15 text-leaf-300 ring-1 ring-leaf-500/40"
                  : "text-slate-300 hover:bg-navy-700 hover:text-white"
              }`}
            >
              <Icon d={it.icon} />
              {it.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 pb-3 lg:px-5 lg:pb-5 lg:pt-4">
        <button
          onClick={() => {
            onReset();
            setCleared(true);
          }}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-900/30 transition hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
        >
          🔄 Reset Solar Analysis
        </button>
        <p role="status" aria-live="polite" className="mt-1.5 h-4 text-center text-[11px] text-slate-400">
          {cleared ? "✓ Solar analysis reset" : ""}
        </p>
      </div>
    </aside>
  );
}
