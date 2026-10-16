import L from "leaflet";

export type BaseLayerName = "Street Map" | "Terrain Height Map";
export const BASE_LAYER_NAMES: BaseLayerName[] = ["Street Map", "Terrain Height Map"];

/** Label of the optional overlay checkbox in the layer control. Unchecking it hides all administrative shapes. */
export const DISTRICT_OVERLAY_NAME = "District Boundaries";
/** Map background shown behind/before tiles (OSM water colour), so a slow or failed tile never looks like a dark screen. */
export const MAP_BACKGROUND = "#aad3df";

/** Optional overlay checkbox: colours the ground by slope. Off by default so the terrain map stays untinted. */
export const SLOPE_OVERLAY_NAME = "Slope Classes (flat / hills / steep)";

/**
 * Mapbox public access token used for the Terrain-RGB elevation tiles.
 * NOTE: this value has only two dot-separated parts and its payload is not valid JSON, so Mapbox will most
 * likely reject it (HTTP 401). If that happens the Terrain Height Map automatically falls back to free
 * AWS elevation tiles (see DEM_FALLBACK_EVENT). Replace it with a fresh `pk.…` token from your Mapbox
 * account and restrict that token to your own URLs.
 */
export const MAPBOX_TOKEN =
  "pk.eyJ1IjoiY2tvbi13aG8iLCJhIjoiY2hJbCJ0IjoiY2EyMT20Td1dWdXMDB4Y2pCNmcyRndMWHBqY1JSdmRzSjkuUV9JQ3NHQVlFUzZNWWFVU2hod3d2USJ9";

/** Mapbox Terrain-RGB (raw PNG) tile template. */
const MAPBOX_TERRAIN_RGB = `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${MAPBOX_TOKEN}`;
/** Free fallback elevation tiles ("Terrarium" encoding). */
const AWS_TERRARIUM = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";

/** Fired on `window` once if Mapbox elevation tiles fail and the AWS fallback takes over. */
export const DEM_FALLBACK_EVENT = "greenmap:dem-fallback";

/** Native zoom of the elevation tiles used for slope. Higher = finer slope but many more requests. */
const TERRAIN_NATIVE_ZOOM = 13;
/**
 * Slope colours only appear from this zoom. One pixel covers roughly 300 m at zoom 9 (150 m at zoom 10), so
 * below this the "slope" between neighbouring pixels is averaged away and almost everything would be painted
 * flat/green, which is misleading.
 */
export const SLOPE_MIN_ZOOM = 9;

/** Slope classes in degrees: translucent green, soft orange, solid red. */
export const SLOPE_CLASSES = [
  { max: 5, rgba: [34, 197, 94, 95], label: "Flat – optimal (0–5°)" },
  { max: 12, rgba: [251, 146, 60, 165], label: "Warning hills (5–12°)" },
  { max: 90, rgba: [220, 38, 38, 245], label: "Steep – restricted (> 12°)" },
] as const;

const TILE = 256;

type DemKind = "mapbox" | "aws";
let demFallback = false;

function fillTemplate(tpl: string, z: number, x: number, y: number): string {
  return tpl.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** Mapbox Terrain-RGB: height = -10000 + ((R * 256 * 256 + G * 256 + B) * 0.1). */
const decodeMapbox = (r: number, g: number, b: number) => -10000 + (r * 65536 + g * 256 + b) * 0.1;
/** Terrarium: height = (R * 256 + G + B / 256) - 32768. */
const decodeTerrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768;

function tileLatitude(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * (y + 0.5)) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

function paintSlope(slopeDeg: number, out: Uint8ClampedArray, o: number) {
  const cls = SLOPE_CLASSES.find((c) => slopeDeg <= c.max) ?? SLOPE_CLASSES[SLOPE_CLASSES.length - 1];
  out[o] = cls.rgba[0];
  out[o + 1] = cls.rgba[1];
  out[o + 2] = cls.rgba[2];
  out[o + 3] = cls.rgba[3];
}

/**
 * Canvas tile layer: loads a Terrain-RGB tile, decodes elevation per pixel, computes the slope from the
 * neighbouring pixels (ground distance per pixel is derived from latitude and zoom) and paints it.
 * Pixels at or below sea level stay transparent.
 */
export function createSlopeOverlay(): L.GridLayer {
  const layer = new L.GridLayer({
    tileSize: TILE,
    minZoom: SLOPE_MIN_ZOOM,
    maxNativeZoom: TERRAIN_NATIVE_ZOOM,
    maxZoom: 22,
    noWrap: true,
    zIndex: 5,
    attribution:
      'Elevation: <a href="https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-rgb-v1/">Mapbox Terrain-RGB</a> / <a href="https://registry.opendata.aws/terrain-tiles/">AWS Terrain Tiles</a>',
  });

  // createTile is protected in Leaflet's typings but is the documented hook for custom grid layers.
  (layer as unknown as { createTile: (coords: L.Coords, done: L.DoneCallback) => HTMLElement }).createTile = (
    coords,
    done,
  ) => {
    const canvas = document.createElement("canvas");
    canvas.width = TILE;
    canvas.height = TILE;

    const render = (img: HTMLImageElement, kind: DemKind) => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      try {
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0, TILE, TILE);
        const src = ctx.getImageData(0, 0, TILE, TILE).data;
        const decode = kind === "mapbox" ? decodeMapbox : decodeTerrarium;
        const elev = new Float32Array(TILE * TILE);
        for (let i = 0; i < elev.length; i++) {
          const p = i * 4;
          elev[i] = decode(src[p], src[p + 1], src[p + 2]);
        }
        const lat = tileLatitude(coords.y, coords.z);
        const metresPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, coords.z);
        const out = ctx.createImageData(TILE, TILE);
        for (let y = 0; y < TILE; y++) {
          const yu = Math.max(y - 1, 0);
          const yd = Math.min(y + 1, TILE - 1);
          for (let x = 0; x < TILE; x++) {
            const idx = y * TILE + x;
            if (elev[idx] <= 0) continue; // sea / no data: leave transparent
            const xl = Math.max(x - 1, 0);
            const xr = Math.min(x + 1, TILE - 1);
            const dzdx = (elev[y * TILE + xr] - elev[y * TILE + xl]) / ((xr - xl) * metresPerPixel);
            const dzdy = (elev[yd * TILE + x] - elev[yu * TILE + x]) / ((yd - yu) * metresPerPixel);
            paintSlope((Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI, out.data, idx * 4);
          }
        }
        ctx.putImageData(out, 0, 0);
      } catch {
        ctx?.clearRect(0, 0, TILE, TILE);
      }
      done(undefined, canvas);
    };

    const load = (kind: DemKind) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => render(img, kind);
      img.onerror = () => {
        if (kind === "mapbox") {
          // Token rejected or Mapbox unreachable: switch to the free tiles for this and all later tiles.
          if (!demFallback) {
            demFallback = true;
            console.warn("[GreenMap] Mapbox Terrain-RGB tiles failed (check MAPBOX_TOKEN). Using AWS elevation tiles.");
            window.dispatchEvent(new CustomEvent(DEM_FALLBACK_EVENT));
          }
          load("aws");
        } else {
          done(undefined, canvas); // leave tile empty
        }
      };
      img.src = fillTemplate(kind === "mapbox" ? MAPBOX_TERRAIN_RGB : AWS_TERRARIUM, coords.z, coords.x, coords.y);
    };

    load(demFallback ? "aws" : "mapbox");
    return canvas;
  };

  return layer;
}

