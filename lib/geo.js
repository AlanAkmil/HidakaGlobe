export const CESIUM_VERSION = "1.136";
export const CESIUM_BASE = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`;

const NOMINATIM = "https://nominatim.openstreetmap.org";

export function writePref(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* penyimpanan diblokir, abaikan */
  }
}

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function formatCoord(lat, lon) {
  const ns = lat >= 0 ? "LU" : "LS";
  const ew = lon >= 0 ? "BT" : "BB";
  return `${Math.abs(lat).toFixed(3)}° ${ns}, ${Math.abs(lon).toFixed(3)}° ${ew}`;
}

export function formatAltitude(m) {
  if (!Number.isFinite(m)) return "--";
  if (m >= 10000) return `${Math.round(m / 1000).toLocaleString("id-ID")} km`;
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.max(0, Math.round(m))} m`;
}

// Terima "-6.2, 106.8" atau "-6.2 106.8" (lat lalu lon, desimal pakai titik)
export function parseCoords(text) {
  const m = String(text)
    .trim()
    .match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export async function searchPlaces(query, signal) {
  const url = `${NOMINATIM}/search?format=jsonv2&limit=6&accept-language=id&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Pencarian gagal (${res.status})`);
  const data = await res.json();
  return data.map((r) => ({
    id: String(r.place_id),
    name: r.name || String(r.display_name).split(",")[0].trim(),
    address: r.display_name,
    lat: Number(r.lat),
    lon: Number(r.lon),
    bbox: Array.isArray(r.boundingbox) ? r.boundingbox.map(Number) : null,
  }));
}

export async function reversePlace(lat, lon) {
  const url = `${NOMINATIM}/reverse?format=jsonv2&zoom=18&accept-language=id&lat=${lat}&lon=${lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Reverse geocode gagal (${res.status})`);
  const r = await res.json();
  if (!r || r.error) return null;
  const first = String(r.display_name || "").split(",")[0].trim();
  return { name: r.name || first, address: r.display_name || "" };
}

export const MAPILLARY_VERSION = "4.1.2";
const MLY_BASE = `https://unpkg.com/mapillary-js@${MAPILLARY_VERSION}/dist`;

let mlyPromise = null;

// Muat MapillaryJS hanya saat Street View pertama kali dibuka
export function loadMapillary() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.mapillary) return Promise.resolve(window.mapillary);
  if (mlyPromise) return mlyPromise;
  mlyPromise = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${MLY_BASE}/mapillary.css`;
    document.head.appendChild(css);
    const js = document.createElement("script");
    js.src = `${MLY_BASE}/mapillary.js`;
    js.async = true;
    js.onload = () => (window.mapillary ? resolve(window.mapillary) : reject(new Error("mly")));
    js.onerror = () => {
      mlyPromise = null;
      reject(new Error("mly-load"));
    };
    document.head.appendChild(js);
  });
  return mlyPromise;
}

// Cari foto jalan Mapillary terdekat, utamakan foto panorama 360 yang masih dekat
export async function findNearestImage(lat, lon, token, signal) {
  const d = 0.0010;
  const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
  const url =
    `https://graph.mapillary.com/images?access_token=${encodeURIComponent(token)}` +
    `&fields=id,computed_geometry,is_pano&bbox=${bbox}&limit=120`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error("mly-api");
  const json = await res.json();
  const list = Array.isArray(json.data) ? json.data : [];
  let any = null;
  let anyD = Infinity;
  let pano = null;
  let panoD = Infinity;
  for (const img of list) {
    const c = img.computed_geometry && img.computed_geometry.coordinates;
    if (!c) continue;
    const dx = (c[0] - lon) * Math.cos((lat * Math.PI) / 180);
    const dy = c[1] - lat;
    const dist = dx * dx + dy * dy;
    if (dist < anyD) {
      anyD = dist;
      any = img.id;
    }
    if (img.is_pano && dist < panoD) {
      panoD = dist;
      pano = img.id;
    }
  }
  // panorama dipakai kalau jaraknya masih sekitar 80 m
  if (pano && panoD <= 0.0008 * 0.0008) return pano;
  return any;
}

export function googleStreetUrl(lat, lon) {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`;
}
