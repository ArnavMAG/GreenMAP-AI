/**
 * Built-in solar placement engine ("digital twin" layout).
 *
 * For a district it picks a site zone near the district's headquarters city, lays out a grid of 12-16 solar
 * blocks, places a substation on the side facing the headquarters, and returns the cable routes plus the
 * sizing numbers. Everything is computed instantly and offline from the district's own data.
 *
 * Siting happens in two passes:
 *  1. buildFarm(): instant, offline, geometry only. The site sits well outside the headquarters town and well inside
 *     the district boundary. It knows nothing about roads, lakes or villages.
 *  2. refineFarm() / useRefinedFarm(): when the browser is online, one query to OpenStreetMap (Overpass) fetches the
 *     main roads, rivers, lakes and built-up areas around the headquarters. Candidate sites are then scored and the
 *     nearest one that keeps a clear buffer from all of them is used. Results are cached in the browser, so the
 *     second visit (and offline use) needs no network. If the query fails the first-pass site stays.
 *
 * IMPORTANT: this is still a schematic layout, not a surveyed design.
 */
import { useEffect, useState } from "react";
import { KARNATAKA_DISTRICTS } from "./geo";
import { District, districtById, suitabilityScore } from "./sites";

export type LatLng = [number, number];

export interface FarmLayout {
  districtId: string;
  hq: { name: string; pos: LatLng };
  /** One position per solar block (blue nodes). */
  panels: LatLng[];
  substation: LatLng;
  /** Cable polylines: collector rows, then the grid tie-in line to the headquarters. */
  cables: LatLng[][];
  /** How the site was chosen: geometry only, verified clear of mapped roads/water/built-up areas, or best effort. */
  siting: "geometry" | "osm-verified" | "osm-best-effort";
  /** South-west and north-east corners covering the farm and the headquarters. */
  bounds: [LatLng, LatLng];
  metrics: {
    blocks: number;
    acres: number;
    peakMW: number;
    strings: number;
    /** Distance and compass direction from the headquarters to the site. */
    distanceKm: number;
    direction: string;
  };
}

/** Sizing assumptions (shown on the metrics card). */
export const FARM_ASSUMPTIONS = {
  mwPerBlock: 2.5,
  acresPerMW: 5,
  moduleWatts: 550,
  modulesPerString: 26,
};

/** Approximate coordinates (lat, lng) of each district's headquarters city. */
const HQ: Record<string, LatLng> = {
  Mysuru: [12.2958, 76.6394],
  Mandya: [12.5218, 76.8951],
  Chamarajanagara: [11.9261, 76.9437],
  Hassan: [13.0072, 76.0962],
  Chikkamagaluru: [13.3161, 75.772],
  Kodagu: [12.4244, 75.7382],
  "Dakshina Kannada": [12.9141, 74.856],
  Udupi: [13.3409, 74.7421],
  "Bengaluru Urban": [12.9716, 77.5946],
  "Bengaluru Rural": [13.2437, 77.7134],
  Ramanagara: [12.7157, 77.2806],
  Kolar: [13.136, 78.1291],
  Chikkaballapura: [13.4355, 77.7315],
  Tumakuru: [13.3379, 77.1173],
  Chitradurga: [14.2251, 76.398],
  Davanagere: [14.4644, 75.9218],
  Shivamogga: [13.9299, 75.5681],
  Belagavi: [15.8497, 74.4977],
  Bagalkote: [16.1691, 75.6615],
  Vijayapura: [16.8302, 75.71],
  Dharwad: [15.4589, 75.0078],
  Gadag: [15.4166, 75.627],
  Haveri: [14.7951, 75.3991],
  "Uttara Kannada": [14.8137, 74.1295],
  Kalaburagi: [17.3297, 76.8343],
  Bidar: [17.9104, 77.5199],
  Yadgir: [16.7625, 77.138],
  Raichur: [16.212, 77.3439],
  Koppal: [15.3547, 76.1548],
  Ballari: [15.1394, 76.9214],
};

type Ring = number[][];
interface Geom {
  type: "Polygon" | "MultiPolygon";
  coordinates: Ring[] | Ring[][];
}

function districtPolygons(geoName: string): Ring[][] {
  const fc = KARNATAKA_DISTRICTS as unknown as {
    features: { geometry: Geom; properties: { district: string } }[];
  };
  const f = fc.features.find((x) => x.properties.district === geoName);
  if (!f) return [];
  return f.geometry.type === "Polygon" ? [f.geometry.coordinates as Ring[]] : (f.geometry.coordinates as Ring[][]);
}

function inRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inDistrict(polys: Ring[][], lat: number, lng: number): boolean {
  return polys.some((rings) => inRing(lat, lng, rings[0]) && !rings.slice(1).some((h) => inRing(lat, lng, h)));
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const M_PER_DEG_LAT = 111320;
const offset = (origin: LatLng, northM: number, eastM: number): LatLng => [
  origin[0] + northM / M_PER_DEG_LAT,
  origin[1] + eastM / (M_PER_DEG_LAT * Math.cos((origin[0] * Math.PI) / 180)),
];

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = (bearingDeg: number) => COMPASS[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8];


// ---------------------------------------------------------------------------------------------------------------
// Layout from a chosen site centre
// ---------------------------------------------------------------------------------------------------------------

type TieOrder = "ew" | "ns";

function dims(d: District) {
  const blocks = 12 + Math.round(((suitabilityScore(d.ghi, d.dni) - 50) / 50) * 4); // 12 at score 50, 16 at 100
  const cols = 4;
  const rows = Math.ceil(blocks / cols);
  const spacingM = Math.sqrt(FARM_ASSUMPTIONS.mwPerBlock * FARM_ASSUMPTIONS.acresPerMW * 4046.86); // one block's land
  return { blocks, cols, rows, spacingM, halfW: (cols * spacingM) / 2, halfH: (rows * spacingM) / 2 };
}

function layoutAt(d: District, center: LatLng, dist: number, tie: TieOrder, siting: FarmLayout["siting"]): FarmLayout {
  const hqPos = HQ[d.name] ?? ([12.97, 77.59] as LatLng);
  const { blocks, cols, rows, spacingM, halfW, halfH } = dims(d);
  const { mwPerBlock, acresPerMW, moduleWatts, modulesPerString } = FARM_ASSUMPTIONS;

  // Blocks on a grid centred on the site.
  const panels: LatLng[] = [];
  const rowsOfPanels: LatLng[][] = [];
  for (let r = 0; r < rows; r++) {
    const rowPts: LatLng[] = [];
    for (let c = 0; c < cols && panels.length < blocks; c++) {
      const p = offset(center, halfH - spacingM * (r + 0.5), -halfW + spacingM * (c + 0.5));
      rowPts.push(p);
      panels.push(p);
    }
    rowsOfPanels.push(rowPts);
  }

  // Substation just outside the farm edge that faces the headquarters.
  const toHqNorth = (hqPos[0] - center[0]) * M_PER_DEG_LAT;
  const toHqEast = (hqPos[1] - center[1]) * M_PER_DEG_LAT * Math.cos((center[0] * Math.PI) / 180);
  const len = Math.hypot(toHqNorth, toHqEast) || 1;
  const ux = toHqEast / len;
  const uy = toHqNorth / len;
  const reach = Math.min(halfW / Math.abs(ux || 1e-9), halfH / Math.abs(uy || 1e-9)) + 160;
  const substation = offset(center, uy * reach, ux * reach);

  // Collector cables: one line per row ending at the substation.
  const dSq = (a: LatLng, b: LatLng) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  const cables: LatLng[][] = rowsOfPanels.map((pts) => {
    const ordered = dSq(pts[pts.length - 1], substation) <= dSq(pts[0], substation) ? pts : [...pts].reverse();
    return [...ordered, substation];
  });
  // Grid tie-in trunk: ONE right-angle bend (east-west then north-south, or the reverse) instead of a diagonal slash.
  const corner: LatLng = tie === "ew" ? [substation[0], hqPos[1]] : [hqPos[0], substation[1]];
  const near = (a: LatLng, b: LatLng) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
  cables.push(near(corner, substation) || near(corner, hqPos) ? [substation, hqPos] : [substation, corner, hqPos]); // no zero-length bend

  const all = [...panels, substation, corner, hqPos];
  const lats = all.map((p) => p[0]);
  const lngs = all.map((p) => p[1]);
  const peakMW = blocks * mwPerBlock;
  return {
    districtId: d.id,
    hq: { name: d.city, pos: hqPos },
    panels,
    substation,
    cables,
    siting,
    bounds: [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ],
    metrics: {
      blocks,
      acres: Math.round(peakMW * acresPerMW),
      peakMW,
      strings: Math.round((peakMW * 1e6) / (moduleWatts * modulesPerString)),
      distanceKm: Math.round((dist / 1000) * 10) / 10,
      direction: compass((Math.atan2(-toHqEast, -toHqNorth) * 180) / Math.PI), // compass direction of the site as seen from the HQ
    },
  };
}

/** True when the whole farm footprint (plus `margin` metres) lies inside the district boundary. */
function footprintInside(polys: Ring[][], c: LatLng, halfW: number, halfH: number, margin: number): boolean {
  if (!polys.length) return true;
  const hw = halfW + margin;
  const hh = halfH + margin;
  const pts: LatLng[] = [];
  for (const nx of [-1, 0, 1]) for (const ny of [-1, 0, 1]) pts.push(offset(c, ny * hh, nx * hw));
  return pts.every(([la, ln]) => inDistrict(polys, la, ln));
}

const MIN_CITY_GAP_M = 3500; // never closer than this to the headquarters: the headquarters town's built-up edge

const cache = new Map<string, FarmLayout>();

/** Pass 1 (instant, offline): a rural site clear of the headquarters town and inside the district. Cached per district. */
export function buildFarm(d: District): FarmLayout {
  const hit = cache.get(d.id);
  if (hit) return hit;

  const hqPos = HQ[d.name] ?? ([12.97, 77.59] as LatLng);
  const polys = districtPolygons(d.geoName);
  const { halfW, halfH } = dims(d);

  const h = hash(d.id);
  const baseDist = 5000 + (h % 6) * 1000;
  const startBearing = (h >> 5) % 360;
  let center: LatLng | null = null;
  let dist = baseDist;
  for (const margin of [700, 250]) {
    // 700 m of clear land inside the boundary first; small districts fall back to 250 m
    for (let i = 0; i < 36 && !center; i++) {
      const b = startBearing + i * 47;
      const r = Math.max(MIN_CITY_GAP_M, baseDist - (i >= 18 ? 1500 : 0));
      const c = offset(hqPos, r * Math.cos((b * Math.PI) / 180), r * Math.sin((b * Math.PI) / 180));
      if (footprintInside(polys, c, halfW, halfH, margin)) {
        center = c;
        dist = r;
      }
    }
    if (center) break;
  }
  if (!center) {
    center = offset(hqPos, MIN_CITY_GAP_M, 0);
    dist = MIN_CITY_GAP_M;
  }
  const farm = layoutAt(d, center, dist, "ew", "geometry");
  cache.set(d.id, farm);
  return farm;
}

// ---------------------------------------------------------------------------------------------------------------
// Pass 2: OpenStreetMap exclusion check (roads, rivers, lakes, built-up land, villages)
// ---------------------------------------------------------------------------------------------------------------

/** Required clear distance (metres) between the farm footprint and each kind of mapped feature. */
const BUFFER_M = { road: 350, water: 300, built: 350 };
/** Radius treated as built-up around a mapped place point (used where no residential area is mapped). */
const PLACE_RADIUS_M: Record<string, number> = { city: 2500, town: 1500, suburb: 800, village: 500, hamlet: 250 };
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const STORE_KEY = "greenmap.farm-sites.v2";

type XY = [number, number];
interface Feature {
  kind: "road" | "water" | "built";
  pts: XY[];
  closed: boolean; // polygon: points inside count as distance 0
  box: [number, number, number, number]; // minX, minY, maxX, maxY
}
interface Place {
  at: XY;
  r: number;
}

function makeProjector(origin: LatLng) {
  const mLng = M_PER_DEG_LAT * Math.cos((origin[0] * Math.PI) / 180);
  return (lat: number, lng: number): XY => [(lng - origin[1]) * mLng, (lat - origin[0]) * M_PER_DEG_LAT];
}

function segDist(px: number, py: number, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function pointInPoly(px: number, py: number, pts: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from a point to the nearest feature of one kind (0 inside a polygon), stopping early beyond `cap`. */
function nearest(px: number, py: number, feats: Feature[], places: Place[], kind: Feature["kind"], cap: number): number {
  let best = cap;
  for (const f of feats) {
    if (f.kind !== kind) continue;
    if (px < f.box[0] - best || px > f.box[2] + best || py < f.box[1] - best || py > f.box[3] + best) continue;
    if (f.closed && f.pts.length > 2 && pointInPoly(px, py, f.pts)) return 0;
    for (let i = 1; i < f.pts.length; i++) {
      const d = segDist(px, py, f.pts[i - 1], f.pts[i]);
      if (d < best) best = d;
    }
  }
  if (kind === "built") {
    for (const p of places) {
      const d = Math.hypot(px - p.at[0], py - p.at[1]) - p.r;
      if (d < best) best = Math.max(0, d);
    }
  }
  return best;
}

interface OsmElement {
  type: "way" | "relation" | "node";
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
  members?: { type: string; geometry?: { lat: number; lon: number }[] }[];
}

async function fetchOsm(bbox: [number, number, number, number]): Promise<OsmElement[] | null> {
  const [s, w, n, e] = bbox.map((v) => v.toFixed(5));
  const b = `${s},${w},${n},${e}`;
  const q = `[out:json][timeout:25];(
way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${b});
way["waterway"~"^(river|canal)$"](${b});
way["natural"="water"](${b});
relation["natural"="water"](${b});
way["landuse"~"^(reservoir|basin|residential|commercial|industrial|retail)$"](${b});
node["place"~"^(city|town|suburb|village|hamlet)$"](${b});
);out geom tags;`;
  for (const url of OVERPASS) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(url, { method: "POST", body: "data=" + encodeURIComponent(q), signal: ctl.signal, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (!res.ok) continue;
      const json = (await res.json()) as { elements?: OsmElement[] };
      if (json.elements) return json.elements;
    } catch {
      /* try the next server */
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function toFeatures(els: OsmElement[], proj: (la: number, ln: number) => XY): { feats: Feature[]; places: Place[] } {
  const feats: Feature[] = [];
  const places: Place[] = [];
  const add = (kind: Feature["kind"], geom: { lat: number; lon: number }[] | undefined, polygon: boolean) => {
    if (!geom || geom.length < 2) return;
    const pts = geom.map((g) => proj(g.lat, g.lon));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const closed = polygon && pts.length > 3 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    feats.push({ kind, pts, closed, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
  };
  for (const el of els) {
    const t = el.tags ?? {};
    if (el.type === "node" && t.place && el.lat !== undefined && el.lon !== undefined) {
      places.push({ at: proj(el.lat, el.lon), r: PLACE_RADIUS_M[t.place] ?? 300 });
    } else if (el.type === "way") {
      if (t.highway) add("road", el.geometry, false);
      else if (t.waterway) add("water", el.geometry, false);
      else if (t.natural === "water" || t.landuse === "reservoir" || t.landuse === "basin") add("water", el.geometry, true);
      else if (t.landuse) add("built", el.geometry, true);
    } else if (el.type === "relation" && t.natural === "water") {
      el.members?.forEach((m) => m.type === "way" && add("water", m.geometry, false)); // shorelines of large lakes
    }
  }
  return { feats, places };
}

interface Stored {
  c: LatLng;
  dist: number;
  tie: TieOrder;
  siting: FarmLayout["siting"];
}
function readStore(): Record<string, Stored> {
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) || "{}") as Record<string, Stored>;
  } catch {
    return {};
  }
}
function writeStore(id: string, v: Stored) {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ ...readStore(), [id]: v }));
  } catch {
    /* storage unavailable: the check simply re-runs next session */
  }
}

const refined = new Map<string, FarmLayout>();
const inflight = new Map<string, Promise<FarmLayout | null>>();
const failedAt = new Map<string, number>();

/**
 * Pass 2: re-sites the farm away from mapped roads, rivers, lakes, built-up land and villages. Resolves to the new
 * layout, or null when OpenStreetMap could not be reached (the first-pass site then simply stays).
 */
export function refineFarm(districtId: string): Promise<FarmLayout | null> {
  const done = refined.get(districtId);
  if (done) return Promise.resolve(done);
  const d = districtById(districtId);
  if (!d) return Promise.resolve(null);

  const stored = readStore()[districtId];
  if (stored) {
    const f = layoutAt(d, stored.c, stored.dist, stored.tie, stored.siting);
    refined.set(districtId, f);
    return Promise.resolve(f);
  }
  const pending = inflight.get(districtId);
  if (pending) return pending;
  if (Date.now() - (failedAt.get(districtId) ?? 0) < 60000) return Promise.resolve(null);

  const job = (async () => {
    const hqPos = HQ[d.name] ?? ([12.97, 77.59] as LatLng);
    const polys = districtPolygons(d.geoName);
    const { halfW, halfH } = dims(d);

    // Candidate sites around the headquarters: 18 bearings x 7 distances, footprint fully inside the district.
    const cands: { c: LatLng; dist: number }[] = [];
    for (const dist of [3500, 4500, 5500, 6500, 8000, 9500, 11000]) {
      for (let b = 0; b < 360; b += 20) {
        const c = offset(hqPos, dist * Math.cos((b * Math.PI) / 180), dist * Math.sin((b * Math.PI) / 180));
        if (footprintInside(polys, c, halfW, halfH, 700)) cands.push({ c, dist });
      }
    }
    if (!cands.length) return null;

    const pad = 1500;
    const lats = cands.flatMap((x) => [x.c[0]]).concat(hqPos[0]);
    const lngs = cands.flatMap((x) => [x.c[1]]).concat(hqPos[1]);
    const els = await fetchOsm([
      Math.min(...lats) - (halfH + pad) / M_PER_DEG_LAT,
      Math.min(...lngs) - (halfW + pad) / (M_PER_DEG_LAT * Math.cos((hqPos[0] * Math.PI) / 180)),
      Math.max(...lats) + (halfH + pad) / M_PER_DEG_LAT,
      Math.max(...lngs) + (halfW + pad) / (M_PER_DEG_LAT * Math.cos((hqPos[0] * Math.PI) / 180)),
    ]);
    if (!els) {
      failedAt.set(districtId, Date.now());
      return null;
    }
    const proj = makeProjector(hqPos);
    const { feats, places } = toFeatures(els, proj);

    // Clearance of one candidate: the closest approach of its footprint (7x7 sample grid, ~150 m apart) to each kind.
    const clearance = (c: LatLng) => {
      const [cx, cy] = proj(c[0], c[1]);
      let road = 1e9, water = 1e9, built = 1e9;
      for (let i = 0; i < 7; i++)
        for (let j = 0; j < 7; j++) {
          const x = cx - halfW + (i / 6) * 2 * halfW;
          const y = cy - halfH + (j / 6) * 2 * halfH;
          road = Math.min(road, nearest(x, y, feats, places, "road", road));
          water = Math.min(water, nearest(x, y, feats, places, "water", water));
          built = Math.min(built, nearest(x, y, feats, places, "built", built));
        }
      return { road, water, built, ratio: Math.min(road / BUFFER_M.road, water / BUFFER_M.water, built / BUFFER_M.built) };
    };
    const scored = cands.map((x) => ({ ...x, ...clearance(x.c) }));
    const feasible = scored.filter((x) => x.ratio >= 1).sort((a, b) => a.dist - b.dist || b.ratio - a.ratio);
    const best = feasible[0] ?? [...scored].sort((a, b) => b.ratio - a.ratio || a.dist - b.dist)[0];

    // Trunk bend: pick the east-west-first or north-south-first route that spends less length inside built-up land
    // (the last 1.2 km next to the headquarters town is ignored: that end has to reach the city).
    const site = layoutAt(d, best.c, best.dist, "ew", "geometry");
    const builtLen = (tie: TieOrder) => {
      const s = proj(site.substation[0], site.substation[1]);
      const h = proj(hqPos[0], hqPos[1]);
      const corner: XY = tie === "ew" ? [h[0], s[1]] : [s[0], h[1]];
      let count = 0;
      for (const [a, b] of [[s, corner], [corner, h]] as [XY, XY][]) {
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let m = 0; m < L; m += 100) {
          const x = a[0] + ((b[0] - a[0]) * m) / (L || 1);
          const y = a[1] + ((b[1] - a[1]) * m) / (L || 1);
          if (Math.hypot(x - h[0], y - h[1]) < 1200) continue;
          if (nearest(x, y, feats, places, "built", 1) === 0) count++;
        }
      }
      return count;
    };
    const tie: TieOrder = builtLen("ns") < builtLen("ew") ? "ns" : "ew";
    const siting: FarmLayout["siting"] = feasible.length ? "osm-verified" : "osm-best-effort";
    const farm = layoutAt(d, best.c, best.dist, tie, siting);
    refined.set(districtId, farm);
    writeStore(districtId, { c: best.c, dist: best.dist, tie, siting });
    return farm;
  })().finally(() => inflight.delete(districtId));
  inflight.set(districtId, job);
  return job;
}

/**
 * React hook: returns the OpenStreetMap-checked layout for the farm's district as soon as it is available (re-rendering
 * the caller), and the instant first-pass layout until then. Safe offline: failures just keep the first pass.
 */
export function useRefinedFarm(farm: FarmLayout | null | undefined): FarmLayout | null | undefined {
  const [, bump] = useState(0);
  const id = farm?.districtId;
  useEffect(() => {
    if (!id || refined.has(id)) return;
    let live = true;
    refineFarm(id).then((r) => live && r && bump((n) => n + 1));
    return () => {
      live = false;
    };
  }, [id]);
  return farm && id ? refined.get(id) ?? farm : farm;
}
