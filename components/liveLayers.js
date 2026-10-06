// Lapisan data live untuk Hidaka Globe: pesawat, gempa, satelit.
// Semua dimatikan dari awal dan hanya bekerja saat dinyalakan dari menu.

const FT = 0.3048;
const KN = 0.514444;
const SAT_LIB = "https://cdn.jsdelivr.net/npm/satellite.js@5.0.0/dist/satellite.min.js";
const QUAKE_URL = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";

let satLibPromise = null;
function loadSatLib() {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.satellite) return Promise.resolve(window.satellite);
  if (satLibPromise) return satLibPromise;
  satLibPromise = new Promise((resolve, reject) => {
    const js = document.createElement("script");
    js.src = SAT_LIB;
    js.async = true;
    js.onload = () => (window.satellite ? resolve(window.satellite) : reject(new Error("sat")));
    js.onerror = () => {
      satLibPromise = null;
      reject(new Error("sat-load"));
    };
    document.head.appendChild(js);
  });
  return satLibPromise;
}

function makePlaneImage() {
  const c = document.createElement("canvas");
  c.width = 48;
  c.height = 48;
  const g = c.getContext("2d");
  const pts = [
    [24, 3], [27, 16], [45, 30], [45, 34], [27, 28], [26, 40], [32, 44], [32, 46],
    [24, 44.5], [16, 46], [16, 44], [22, 40], [21, 28], [3, 34], [3, 30], [21, 16],
  ];
  g.beginPath();
  pts.forEach((p, i) => (i === 0 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1])));
  g.closePath();
  g.lineJoin = "round";
  g.lineWidth = 3;
  g.strokeStyle = "rgba(4,6,12,0.8)";
  g.stroke();
  g.fillStyle = "#ffffff";
  g.fill();
  return c;
}

function ago(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return "baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  return `${h} jam ${m % 60} menit lalu`;
}

