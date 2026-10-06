// Proxy data pesawat live (ADS-B). Dipanggil dari browser lewat /api/planes
// supaya tidak terkendala CORS. Mencoba dua sumber gratis berurutan.
export const dynamic = "force-dynamic";

const SOURCES = [
  (lat, lon, r) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${r}`,
  (lat, lon, r) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${r}`,
];

function pick(a) {
  return {
    hex: a.hex,
    flight: a.flight,
    lat: a.lat,
    lon: a.lon,
    alt_baro: a.alt_baro,
    alt_geom: a.alt_geom,
    gs: a.gs,
    track: a.track,
    t: a.t,
    r: a.r,
    dbFlags: a.dbFlags,
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  let r = Number(searchParams.get("r"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return Response.json({ error: "koordinat tidak valid" }, { status: 400 });
  }
  if (!Number.isFinite(r)) r = 100;
  r = Math.round(Math.min(250, Math.max(10, r)));
  const la = lat.toFixed(2);
  const lo = lon.toFixed(2);

  for (const build of SOURCES) {
    try {
      const res = await fetch(build(la, lo, r), {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = await res.json();
      const list = Array.isArray(json.ac) ? json.ac : Array.isArray(json.aircraft) ? json.aircraft : null;
      if (!list) continue;
      return Response.json(
        { ac: list.slice(0, 700).map(pick) },
        { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10" } }
      );
    } catch (e) {
      /* coba sumber berikutnya */
    }
  }
  return Response.json({ error: "sumber data pesawat tidak merespons" }, { status: 502 });
}
