import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { District, DIVISIONS, DIVISION_IDS, districtById, districts as allDistricts } from "../data/sites";
import { useRefinedFarm, type FarmLayout } from "../data/farm";
import { DistrictProps, INDIA_OUTLINE, INDIA_STATES, KARNATAKA_DISTRICTS, StateProps } from "../data/geo";
import {
  BASE_LAYER_NAMES,
  BaseLayerName,
  DEM_FALLBACK_EVENT,
  DISTRICT_OVERLAY_NAME,
  MAP_BACKGROUND,
  SLOPE_CLASSES,
  SLOPE_MIN_ZOOM,
  SLOPE_OVERLAY_NAME,
  createBaseLayers,
  createLayersControl,
  createSlopeOverlay,
  keepControlInHost,
  refreshMapSize,
} from "../map/layers";

interface Props {
  /** Districts that pass the current filter (others are dimmed on the map). */
  visible: District[];
  selectedId: string | null;
  selectedDistrict: District | null;
  /** Called with a district id, or null to deselect / go back to the national view. */
  onSelect: (id: string | null) => void;
  baseLayer: BaseLayerName;
  onBaseLayerChange: (name: BaseLayerName) => void;
  heightClass?: string;
  /** Solar farm layout of the selected district (panels, substation, cables); null/undefined draws nothing. */
  farm?: FarmLayout | null;
}

type Level = 1 | 2; // 1 = India, 2 = Karnataka districts

interface View {
  selectedId: string | null;
  visibleIds: Set<string>;
  baseLayer: BaseLayerName;
}

/** Standard fill opacity of a division colour on the Street Map (selected district excepted). */
const BASE_FILL_OPACITY = 0.4;
/** Zooming out below this while in the district view returns to the national view (Karnataka clickable again). */
const NATIONAL_ZOOM = 5.75;
const BY_GEO_NAME = new Map(allDistricts.map((d) => [d.geoName, d]));

const FARM_OVERLAY_NAME = "AI Solar Schematic Layout";

/** Red high-visibility substation marker with a white lightning flash. */
const SUBSTATION_ICON = L.divIcon({
  className: "",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
  html: `<div style="width:30px;height:30px;border-radius:9999px;background:#ef4444;border:2.5px solid #fff;box-shadow:0 0 12px 3px rgba(239,68,68,.75);display:flex;align-items:center;justify-content:center"><svg viewBox="0 0 24 24" width="17" height="17" fill="#fff" aria-hidden="true"><path d="M13.5 2 4.5 13.5h6L9.5 22l9-11.5h-6z"/></svg></div>`,
});

const neighbourStyle = (terrain: boolean): L.PathOptions => ({
  color: "#94a3b8",
  weight: 1,
  fillColor: "#64748b",
  fillOpacity: terrain ? 0 : 0.55,
});
const karnatakaStyle = (terrain: boolean, hover = false): L.PathOptions => ({
  color: hover ? "#86efac" : "#22c55e",
  weight: hover ? 5 : 4,
  fillColor: "#22c55e",
  fillOpacity: terrain ? 0 : hover ? 0.6 : 0.35,
});

/** Border weights. The terrain map has busy contour lines, so its borders are much bolder to stay traceable. */
const TERRAIN_WEIGHT = 4;
const TERRAIN_SELECTED_WEIGHT = 4;
const STREET_WEIGHT = 1.5;
const STREET_SELECTED_WEIGHT = 3;

/**
 * Style for one district polygon (same rule on both base maps):
 * - Unselected districts always keep their division colour at BASE_FILL_OPACITY (0.4), also while another
 *   district is selected, so the surroundings stay readable.
 * - The selected district alone gets a sharp white outline and fillOpacity 0, so the underlying map (contours,
 *   hillshade on the terrain map) is visible un-tinted inside its boundary. The fill stays "enabled" with zero
 *   opacity rather than `fill: false`, because an unfilled SVG path is only clickable on its stroke.
 * - Terrain Height Map uses bolder strokes (weight 4) than the Street Map.
 */
