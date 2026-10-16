import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar, { View } from "./components/Sidebar";
import SummaryCards from "./components/SummaryCards";
import MapView from "./components/MapView";
import Ranking from "./components/Ranking";
import DetailsPanel, { AiJob } from "./components/DetailsPanel";
import Reports from "./components/Reports";
import { AiResult, Filter, HIGH_SCORE_THRESHOLD, districtById, districts, rankedDistricts, visibleDistricts } from "./data/sites";
import { buildFarm } from "./data/farm";
import type { AnalyzeRequest, WorkerMessage } from "./workers/ai.worker";
import { BaseLayerName } from "./map/layers";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All Districts" },
  { id: "high", label: `High Solar (${HIGH_SCORE_THRESHOLD}+)` },
];

const titles: Record<View, { title: string; sub: string }> = {
  overview: { title: "Overview", sub: "India → Karnataka → districts: explore solar suitability by administrative division" },
  map: { title: "Explore Map", sub: "Click Karnataka to drill down, then click a district; switch layers top-right" },
  solar: { title: "Solar Potential", sub: "Districts ranked by solar irradiance suitability (GHI and DNI)" },
  terrain: { title: "Terrain Explorer", sub: "Green = flat and optimal, orange = warning hills, red = steep and restricted" },
  reports: { title: "Reports", sub: "Management summary of Karnataka district irradiance data" },
};

const AI_STORAGE_KEY = "greenmap.ai-results.v1";