export function createLiveLayers(viewer, Cesium, cb) {
  const scene = viewer.scene;
  const rad = Cesium.Math.toRadians;
  const deg = Cesium.Math.toDegrees;
  const state = { planes: false, quakes: false, sats: false, traffic: false };
  let low = false;
  let dead = false;

  const planeBB = scene.primitives.add(new Cesium.BillboardCollection({ scene }));
  const quakePts = scene.primitives.add(new Cesium.PointPrimitiveCollection());
  const satPts = scene.primitives.add(new Cesium.PointPrimitiveCollection());
  const satLabels = scene.primitives.add(new Cesium.LabelCollection());
  const trafficPts = scene.primitives.add(new Cesium.PointPrimitiveCollection());
  [planeBB, quakePts, satPts, satLabels, trafficPts].forEach((c) => {
    c.show = false;
  });

  const render = () => {
    if (!dead && !viewer.isDestroyed()) scene.requestRender();
  };

  const viewCenter = () => {
    const canvas = scene.canvas;
    const mid = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
    const p = viewer.camera.pickEllipsoid(mid, scene.globe.ellipsoid);
    const c = Cesium.Cartographic.fromCartesian(p || viewer.camera.positionWC);
    return {
      lat: deg(c.latitude),
      lon: deg(c.longitude),
      h: viewer.camera.positionCartographic.height,
    };
  };

  // ---------- Pesawat ----------
  const planes = new Map();
  const planeImg = makePlaneImage();
  let planeTimer = null;
  let planeCtrl = null;
  let planeWarned = false;
  let planeFailed = false;

  function planeInfo(rec) {
    const d = rec.d;
    const call = (d.flight || "").trim() || d.r || String(d.hex).toUpperCase();
    const altFt = rec.alt / FT;
    const kmh = (d.gs || 0) * 1.852;
    const mil = typeof d.dbFlags === "number" && (d.dbFlags & 1) === 1;
    const rows = [];
    if (d.t) rows.push(["Tipe", d.t]);
    if (d.r) rows.push(["Registrasi", d.r]);
    rows.push(["Ketinggian", rec.alt <= 0 ? "Di darat" : `${Math.round(altFt).toLocaleString("id-ID")} ft (${Math.round(rec.alt).toLocaleString("id-ID")} m)`]);
    rows.push(["Kecepatan", `${Math.round(kmh)} km/j (${Math.round(d.gs || 0)} knot)`]);
    if (typeof d.track === "number") rows.push(["Arah", `${Math.round(d.track)} derajat`]);
    return {
      title: call,
      sub: mil ? "Pesawat militer (data ADS-B)" : "Pesawat live (data ADS-B)",
      rows,
      lat: rec.curLat,
      lon: rec.curLon,
      range: 90000,
    };
  }

  function applyPlanes(list) {
    const max = low ? 120 : 400;
    const seen = new Set();
    let n = 0;
    for (const a of list) {
      if (n >= max) break;
      if (!a || !a.hex || typeof a.lat !== "number" || typeof a.lon !== "number") continue;
      n += 1;
      seen.add(a.hex);
      let alt = 0;
      if (typeof a.alt_baro === "number") alt = a.alt_baro * FT;
      else if (a.alt_baro !== "ground" && typeof a.alt_geom === "number") alt = a.alt_geom * FT;
      let rec = planes.get(a.hex);
      if (!rec) {
        rec = { d: a, lat: a.lat, lon: a.lon, alt, t0: performance.now(), curLat: a.lat, curLon: a.lon, bb: null };
        rec.bb = planeBB.add({
          image: planeImg,
          position: Cesium.Cartesian3.fromDegrees(a.lon, a.lat, alt),
          scale: 0.55,
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          scaleByDistance: new Cesium.NearFarScalar(2e4, 1.25, 3e6, 0.4),
          id: { live: true, build: () => planeInfo(rec) },
        });
        planes.set(a.hex, rec);
      }
      rec.d = a;
      rec.lat = a.lat;
      rec.lon = a.lon;
      rec.alt = alt;
      rec.t0 = performance.now();
      rec.curLat = a.lat;
      rec.curLon = a.lon;
      const mil = typeof a.dbFlags === "number" && (a.dbFlags & 1) === 1;
      rec.bb.color = mil ? Cesium.Color.fromCssColorString("#ff6a3d") : Cesium.Color.WHITE;
      rec.bb.rotation = -rad(typeof a.track === "number" ? a.track : 0);
      rec.bb.position = Cesium.Cartesian3.fromDegrees(a.lon, a.lat, alt);
    }
    for (const [hex, rec] of planes) {
      if (!seen.has(hex)) {
        planeBB.remove(rec.bb);
        planes.delete(hex);
      }
    }
    render();
  }

  function stepPlanes() {
    const now = performance.now();
    for (const rec of planes.values()) {
      const dt = Math.min(30, (now - rec.t0) / 1000);
      const v = (rec.d.gs || 0) * KN;
      const tr = rad(typeof rec.d.track === "number" ? rec.d.track : 0);
      const lat = rec.lat + (v * dt * Math.cos(tr)) / 111320;
      const lon = rec.lon + (v * dt * Math.sin(tr)) / (111320 * Math.max(0.05, Math.cos(rad(rec.lat))));
      rec.curLat = lat;
      rec.curLon = lon;
      rec.bb.position = Cesium.Cartesian3.fromDegrees(lon, lat, rec.alt);
    }
  }

  async function pollPlanes() {
    if (dead || !state.planes) return;
    const { lat, lon, h } = viewCenter();
    if (h > 4000000) {
      if (!planeWarned) {
        planeWarned = true;
        cb.notice("Dekati dulu daerah yang mau dilihat, pesawat diambil di sekitar tengah layar.");
      }
      planeTimer = setTimeout(pollPlanes, 3000);
      return;
    }
    planeWarned = false;
    const r = Math.round(Math.min(250, Math.max(30, (h / 1852) * 0.8)));
    planeCtrl = new AbortController();
    try {
      const res = await fetch(`/api/planes?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&r=${r}`, {
        signal: planeCtrl.signal,
      });
      if (!res.ok) throw new Error("planes");
      const json = await res.json();
      planeFailed = false;
      if (!dead && state.planes) applyPlanes(json.ac || []);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      if (!planeFailed) {
        planeFailed = true;
        cb.notice("Data pesawat belum bisa diambil, mencoba lagi.");
      }
    }
    if (!dead && state.planes) planeTimer = setTimeout(pollPlanes, low ? 15000 : 8000);
  }

  function setPlanes(on) {
    state.planes = on;
    planeBB.show = on;
    clearTimeout(planeTimer);
    if (planeCtrl) planeCtrl.abort();
    if (on) {
      planeWarned = false;
      planeFailed = false;
      pollPlanes();
    } else {
      planeBB.removeAll();
      planes.clear();
    }
    render();
  }

  // ---------- Gempa ----------
  let quakeTimer = null;
  let quakeCtrl = null;
  let quakeFailed = false;

  async function loadQuakes() {
    if (dead || !state.quakes) return;
    quakeCtrl = new AbortController();
    try {
      const res = await fetch(QUAKE_URL, { signal: quakeCtrl.signal });
      if (!res.ok) throw new Error("quake");
      const json = await res.json();
      if (dead || !state.quakes) return;
      quakePts.removeAll();
      for (const f of json.features || []) {
        const p = f.properties || {};
        const g = f.geometry && f.geometry.coordinates;
        if (!g || typeof p.mag !== "number") continue;
        if (low && p.mag < 2.5) continue;
        const depth = g[2] || 0;
        const col = depth < 70 ? "#ff4d3d" : depth < 300 ? "#ffb23e" : "#3ec6ff";
        quakePts.add({
          position: Cesium.Cartesian3.fromDegrees(g[0], g[1], 0),
          pixelSize: Math.min(34, Math.max(5, p.mag * 3.6)),
          color: Cesium.Color.fromCssColorString(col).withAlpha(0.74),
          outlineColor: Cesium.Color.WHITE.withAlpha(0.9),
          outlineWidth: 1,
          id: {
            live: true,
            build: () => ({
              title: `M ${p.mag.toFixed(1)}`,
              sub: p.place || "Gempa bumi",
              rows: [
                ["Waktu", ago(p.time)],
                ["Kedalaman", `${Math.round(depth)} km`],
                ["Koordinat", `${g[1].toFixed(2)}, ${g[0].toFixed(2)}`],
              ],
              lat: g[1],
              lon: g[0],
              range: 450000,
            }),
          },
        });
      }
      quakeFailed = false;
      render();
    } catch (e) {
      if (e && e.name === "AbortError") return;
      if (!quakeFailed) {
        quakeFailed = true;
        cb.notice("Data gempa belum bisa diambil.");
      }
    }
    if (!dead && state.quakes) quakeTimer = setTimeout(loadQuakes, 300000);
  }

  function setQuakes(on) {
    state.quakes = on;
    quakePts.show = on;
    clearTimeout(quakeTimer);
    if (quakeCtrl) quakeCtrl.abort();
    if (on) {
      quakeFailed = false;
      loadQuakes();
    } else {
      quakePts.removeAll();
    }
    render();
  }

  // ---------- Satelit ----------
  let sats = null;
  let satLib = null;
  let satLoading = false;

  async function buildSats() {
    if (sats || satLoading) return;
    satLoading = true;
    try {
      const [lib, res] = await Promise.all([loadSatLib(), fetch("/api/sats")]);
      if (!res.ok) throw new Error("sats");
      const json = await res.json();
      if (dead) return;
      satLib = lib;
      let list = Array.isArray(json.sats) ? json.sats : [];
      if (low) list = list.filter((s) => s.st).concat(list.filter((s) => !s.st).slice(0, 40));
      sats = [];
      for (const s of list) {
        let rec;
        try {
          rec = lib.twoline2satrec(s.l1, s.l2);
        } catch (e) {
          continue;
        }
        const big = /ISS|CSS|TIANHE/i.test(s.name) && s.st;
        const entry = { name: s.name, rec, st: s.st, lat: 0, lon: 0, h: 0, v: 0, pt: null, label: null };
        entry.pt = satPts.add({
          position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
          pixelSize: big ? 10 : s.st ? 7 : 4,
          color: Cesium.Color.fromCssColorString(s.st ? "#ffb23e" : "#6fd3ff"),
          outlineColor: Cesium.Color.WHITE.withAlpha(0.85),
          outlineWidth: big ? 2 : 1,
          show: false,
          id: {
            live: true,
            build: () => ({
              title: entry.name,
              sub: s.st ? "Stasiun luar angkasa" : "Satelit (orbit dihitung dari data TLE)",
              rows: [
                ["Ketinggian", `${Math.round(entry.h / 1000)} km`],
                ["Kecepatan", `${Math.round(entry.v * 3600).toLocaleString("id-ID")} km/j`],
                ["Di atas", `${entry.lat.toFixed(2)}, ${entry.lon.toFixed(2)}`],
              ],
              lat: entry.lat,
              lon: entry.lon,
              range: 4500000,
            }),
          },
        });
        if (big) {
          entry.label = satLabels.add({
            text: s.name.replace(/\s*\(.*\)/, ""),
            font: "600 12px system-ui, sans-serif",
            fillColor: Cesium.Color.WHITE,
            outlineColor: Cesium.Color.fromCssColorString("#04060c"),
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset: new Cesium.Cartesian2(12, -4),
            show: false,
          });
        }
        sats.push(entry);
      }
      stepSats();
      render();
    } catch (e) {
      cb.notice("Data satelit belum bisa diambil.");
    } finally {
      satLoading = false;
    }
  }

  function stepSats() {
    if (!sats || !satLib) return;
    const date = new Date();
    const gmst = satLib.gstime(date);
    for (const s of sats) {
      let ok = false;
      try {
        const pv = satLib.propagate(s.rec, date);
        if (pv && pv.position && typeof pv.position.x === "number") {
          const gd = satLib.eciToGeodetic(pv.position, gmst);
          s.lat = satLib.degreesLat(gd.latitude);
          s.lon = satLib.degreesLong(gd.longitude);
          s.h = gd.height * 1000;
          if (pv.velocity) {
            s.v = Math.sqrt(pv.velocity.x ** 2 + pv.velocity.y ** 2 + pv.velocity.z ** 2);
          }
          const pos = Cesium.Cartesian3.fromDegrees(s.lon, s.lat, s.h);
          s.pt.position = pos;
          if (s.label) s.label.position = pos;
          ok = true;
        }
      } catch (e) {
        ok = false;
      }
      s.pt.show = ok && state.sats;
      if (s.label) s.label.show = ok && state.sats;
    }
  }

  function setSats(on) {
    state.sats = on;
    satPts.show = on;
    satLabels.show = on;
    if (on) {
      if (sats) stepSats();
      else buildSats();
    }
    render();
  }

  // ---------- Lalu lintas (simulasi di atas jalan OSM asli) ----------
  const OVERPASS = "https://overpass-api.de/api/interpreter";
  const ROAD_SPEED = { motorway: 22, trunk: 18, primary: 13, secondary: 11, tertiary: 9 };
  const M_DEG = 111320;
  let cars = [];
  let trafficCheck = null;
  let trafficAnim = null;
  let trafficCtrl = null;
  let loadedCenter = null;
  let lastFetch = 0;
  let lastStep = 0;
  let trafficFetching = false;
  let trafficWarned = false;
  let trafficFailed = false;

  function segLen(a, b) {
    const dx = (b.lon - a.lon) * M_DEG * Math.cos(rad((a.lat + b.lat) / 2));
    const dy = (b.lat - a.lat) * M_DEG;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function buildRoad(el) {
    const g = el.geometry;
    if (!g || g.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < g.length; i += 1) cum.push(cum[i - 1] + segLen(g[i - 1], g[i]));
    const len = cum[cum.length - 1];
    if (len < 30) return null;
    const tags = el.tags || {};
    let oneway = 0;
    if (tags.oneway === "yes" || tags.oneway === "true" || tags.oneway === "1" || tags.highway === "motorway") {
      oneway = 1;
    } else if (tags.oneway === "-1") {
      oneway = -1;
    }
    return { g, cum, len, oneway, v: ROAD_SPEED[tags.highway] || 9 };
  }

  function posAt(road, s) {
    const cum = road.cum;
    let i = 1;
    while (i < cum.length - 1 && cum[i] < s) i += 1;
    const a = road.g[i - 1];
    const b = road.g[i];
    const seg = cum[i] - cum[i - 1] || 1;
    const t = Math.min(1, Math.max(0, (s - cum[i - 1]) / seg));
    return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
  }

  function spawnCars(roads) {
    const max = low ? 50 : 140;
    trafficPts.removeAll();
    cars = [];
    const order = roads.slice().sort(() => Math.random() - 0.5);
    for (const road of order) {
      const n = Math.min(3, Math.max(1, Math.round(road.len / 160)));
      for (let k = 0; k < n && cars.length < max; k += 1) {
        const dir = road.oneway !== 0 ? road.oneway : Math.random() < 0.5 ? -1 : 1;
        const car = {
          road,
          s: Math.random() * road.len,
          dir,
          v: road.v * (0.7 + Math.random() * 0.5),
          h: 0,
          k: Math.floor(Math.random() * 15),
          pt: null,
        };
        const p = posAt(road, car.s);
        car.pt = trafficPts.add({
          position: Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 2),
          pixelSize: 5,
          color: Cesium.Color.fromCssColorString(Math.random() < 0.18 ? "#ff5a3c" : "#ffd27a"),
          outlineColor: Cesium.Color.fromCssColorString("#04060c").withAlpha(0.8),
          outlineWidth: 1,
          disableDepthTestDistance: 50000,
        });
        cars.push(car);
      }
      if (cars.length >= max) break;
    }
    render();
  }

  function stepTraffic() {
    if (dead || !state.traffic || viewer.isDestroyed()) return;
    const h = viewer.camera.positionCartographic.height;
    const visible = h < 12000;
    trafficPts.show = visible;
    if (!visible) return;
    const now = performance.now();
    const dt = Math.min(0.5, (now - lastStep) / 1000);
    lastStep = now;
    for (const c of cars) {
      c.s += c.dir * c.v * dt * 1.5;
      const L = c.road.len;
      if (c.s > L) {
        if (c.road.oneway !== 0) c.s = 0;
        else {
          c.s = L;
          c.dir = -1;
        }
      } else if (c.s < 0) {
        if (c.road.oneway !== 0) c.s = L;
        else {
          c.s = 0;
          c.dir = 1;
        }
      }
      const p = posAt(c.road, c.s);
      c.k += 1;
      if (c.k % 15 === 0) {
        const gh = scene.globe.getHeight(Cesium.Cartographic.fromDegrees(p.lon, p.lat));
        if (typeof gh === "number") c.h = gh;
      }
      c.pt.position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, c.h + 2);
    }
    scene.requestRender();
  }

  async function fetchRoads(lat, lon) {
    trafficFetching = true;
    lastFetch = Date.now();
    trafficCtrl = new AbortController();
    const dLat = 0.012;
    const dLon = 0.012 / Math.max(0.2, Math.cos(rad(lat)));
    const bbox = `${(lat - dLat).toFixed(5)},${(lon - dLon).toFixed(5)},${(lat + dLat).toFixed(5)},${(lon + dLon).toFixed(5)}`;
    const q = `[out:json][timeout:20];way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](${bbox});out geom 350;`;
    try {
      const res = await fetch(`${OVERPASS}?data=${encodeURIComponent(q)}`, { signal: trafficCtrl.signal });
      if (!res.ok) throw new Error("overpass");
      const json = await res.json();
      if (dead || !state.traffic) return;
      const roads = [];
      for (const el of json.elements || []) {
        if (el.type !== "way") continue;
        const r = buildRoad(el);
        if (r) roads.push(r);
      }
      loadedCenter = { lat, lon };
      if (roads.length === 0) cb.notice("Belum ada data jalan besar di area ini.");
      spawnCars(roads);
      trafficFailed = false;
    } catch (e) {
      if (e && e.name === "AbortError") return;
      if (!trafficFailed) {
        trafficFailed = true;
        cb.notice("Data jalan belum bisa diambil, coba lagi sebentar.");
      }
    } finally {
      trafficFetching = false;
    }
  }

  function checkTraffic() {
    if (dead || !state.traffic) return;
    const { lat, lon, h } = viewCenter();
    if (h >= 12000) {
      if (!trafficWarned) {
        trafficWarned = true;
        cb.notice("Dekati kota dulu (di bawah sekitar 12 km) buat melihat lalu lintas.");
      }
    } else {
      trafficWarned = false;
      if (!trafficFetching && Date.now() - lastFetch > 8000) {
        const far =
          !loadedCenter ||
          Math.abs(lat - loadedCenter.lat) > 0.007 ||
          Math.abs(lon - loadedCenter.lon) > 0.007;
        if (far) fetchRoads(lat, lon);
      }
    }
    trafficCheck = setTimeout(checkTraffic, 3000);
  }

  function setTraffic(on) {
    state.traffic = on;
    trafficPts.show = on;
    clearTimeout(trafficCheck);
    clearInterval(trafficAnim);
    if (trafficCtrl) trafficCtrl.abort();
    if (on) {
      trafficWarned = false;
      trafficFailed = false;
      loadedCenter = null;
      lastStep = performance.now();
      checkTraffic();
      trafficAnim = setInterval(stepTraffic, low ? 200 : 130);
    } else {
      trafficPts.removeAll();
      cars = [];
      loadedCenter = null;
    }
    render();
  }

  // ---------- Siklus bersama ----------
  const ticker = setInterval(() => {
    if (dead || viewer.isDestroyed()) return;
    let any = false;
    if (state.planes) {
      stepPlanes();
      any = true;
    }
    if (state.sats) {
      stepSats();
      any = true;
    }
    if (any) scene.requestRender();
  }, 1000);

  return {
    set(name, on) {
      if (name === "planes") setPlanes(!!on);
      else if (name === "quakes") setQuakes(!!on);
      else if (name === "sats") setSats(!!on);
      else if (name === "traffic") setTraffic(!!on);
    },
    setLow(v) {
      low = !!v;
    },
    counts() {
      return {
        planes: planes.size,
        quakes: state.quakes ? quakePts.length : 0,
        sats: state.sats && sats ? sats.length : 0,
        cars: state.traffic ? cars.length : 0,
      };
    },
    pick(pos) {
      const p = scene.pick(pos);
      if (p && p.id && p.id.live) {
        cb.onInfo(p.id.build());
        return true;
      }
      return false;
    },
    destroy() {
      dead = true;
      clearInterval(ticker);
      clearTimeout(planeTimer);
      clearTimeout(quakeTimer);
      clearTimeout(trafficCheck);
      clearInterval(trafficAnim);
      if (trafficCtrl) trafficCtrl.abort();
      if (planeCtrl) planeCtrl.abort();
      if (quakeCtrl) quakeCtrl.abort();
      if (!viewer.isDestroyed()) {
        [planeBB, quakePts, satPts, satLabels, trafficPts].forEach((c) => {
          try {
            scene.primitives.remove(c);
          } catch (e) {
            /* abaikan */
          }
        });
      }
    },
  };
}