/**
 * Leaflet leaves a tile blank when its request fails once (rate limit, hiccup). This retries a failed tile up to
 * `maxRetries` times with a growing delay, so the base map fills in without needing a redraw.
 */
function withTileRetry<T extends L.TileLayer>(layer: T, maxRetries = 3): T {
  layer.on("tileerror", (e: L.TileErrorEvent) => {
    const img = e.tile as HTMLImageElement;
    const tries = Number(img.dataset.retries ?? "0");
    if (tries >= maxRetries) return;
    img.dataset.retries = String(tries + 1);
    const base = img.src.replace(/([?&])r=\d+$/, "");
    window.setTimeout(() => {
      img.src = `${base}${base.includes("?") ? "&" : "?"}r=${tries + 1}`;
    }, 700 * (tries + 1));
  });
  return layer;
}

/** Builds the two selectable base maps for the Leaflet layer control. */
export function createBaseLayers(): Record<BaseLayerName, L.Layer> {
  // Street Map: native tiles stop at z19; Leaflet upscales beyond that up to z22 instead of going blank.
  const street = withTileRetry(
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 22,
      maxNativeZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }),
  );

  // Terrain Height Map: plain OpenTopoMap (contours, hillshade, elevation colours) with nothing painted over it.
  // Slope colouring is a separate, optional overlay (createSlopeOverlay) so it can be switched off.
  const topo = withTileRetry(
    L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 22,
      maxNativeZoom: 17,
      subdomains: "abc",
      zIndex: 1,
      attribution:
        'Map: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>), data &copy; OpenStreetMap contributors',
    }),
  );

  return {
    "Street Map": street,
    "Terrain Height Map": topo,
  };
}

/**
 * Re-measures the map and repaints every tile layer. Call after the container size changes (e.g. fullscreen),
 * once the browser has finished laying the new size out.
 */
export function refreshMapSize(map: L.Map): void {
  map.invalidateSize({ animate: false, pan: false });
  map.eachLayer((layer) => {
    if (layer instanceof L.GridLayer) layer.redraw();
  });
}

/**
 * Standard Leaflet layer control (top-right): the two base maps as radio buttons plus optional overlays as
 * checkboxes (e.g. "District Boundaries"). The control and its corner container get `z-[9999]` so the widget
 * stays on top of the map, including in fullscreen.
 */
export function createLayersControl(
  map: L.Map,
  baseLayers: Record<BaseLayerName, L.Layer>,
  overlays: Record<string, L.Layer>,
  collapsed: boolean,
): L.Control.Layers {
  const control = L.control.layers(baseLayers, overlays, { position: "topright", collapsed, sortLayers: false }).addTo(map);
  const el = control.getContainer();
  el?.classList.add("z-[9999]");
  el?.parentElement?.classList.add("z-[9999]");
  return control;
}

/**
 * Safety net for fullscreen: makes sure the control's corner container lives inside `host` (the element
 * that is shown fullscreen) and re-applies the high z-index. Normally it is already inside the map container,
 * which is a child of `host`, so this is a no-op.
 */
export function keepControlInHost(control: L.Control.Layers, host: HTMLElement): void {
  const el = control.getContainer();
  if (!el) return;
  const corner = el.parentElement;
  if (corner && !host.contains(corner)) host.appendChild(corner);
  el.classList.add("z-[9999]");
  corner?.classList.add("z-[9999]");
}