function loadStoredResults(): Record<string, AiResult> {
  try {
    const raw = window.localStorage.getItem(AI_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, AiResult>) : {};
  } catch {
    return {};
  }
}

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [baseLayer, setBaseLayer] = useState<BaseLayerName>("Street Map");

  // ---- On-device AI analysis (Hugging Face SmolLM2 running in a background Web Worker) ----
  const [aiResults, setAiResults] = useState<Record<string, AiResult>>(loadStoredResults);
  const [jobs, setJobs] = useState<Record<string, AiJob>>({});
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(aiResults));
    } catch {
      /* storage unavailable: results simply live for this session */
    }
  }, [aiResults]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const getWorker = useCallback(() => {
    if (workerRef.current) return workerRef.current;
    const w = new Worker(new URL("./workers/ai.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<WorkerMessage>) => {
      if (workerRef.current !== w) return; // a worker retired by "Reset Solar Analysis" must never write results back
      const m = e.data;
      if (m.type === "progress") {
        setJobs((j) => {
          if (m.phase === "start") return { ...j, [m.id]: { phase: "start" } };
          if (m.phase === "download")
            return { ...j, [m.id]: { phase: "download", file: m.file, pct: m.pct, loadedMB: m.loadedMB, totalMB: m.totalMB } };
          if (m.phase === "load") return { ...j, [m.id]: { phase: "load" } };
          return { ...j, [m.id]: { phase: "generate", tokens: m.tokens, maxTokens: m.maxTokens } };
        });
      } else if (m.type === "result") {
        setAiResults((r) => ({ ...r, [m.id]: m.result }));
        setJobs((j) => {
          const { [m.id]: _done, ...rest } = j;
          return rest;
        });
      } else {
        setJobs((j) => ({ ...j, [m.id]: { phase: "error", message: m.message } }));
      }
    };
    // A worker that cannot even start (script failed to load or threw) would otherwise leave the card spinning forever.
    const failAll = (message: string) => {
      workerRef.current?.terminate();
      workerRef.current = null;
      setJobs((j) => Object.fromEntries(Object.entries(j).map(([id, job]) => [id, job.phase === "error" ? job : { phase: "error" as const, message }])));
    };
    w.onerror = (e) => {
      if (workerRef.current !== w) return;
      console.error("[GreenMap] AI worker error", e);
      const where = e.filename ? ` (${e.filename.split("/").pop()}${e.lineno ? `:${e.lineno}` : ""})` : "";
      failAll((e.message || "the AI worker script failed to load") + where);
    };
    w.onmessageerror = () => workerRef.current === w && failAll("the AI worker sent an unreadable message");
    workerRef.current = w;
    return w;
  }, []);

  const runAnalysis = useCallback(
    (ids: string[]) => {
      const todo = ids.filter((id) => !(jobs[id] && jobs[id].phase !== "error"));
      if (!todo.length) return;
      const w = getWorker();
      setJobs((j) => {
        const next = { ...j };
        todo.forEach((id) => (next[id] = { phase: "queued" }));
        return next;
      });
      todo.forEach((id) => {
        const x = districtById(id);
        if (!x) return;
        const req: AnalyzeRequest = { type: "analyze", id, district: { name: x.name, altitude: x.altitude, ghi: x.ghi, dni: x.dni } };
        w.postMessage(req);
      });
    },
    [getWorker, jobs],
  );

  // Solar farm layouts exist for every district that has been sent to the AI (running, failed or finished), so they
  // appear the instant the button is pressed and disappear on reset. buildFarm caches, so objects stay stable.
  const farms = useMemo(
    () => Object.fromEntries(districts.filter((x) => aiResults[x.id] || jobs[x.id]).map((x) => [x.id, buildFarm(x)])),
    [aiResults, jobs],
  );

  // RESET SOLAR ANALYSIS: one synchronous flush of everything the AI produced.
  //  - the worker is always retired (it may be mid-job, and a retired worker's late messages are ignored), so no
  //    stale result can come back after the reset; the next run starts a fresh worker that loads the model from the
  //    browser's cache, offline. Cache Storage is never touched, so the downloaded weights stay on the device.
  //  - jobs and aiResults are emptied, which drives every consumer at once: district buttons go green, briefs show
  //    the placeholder, Ranking/Summary show "Pending AI", and farms (derived from those two) vanish from the map.
  //  - the saved copy in localStorage is removed straight away, not only via the persistence effect.
  // No dependencies, so the callback can never act on a stale closure.
  const resetAnalysis = useCallback(() => {
    const w = workerRef.current;
    workerRef.current = null;
    w?.terminate();
    setJobs({});
    setAiResults({});
    try {
      window.localStorage.removeItem(AI_STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
  }, []);

  const shown = useMemo(() => visibleDistricts(filter), [filter]);
  const list = useMemo(() => rankedDistricts(filter), [filter]);
  const selected = districtById(selectedId);

  const handleFilter = (f: Filter) => {
    setFilter(f);
    const vis = visibleDistricts(f);
    if (selectedId && !vis.some((d) => d.id === selectedId)) setSelectedId(null);
  };

  const handleView = (v: View) => {
    setView(v);
    if (v === "solar") setBaseLayer("Street Map");
    if (v === "terrain") setBaseLayer("Terrain Height Map");
  };

  const showCards = view === "overview" || view === "solar" || view === "terrain";
  const mapHeight = showCards
    ? "h-[62vh] min-h-[420px] xl:h-[calc(100vh-310px)] xl:min-h-[520px]"
    : "h-[70vh] min-h-[460px] xl:h-[calc(100vh-200px)]";

  const FilterBar = (
    <div role="group" aria-label="District filter" className="inline-flex rounded-lg bg-navy-800 p-1 ring-1 ring-navy-600/60">
      {filters.map((f) => (
        <button
          key={f.id}
          onClick={() => handleFilter(f.id)}
          aria-pressed={filter === f.id}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
            filter === f.id ? "bg-leaf-500 text-navy-950" : "text-slate-300 hover:text-white"
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-full flex-col bg-navy-950 lg:h-full lg:flex-row">
      <Sidebar view={view} onChange={handleView} onReset={resetAnalysis} />

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="flex flex-col gap-3 border-b border-navy-600/60 bg-navy-900/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h1 className="text-xl font-bold text-white">{titles[view].title}</h1>
            <p className="text-sm text-slate-400">{titles[view].sub}</p>
          </div>
          {view !== "reports" && FilterBar}
        </header>

        <div className="space-y-4 p-4 sm:p-6">
          {view === "reports" ? (
            <Reports
              aiResults={aiResults}
              pending={districts.filter((x) => jobs[x.id] && jobs[x.id].phase !== "error").length}
              onRunAll={() => runAnalysis(districts.filter((x) => !aiResults[x.id]).map((x) => x.id))}
              onReset={resetAnalysis}
              onSelect={(id) => {
                setSelectedId(id);
                setView("map");
              }}
            />
          ) : (
            <>
              {showCards && <SummaryCards districts={shown} aiResults={aiResults} />}

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <MapView
                  visible={shown}
                  selectedId={selectedId}
                  selectedDistrict={selected}
                  onSelect={setSelectedId}
                  baseLayer={baseLayer}
                  onBaseLayerChange={setBaseLayer}
                  heightClass={mapHeight}
                  farm={selected ? farms[selected.id] ?? null : null}
                />
                <div className="space-y-4 xl:max-h-[calc(100vh-200px)] xl:overflow-y-auto xl:pr-1">
                  {view !== "map" && <Ranking districts={list} aiResults={aiResults} selectedId={selectedId} onSelect={setSelectedId} />}
                  <DetailsPanel
                    district={selected}
                    baseLayer={baseLayer}
                    onViewLayer={setBaseLayer}
                    result={selected ? aiResults[selected.id] : undefined}
                    job={selected ? jobs[selected.id] : undefined}
                    farm={selected ? farms[selected.id] : undefined}
                    onRun={() => selected && runAnalysis([selected.id])}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