function districtStyle(geoName: string | undefined, v: View): L.PathOptions {
  const dist = geoName ? BY_GEO_NAME.get(geoName) : undefined;
  if (!dist) return { color: "#64748b", weight: 1, fillOpacity: 0 };
  const color = DIVISIONS[dist.division].color;
  const terrain = v.baseLayer === "Terrain Height Map";
  if (dist.id === v.selectedId) {
    return {
      color: "#ffffff",
      weight: terrain ? TERRAIN_SELECTED_WEIGHT : STREET_SELECTED_WEIGHT,
      opacity: 1,
      fillColor: color,
      fillOpacity: 0,
    };
  }
  const visible = v.visibleIds.has(dist.id);
  return {
    // Terrain: the border is the division colour so it stands out from the contours; Street: dark navy hairline.
    color: terrain ? color : "#0f1c3f",
    weight: terrain ? TERRAIN_WEIGHT : STREET_WEIGHT,
    opacity: terrain ? (visible ? 1 : 0.4) : 1,
    fillColor: color,
    fillOpacity: visible ? BASE_FILL_OPACITY : 0.1,
  };
}

type FeatureLayer = L.Layer & { feature?: Feature<Geometry, DistrictProps> };

export default function MapView({
  visible,
  selectedId,
  selectedDistrict,
  onSelect,
  baseLayer,
  onBaseLayerChange,
  heightClass = "h-full",
  farm: farmProp = null,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null); // the element that goes fullscreen
  const containerRef = useRef<HTMLDivElement>(null); // the Leaflet map element (child of the wrapper)
  const mapRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<Record<BaseLayerName, L.Layer> | null>(null);
  const controlRef = useRef<L.Control.Layers | null>(null);
  const adminRef = useRef<L.LayerGroup | null>(null); // "District Boundaries" overlay
  const neighbourRef = useRef<L.GeoJSON | null>(null);
  const kaLayerRef = useRef<L.GeoJSON | null>(null);
  const distLayerRef = useRef<L.GeoJSON<DistrictProps> | null>(null);
  const outlineRef = useRef<L.GeoJSON | null>(null);
  // First-pass farm from the parent, upgraded to the OpenStreetMap-checked site (clear of roads, water, towns) when ready.
  const farm = useRefinedFarm(farmProp) ?? null;
  const farmGroupRef = useRef<L.LayerGroup | null>(null); // solar farm vectors of the selected district
  const hadFarmRef = useRef(false);

  const [level, setLevel] = useState<Level>(1);
  const [nativeFull, setNativeFull] = useState(false); // real browser fullscreen
  const [cssFull, setCssFull] = useState(false); // fallback for browsers without the Fullscreen API
  const [legendOpen, setLegendOpen] = useState(true);
  const [demFallback, setDemFallback] = useState(false);
  const [slopeOn, setSlopeOn] = useState(false);
  const fullscreen = nativeFull || cssFull;

  // Latest props/state for callbacks created once inside the map effect.
  const onSelectRef = useRef(onSelect);
  const onBaseChangeRef = useRef(onBaseLayerChange);
  const initialBaseRef = useRef(baseLayer);
  const viewRef = useRef<View>({ selectedId, visibleIds: new Set(), baseLayer });
  const levelRef = useRef(level);
  const cssFullRef = useRef(cssFull);
  const prevSelectedRef = useRef<string | null>(null);
  const firstFullscreenRun = useRef(true);
  const flyingRef = useRef(false);
  const flyToRef = useRef<(b: L.LatLngBounds, o: L.ZoomPanOptions & L.FitBoundsOptions) => void>(() => undefined);
  const goToIndiaRef = useRef<() => void>(() => undefined);
  onSelectRef.current = onSelect;
  onBaseChangeRef.current = onBaseLayerChange;
  viewRef.current = { selectedId, visibleIds: new Set(visible.map((d) => d.id)), baseLayer };
  levelRef.current = level;
  cssFullRef.current = cssFull;

  // Create the map once: base layers, India context, Karnataka region, district layer and the layer control.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [22.5, 80],
      zoom: 4,
      minZoom: 3,
      maxZoom: 22,
      zoomSnap: 0.25,
      scrollWheelZoom: true,
      doubleClickZoom: false, // a double-click on empty space now means "deselect"
    });
    const flyTo = (m: L.Map, b: L.LatLngBounds, o: L.ZoomPanOptions & L.FitBoundsOptions) => {
      flyingRef.current = true;
      m.once("moveend", () => window.setTimeout(() => (flyingRef.current = false), 50));
      m.flyToBounds(b, o);
    };
    flyToRef.current = (b, o) => flyTo(map, b, o);
    const isTerrain = () => viewRef.current.baseLayer === "Terrain Height Map";

    const layers = createBaseLayers();
    baseLayersRef.current = layers;
    layers[initialBaseRef.current].addTo(map);
    map.on("baselayerchange", (e) => onBaseChangeRef.current(e.name as BaseLayerName));

    // Neighbouring states: greyed out and not clickable (outline only on the terrain map).
    const neighbours: FeatureCollection<Geometry, StateProps> = {
      ...INDIA_STATES,
      features: INDIA_STATES.features.filter((f) => f.properties.st_nm !== "Karnataka"),
    };
    const neighbourLayer = L.geoJSON(neighbours, { interactive: false, style: () => neighbourStyle(isTerrain()) });
    neighbourRef.current = neighbourLayer;

    // Bold outline of India.
    const outline = L.geoJSON(INDIA_OUTLINE, {
      interactive: false,
      style: () => ({ color: "#f8fafc", weight: 3, fill: false }),
    });
    outlineRef.current = outline;

    // Level 1: Karnataka is the only active (clickable) region.
    const karnataka = INDIA_STATES.features.find((f) => f.properties.st_nm === "Karnataka");
    const ka = L.geoJSON(karnataka, { style: () => karnatakaStyle(isTerrain()) });
    ka.bindTooltip("Karnataka – click to explore districts", { sticky: true });
    ka.on("mouseover", () => ka.setStyle(karnatakaStyle(isTerrain(), true)));
    ka.on("mouseout", () => ka.setStyle(karnatakaStyle(isTerrain())));
    ka.on("click", () => {
      setLevel(2);
      flyTo(map, ka.getBounds(), { padding: [30, 30], duration: 1.2 });
    });
    kaLayerRef.current = ka;

    // Level 2: Karnataka's districts coloured by administrative division.
    const dl: L.GeoJSON<DistrictProps> = L.geoJSON<DistrictProps>(KARNATAKA_DISTRICTS, {
      style: (f) => districtStyle(f?.properties.district, viewRef.current),
      onEachFeature: (feature, layer) => {
        const dist = BY_GEO_NAME.get(feature.properties.district);
        if (!dist) return;
        const path = layer as L.Path;
        layer.bindTooltip(
          `<strong>${dist.name}</strong><br/>${dist.city} · ${DIVISIONS[dist.division].name}<br/>Illustrative solar ${dist.solar}/100 · ~${dist.demandGW} GW demand (est.)`,
          { sticky: true },
        );
        layer.on({
          mouseover: () => {
            path.setStyle({ color: "#ffffff", weight: viewRef.current.baseLayer === "Terrain Height Map" ? TERRAIN_WEIGHT : 2.5 });
            path.bringToFront();
          },
          mouseout: () => dl.resetStyle(path),
          // Clicking the active district a second time deselects it.
          click: () => onSelectRef.current(viewRef.current.selectedId === dist.id ? null : dist.id),
        });
      },
    });
    distLayerRef.current = dl;

    // "District Boundaries" overlay = every administrative shape (context states, outline, Karnataka/districts).
    // Unchecking it in the layer control leaves just the base map. The level effect swaps ka <-> dl inside it.
    const admin = L.layerGroup([neighbourLayer, outline]).addTo(map);
    adminRef.current = admin;

    // Optional slope colouring, off by default so the terrain map is not tinted.
    const slope = createSlopeOverlay();

    // Solar farm vectors live in their own pane (always above the district shapes) and their own layer group,
    // which is also a checkbox in the layer control: "AI Solar Schematic Layout".
    map.createPane("farm");
    (map.getPane("farm") as HTMLElement).style.zIndex = "450";
    const farmGroup = L.layerGroup().addTo(map);
    farmGroupRef.current = farmGroup;

    controlRef.current = createLayersControl(
      map,
      layers,
      { [DISTRICT_OVERLAY_NAME]: admin, [SLOPE_OVERLAY_NAME]: slope, [FARM_OVERLAY_NAME]: farmGroup },
      window.innerWidth < 640,
    );
    map.on("overlayadd", (e: L.LayersControlEvent) => e.name === SLOPE_OVERLAY_NAME && setSlopeOn(true));
    map.on("overlayremove", (e: L.LayersControlEvent) => e.name === SLOPE_OVERLAY_NAME && setSlopeOn(false));

    // Zooming out by hand far enough (scroll wheel / zoom buttons) returns to the national view.
    map.on("zoomend", () => {
      if (!flyingRef.current && levelRef.current === 2 && map.getZoom() < NATIONAL_ZOOM) goToIndiaRef.current();
    });

    // Double-click on empty map space deselects (double-clicks on a district/region shape are ignored).
    map.on("dblclick", (e: L.LeafletMouseEvent) => {
      const target = e.originalEvent.target as Element | null;
      if (target?.closest?.("path.leaflet-interactive")) return;
      if (levelRef.current === 2 && viewRef.current.selectedId) onSelectRef.current(null);
    });

    map.fitBounds(outline.getBounds(), { padding: [10, 10] });
    mapRef.current = map;

    // Keep the map sized correctly when its container changes.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      baseLayersRef.current = null;
      controlRef.current = null;
      adminRef.current = null;
      neighbourRef.current = null;
      kaLayerRef.current = null;
      distLayerRef.current = null;
      outlineRef.current = null;
      farmGroupRef.current = null;
    };
  }, []);

  // Inside the "District Boundaries" group, show the Karnataka region at level 1 and the districts at level 2.
  useEffect(() => {
    const admin = adminRef.current;
    const ka = kaLayerRef.current;
    const dl = distLayerRef.current;
    if (!admin || !ka || !dl) return;
    admin.removeLayer(ka);
    admin.removeLayer(dl);
    admin.addLayer(level === 1 ? ka : dl);
  }, [level]);

  // Switch the active base map when the dashboard asks for a different one.
  useEffect(() => {
    const map = mapRef.current;
    const layers = baseLayersRef.current;
    if (!map || !layers) return;
    BASE_LAYER_NAMES.forEach((name) => {
      if (name !== baseLayer && map.hasLayer(layers[name])) map.removeLayer(layers[name]);
    });
    if (!map.hasLayer(layers[baseLayer])) map.addLayer(layers[baseLayer]);
  }, [baseLayer]);

  // The terrain map must not be tinted: the context states and Karnataka region drop their fill there.
  useEffect(() => {
    const terrain = baseLayer === "Terrain Height Map";
    neighbourRef.current?.setStyle(neighbourStyle(terrain));
    kaLayerRef.current?.setStyle(karnatakaStyle(terrain));
  }, [baseLayer]);

  // Restyle districts when selection, filter or base map change; keep the selected one on top.
  useEffect(() => {
    const dl = distLayerRef.current;
    if (!dl) return;
    dl.setStyle((f) => districtStyle(f?.properties.district, viewRef.current));
    const sel = districtById(selectedId);
    if (!sel) return;
    dl.eachLayer((l) => {
      const feat = (l as FeatureLayer).feature;
      if (feat?.properties.district === sel.geoName) (l as L.Path).bringToFront();
    });
  }, [selectedId, visible, baseLayer]);

  // Selecting a district (map click or ranking list) flies the camera to fit its boundary. Deselecting flies
  // back out to the full state view.
  useEffect(() => {
    const map = mapRef.current;
    const dl = distLayerRef.current;
    const ka = kaLayerRef.current;
    if (!map || !dl || !ka) return;
    const prev = prevSelectedRef.current;
    prevSelectedRef.current = selectedId;
    if (selectedId) {
      if (levelRef.current === 1) setLevel(2);
      const sel = districtById(selectedId);
      dl.eachLayer((l) => {
        const feat = (l as FeatureLayer).feature;
        if (sel && feat?.properties.district === sel.geoName) {
          flyToRef.current((l as L.Polygon).getBounds(), { padding: [40, 40], maxZoom: 10, duration: 0.9 });
        }
      });
    } else if (prev && levelRef.current === 2) {
      flyToRef.current(ka.getBounds(), { padding: [30, 30], duration: 1 });
    }
  }, [selectedId]);

  // Back to the national view. Nothing is destroyed: the Karnataka layer is only swapped back into the
  // "District Boundaries" group (level effect), so it keeps its click/hover listeners. If the user had unticked
  // the overlay, it is switched back on so Karnataka is visible and clickable again.
  // Draw (or erase) the solar farm: blue panel nodes, one red substation, neon-yellow cables back to the HQ city.
  useEffect(() => {
    const map = mapRef.current;
    const group = farmGroupRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const had = hadFarmRef.current;
    hadFarmRef.current = farm !== null;
    if (!farm) {
      // Farm erased (e.g. global reset) while a district is still selected: zoom back out to the district.
      const sel = districtById(viewRef.current.selectedId);
      const dl = distLayerRef.current;
      if (had && sel && dl) {
        dl.eachLayer((l) => {
          if ((l as FeatureLayer).feature?.properties.district === sel.geoName) {
            flyToRef.current((l as L.Polygon).getBounds(), { padding: [40, 40], maxZoom: 10, duration: 0.9 });
          }
        });
      }
      return;
    }
    const base = { pane: "farm" } as const;
    // The last cable is the grid tie-in trunk to the city: thin and translucent so streets and labels stay readable.
    farm.cables.forEach((line, i) => {
      const trunk = i === farm.cables.length - 1;
      L.polyline(line, { ...base, color: "#faff00", weight: trunk ? 2 : 2.5, opacity: trunk ? 0.5 : 0.9, lineJoin: "miter", interactive: false })
        .bindTooltip(trunk ? `Grid tie-in line to ${farm.hq.name}` : "Collector cable", { sticky: true })
        .addTo(group);
    });
    farm.panels.forEach((pos, i) =>
      L.circleMarker(pos, { ...base, radius: 5, stroke: true, color: "#1e3a8a", weight: 1, fillColor: "#2563eb", fillOpacity: 1 })
        .bindTooltip(`Solar block ${i + 1}`)
        .addTo(group),
    );
    L.marker(farm.substation, { pane: "farm", icon: SUBSTATION_ICON, keyboard: false })
      .bindTooltip("Substation (power centre)")
      .addTo(group);
    L.circleMarker(farm.hq.pos, { ...base, radius: 5, color: "#faff00", weight: 2, fillColor: "#0f1c3f", fillOpacity: 1 })
      .bindTooltip(`${farm.hq.name} (headquarters)`)
      .addTo(group);
    // Zoom to the farm itself so the blocks are distinct; the yellow tie-in line leads off towards the HQ city.
    flyToRef.current(L.latLngBounds([...farm.panels, farm.substation]), { padding: [110, 110], maxZoom: 14, duration: 1 });
  }, [farm]);

  const backToIndia = () => {
    const map = mapRef.current;
    const outline = outlineRef.current;
    const admin = adminRef.current;
    setLevel(1);
    onSelectRef.current(null);
    if (map && admin && !map.hasLayer(admin)) map.addLayer(admin);
    kaLayerRef.current?.setStyle(karnatakaStyle(viewRef.current.baseLayer === "Terrain Height Map"));
    if (map && outline) flyToRef.current(outline.getBounds(), { padding: [10, 10], duration: 1.2 });
  };
  goToIndiaRef.current = backToIndia;

  // FULLSCREEN: use the browser's real Fullscreen API on the wrapper (everything inside it, including the Leaflet
  // layer control, stays visible). Browsers without it fall back to a fixed full-window layout.
  useEffect(() => {
    const onChange = () => setNativeFull(document.fullscreenElement !== null && document.fullscreenElement === wrapperRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (cssFull) {
      setCssFull(false);
      return;
    }
    if (typeof el.requestFullscreen === "function") {
      try {
        await el.requestFullscreen();
        return;
      } catch {
        /* denied (e.g. inside an iframe): use the CSS layout instead */
      }
    }
    setCssFull(true);
  };

  // RESIZE HOOK: whenever fullscreen toggles, give the browser time to lay out the new size, then re-measure the
  // map and repaint its tiles. Runs a window "resize" + invalidateSize inside a double requestAnimationFrame, and
  // once more after 350 ms as a safety net for slower layouts.
  useEffect(() => {
    if (firstFullscreenRun.current) {
      firstFullscreenRun.current = false;
      return;
    }
    const run = () => {
      window.dispatchEvent(new Event("resize"));
      if (mapRef.current) refreshMapSize(mapRef.current);
      if (controlRef.current && wrapperRef.current) keepControlInHost(controlRef.current, wrapperRef.current);
    };
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(run);
    });
    const timer = window.setTimeout(run, 350);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(timer);
    };
  }, [fullscreen]);

  // Also re-measure on any window resize.
  useEffect(() => {
    const onResize = () => mapRef.current?.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Escape: deselect the active district (zooming back out); with nothing selected it also leaves the CSS fullscreen
  // fallback. (In real browser fullscreen the browser itself handles Esc and does not pass it to the page.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (viewRef.current.selectedId) onSelectRef.current(null);
      else if (cssFullRef.current) setCssFull(false);
      else if (levelRef.current === 2) goToIndiaRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // While the CSS fallback is active, the page behind stops scrolling.
  useEffect(() => {
    if (!cssFull) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cssFull]);

  // Learn when the Mapbox elevation tiles were rejected and the free fallback took over.
  useEffect(() => {
    const on = () => setDemFallback(true);
    window.addEventListener(DEM_FALLBACK_EVENT, on);
    return () => window.removeEventListener(DEM_FALLBACK_EVENT, on);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={
        cssFull
          ? "fixed inset-0 z-[2000] bg-navy-950 [&>.gm-map]:rounded-none"
          : `relative overflow-hidden rounded-xl border border-navy-600/60 bg-navy-800 p-1.5 shadow-glow [&:fullscreen]:rounded-none [&:fullscreen]:border-0 [&:fullscreen]:bg-navy-950 [&:fullscreen]:p-0 [&:fullscreen>.gm-map]:rounded-none ${heightClass}`
      }
    >
      <div
        ref={containerRef}
        // Constant on purpose: React must never rewrite this element's class, because Leaflet adds its own
        // classes (leaflet-container, …) to it and losing them collapses every tile to zero width.
        className="gm-map h-full w-full rounded-lg"
        style={{ background: MAP_BACKGROUND }}
        role="application"
        aria-label="Map of India and Karnataka districts"
      />

      {/* Expand / exit fullscreen */}
      <button
        onClick={toggleFullscreen}
        aria-pressed={fullscreen}
        title={fullscreen ? "Exit full screen" : "Expand map to full screen"}
        className="absolute left-14 top-[14px] z-[1100] flex items-center gap-2 rounded-md bg-navy-800/95 px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-navy-600 backdrop-blur transition hover:bg-navy-700"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          {fullscreen ? (
            <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
          ) : (
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
          )}
        </svg>
        {fullscreen ? "Exit full screen" : "Expand fullscreen"}
      </button>

      {/* Drill-down: back to the national view */}
      {level === 2 && (
        <button
          onClick={backToIndia}
          className="absolute left-[14px] top-[88px] z-[1100] flex items-center gap-1.5 rounded-md bg-navy-800/95 px-3 py-1.5 text-xs font-semibold text-white shadow-lg ring-1 ring-navy-600 backdrop-blur transition hover:bg-navy-700"
        >
          <span aria-hidden>←</span> Back to India
        </button>
      )}

      {/* Legend + (fullscreen only) selected district card */}
      <div className="pointer-events-none absolute bottom-7 left-3 z-[1100] flex max-w-[290px] flex-col gap-2">
        {fullscreen && selectedDistrict && (
          <div className="pointer-events-auto rounded-lg bg-navy-800/95 p-3 text-xs shadow-lg ring-1 ring-navy-600 backdrop-blur">
            <div className="text-sm font-semibold text-white">{selectedDistrict.name}</div>
            <div className="text-slate-400">
              {selectedDistrict.city} · {DIVISIONS[selectedDistrict.division].name}
            </div>
            <div className="text-slate-400">
              Illustrative solar score <span className="font-semibold text-leaf-300">{selectedDistrict.solar}/100</span>
            </div>
            <div className="mt-1 text-[10px] text-slate-500">Click the district again to deselect</div>
          </div>
        )}
        <div className="pointer-events-auto rounded-lg bg-navy-800/95 p-3 text-xs text-slate-300 shadow-lg ring-1 ring-navy-600 backdrop-blur">
          <button
            onClick={() => setLegendOpen((o) => !o)}
            className="flex w-full items-center justify-between font-semibold text-white"
            aria-expanded={legendOpen}
          >
            {level === 1 ? "India" : "Karnataka districts"} — {baseLayer}
            <span className="ml-3 text-slate-400">{legendOpen ? "−" : "+"}</span>
          </button>
          {legendOpen && (
            <div className="mt-2 space-y-3">
              {level === 1 ? (
                <p className="leading-snug text-slate-400">
                  Karnataka (green outline) is the only active region in this prototype. Click it to drill down to its
                  districts. Grey states are not available.
                </p>
              ) : (
                <div>
                  <div className="mb-1 text-slate-400">
                    Administrative divisions
                  </div>
                  <ul className="space-y-1">
                    {DIVISION_IDS.map((id) => (
                      <li key={id} className="flex items-center gap-2">
                        <i className="h-3 w-3 shrink-0 rounded-sm" style={{ background: DIVISIONS[id].color }} />
                        <span className="flex-1">{DIVISIONS[id].name}</span>
                        <span className="text-slate-500">{allDistricts.filter((d) => d.division === id).length}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-[10px] leading-snug text-slate-500">
                    Click a district to zoom in; click it again, press Esc or double-click empty map to zoom back out.
                  </div>
                </div>
              )}

              {slopeOn && (
                <div>
                  <div className="mb-1 text-slate-400">Ground slope (from elevation data)</div>
                  <ul className="space-y-1">
                    {SLOPE_CLASSES.map((c) => (
                      <li key={c.label} className="flex items-center gap-2">
                        <i
                          className="h-3 w-3 shrink-0 rounded-sm ring-1 ring-white/20"
                          style={{ background: `rgba(${c.rgba[0]},${c.rgba[1]},${c.rgba[2]},${Math.max(c.rgba[3] / 255, 0.45)})` }}
                        />
                        {c.label}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1 text-[10px] leading-snug text-slate-500">
                    Slope colours appear from zoom {SLOPE_MIN_ZOOM}. Bands are indicative, not a standard.
                    {demFallback && " Mapbox elevation was unavailable, so free AWS elevation tiles are in use."}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
