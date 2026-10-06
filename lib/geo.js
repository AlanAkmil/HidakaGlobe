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
