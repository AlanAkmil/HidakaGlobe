"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import {
  IconBrand,
  IconCheck,
  IconClose,
  IconCompass,
  IconCopy,
  IconLayers,
  IconLocate,
  IconMoon,
  IconSearch,
  IconSun,
  IconTilt,
} from "./Icons";
import {
  CESIUM_BASE,
  formatAltitude,
  formatCoord,
  parseCoords,
  prefersReducedMotion,
  reversePlace,
  searchPlaces,
  writePref,
} from "../lib/geo";

const TOKEN = process.env.NEXT_PUBLIC_CESIUM_TOKEN || "";
const HAS_TOKEN = TOKEN.length > 0;
const BING_AERIAL_ASSET = 2;
const GOOGLE_3D_ASSET = 2275207;
const INTRO = { lon: 118, lat: -2, range: 4200000, pitch: -58 };

const BASES = [
  { id: "satelit", label: "Satelit" },
  { id: "jalan", label: "Jalan" },
  { id: "gelap", label: "Gelap" },
];

// Penanda tempat: tetes air putih dengan isi oranye, digambar sekali di canvas
function makePinImage() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 84;
  const g = c.getContext("2d");
  const body = () => {
    g.beginPath();
    g.moveTo(32, 80);
    g.bezierCurveTo(16, 60, 6, 48, 6, 32);
    g.arc(32, 32, 26, Math.PI, 0, false);
    g.bezierCurveTo(58, 48, 48, 60, 32, 80);
    g.closePath();
  };
  g.shadowColor = "rgba(0,0,0,0.45)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 3;
  body();
  g.fillStyle = "#ffffff";
  g.fill();
  g.shadowColor = "transparent";
  g.save();
  g.translate(32, 32);
  g.scale(0.84, 0.84);
  g.translate(-32, -32);
  body();
  g.fillStyle = "#ff9f1c";
  g.fill();
  g.restore();
  g.fillStyle = "#ffffff";
  g.beginPath();
  g.arc(32, 32, 8, 0, Math.PI * 2);
  g.fill();
  return c;
}

function Switch({ id, label, hint, checked, onChange, disabled }) {
  return (
    <div className={`row ${disabled ? "is-disabled" : ""}`}>
      <div className="row-text">
        <label htmlFor={id} className="row-title">
          {label}
        </label>
        <p className="row-hint" id={`${id}-hint`}>
          {hint}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-hint`}
        disabled={disabled}
        className="switch"
        onClick={onChange}
      >
        <span />
      </button>
    </div>
  );
}

export default function GlobeApp() {
  const containerRef = useRef(null);
  const creditRef = useRef(null);
  const viewerRef = useRef(null);
  const pinRef = useRef(null);
  const meRef = useRef(null);
  const altRef = useRef(null);
  const centerRef = useRef(null);
  const compassRef = useRef(null);
  const inputRef = useRef(null);
  const baseLayerRef = useRef(null);
  const tilesRef = useRef({
    buildings: null,
    photo: null,
    buildingsPromise: null,
    photoPromise: null,
  });
  const searchAbort = useRef(null);
  const reverseId = useRef(0);
  const toastTimer = useRef(null);
  const copyTimer = useRef(null);
  const lowRef = useRef(false);
  const tapRef = useRef(() => {});

  const [scriptReady, setScriptReady] = useState(false);
  const [scriptFailed, setScriptFailed] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [fatal, setFatal] = useState("");
  const [introDone, setIntroDone] = useState(false);

  const [theme, setTheme] = useState("light");
  const [low, setLow] = useState(false);
  const [base, setBase] = useState("satelit");
  const [opts, setOpts] = useState({ terrain: true, buildings: true, photo: false });
  const [panel, setPanel] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const [place, setPlace] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    if (msg) toastTimer.current = setTimeout(() => setToast(""), 3600);
  }, []);

  // Baca preferensi yang sudah dipasang skrip awal di layout
  useEffect(() => {
    const root = document.documentElement;
    setTheme(root.dataset.theme === "dark" ? "dark" : "light");
    const isLow = root.dataset.perf === "low";
    setLow(isLow);
    if (isLow) setOpts((o) => ({ ...o, buildings: false }));
    if (window.Cesium) setScriptReady(true);
    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(copyTimer.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setSearchOpen(false);
        setPanel(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Buat viewer Cesium sekali setelah skrip siap
  useEffect(() => {
    if (!scriptReady || viewerRef.current) return undefined;
    const Cesium = window.Cesium;
    if (!Cesium) {
      setScriptFailed(true);
      return undefined;
    }

    let viewer;
    try {
      if (HAS_TOKEN) Cesium.Ion.defaultAccessToken = TOKEN;
      viewer = new Cesium.Viewer(containerRef.current, {
        baseLayer: false,
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        sceneModePicker: false,
        navigationHelpButton: false,
        animation: false,
        timeline: false,
        fullscreenButton: false,
        vrButton: false,
        infoBox: false,
        selectionIndicator: false,
        shouldAnimate: false,
        scene3DOnly: true,
        orderIndependentTranslucency: false,
        requestRenderMode: true,
        maximumRenderTimeChange: Infinity,
        creditContainer: creditRef.current,
      });
    } catch (err) {
      console.error(err);
      setFatal(
        "Browser atau perangkat ini tidak mendukung WebGL, yang dibutuhkan untuk menampilkan globe."
      );
      setIntroDone(true);
      return undefined;
    }

    viewerRef.current = viewer;
    const scene = viewer.scene;
    const camera = viewer.camera;
    scene.sun.show = false;
    scene.moon.show = false;
    scene.backgroundColor = Cesium.Color.fromCssColorString("#04060c");
    scene.screenSpaceCameraController.minimumZoomDistance = 40;
    scene.screenSpaceCameraController.maximumZoomDistance = 45000000;
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(
      Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
    );

    camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(100, 5, 26000000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    });

    // Ketuk globe untuk menandai tempat
    const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    handler.setInputAction((movement) => {
      tapRef.current(movement.position);
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // Bacaan kamera di footer, ditulis langsung ke DOM supaya tidak memicu render React
    const updateReadout = () => {
      if (viewer.isDestroyed()) return;
      if (altRef.current) {
        altRef.current.textContent = formatAltitude(camera.positionCartographic.height);
      }
      if (compassRef.current) {
        compassRef.current.style.transform = `rotate(${-camera.heading}rad)`;
      }
      if (centerRef.current) {
        const canvas = scene.canvas;
        const mid = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2);
        const p = camera.pickEllipsoid(mid, scene.globe.ellipsoid);
        if (p) {
          const c = Cesium.Cartographic.fromCartesian(p);
          centerRef.current.textContent = formatCoord(
            Cesium.Math.toDegrees(c.latitude),
            Cesium.Math.toDegrees(c.longitude)
          );
        } else {
          centerRef.current.textContent = "";
        }
      }
    };
    let last = 0;
    const onPost = () => {
      const now = performance.now();
      if (now - last < (lowRef.current ? 380 : 180)) return;
      last = now;
      updateReadout();
    };
    scene.postRender.addEventListener(onPost);
    camera.moveEnd.addEventListener(updateReadout);

    // Pembuka: terbang dari luar angkasa ke Nusantara
    const finishIntro = () => setIntroDone(true);
    const introTimer = setTimeout(finishIntro, 7000);
    camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(INTRO.lon, INTRO.lat), 0),
      {
        duration: prefersReducedMotion() ? 0 : 5,
        offset: new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(INTRO.pitch),
          INTRO.range
        ),
        easingFunction: Cesium.EasingFunction.CUBIC_OUT,
        complete: () => {
          clearTimeout(introTimer);
          finishIntro();
        },
        cancel: finishIntro,
      }
    );
    setViewerReady(true);

    return () => {
      clearTimeout(introTimer);
      handler.destroy();
      if (!viewer.isDestroyed()) {
        scene.postRender.removeEventListener(onPost);
        camera.moveEnd.removeEventListener(updateReadout);
        viewer.destroy();
      }
      viewerRef.current = null;
      pinRef.current = null;
      meRef.current = null;
      baseLayerRef.current = null;
      tilesRef.current = {
        buildings: null,
        photo: null,
        buildingsPromise: null,
        photoPromise: null,
      };
      setViewerReady(false);
    };
  }, [scriptReady]);

  // Pengaturan kinerja (mode hemat)
  useEffect(() => {
    lowRef.current = low;
    const viewer = viewerRef.current;
    if (!viewer || !viewerReady) return;
    const scene = viewer.scene;
    const dpr = window.devicePixelRatio || 1;
    viewer.resolutionScale = low ? 1 : Math.min(dpr, 1.5);
    try {
      scene.msaaSamples = low ? 1 : 2;
    } catch {
      /* tidak didukung, abaikan */
    }
    scene.globe.maximumScreenSpaceError = low ? 4 : 2;
    scene.globe.tileCacheSize = low ? 40 : 100;
    scene.globe.showGroundAtmosphere = !low;
    scene.globe.enableLighting = false;
    scene.fog.enabled = !low;
    if (scene.skyBox) scene.skyBox.show = !low;
    const t = tilesRef.current;
    if (t.buildings) t.buildings.maximumScreenSpaceError = low ? 32 : 16;
    if (t.photo) t.photo.maximumScreenSpaceError = low ? 24 : 16;
    scene.requestRender();
  }, [low, viewerReady]);

  // Peta dasar
  useEffect(() => {
    if (!viewerReady) return undefined;
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    let cancelled = false;

    (async () => {
      let provider;
      try {
        if (base === "satelit") {
          provider = HAS_TOKEN
            ? await Cesium.IonImageryProvider.fromAssetId(BING_AERIAL_ASSET)
            : new Cesium.UrlTemplateImageryProvider({
                url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                maximumLevel: 19,
                credit: "Citra: Esri, Maxar, Earthstar Geographics",
              });
        } else if (base === "gelap") {
          provider = new Cesium.UrlTemplateImageryProvider({
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
            maximumLevel: 16,
            credit: "Peta: Esri, HERE, Garmin, OpenStreetMap contributors",
          });
        } else {
          provider = new Cesium.OpenStreetMapImageryProvider({
            url: "https://tile.openstreetmap.org/",
            credit: "Peta: OpenStreetMap contributors",
          });
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) showToast("Lapisan peta gagal dimuat.");
        return;
      }
      if (cancelled || viewer.isDestroyed()) return;
      const layer = new Cesium.ImageryLayer(provider);
      const old = baseLayerRef.current;
      viewer.imageryLayers.add(layer);
      baseLayerRef.current = layer;
      if (old) viewer.imageryLayers.remove(old, true);
      viewer.scene.requestRender();
    })();

    return () => {
      cancelled = true;
    };
  }, [base, viewerReady, showToast]);

  // Medan 3D
  useEffect(() => {
    if (!viewerReady) return;
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (opts.terrain && HAS_TOKEN) {
      const terrain = Cesium.Terrain.fromWorldTerrain({
        requestVertexNormals: false,
        requestWaterMask: false,
      });
      terrain.errorEvent.addEventListener(() => showToast("Data medan 3D gagal dimuat."));
      viewer.scene.setTerrain(terrain);
    } else {
      viewer.scene.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    }
    viewer.scene.requestRender();
  }, [opts.terrain, viewerReady, showToast]);

  // Gedung 3D dan foto kota 3D
  useEffect(() => {
    if (!viewerReady || !HAS_TOKEN) return undefined;
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    const tiles = tilesRef.current;
    let cancelled = false;
    const wantPhoto = opts.photo;
    const wantBuildings = opts.buildings && !opts.photo;

    (async () => {
      try {
        if (wantBuildings) {
          if (!tiles.buildingsPromise) {
            tiles.buildingsPromise = Cesium.createOsmBuildingsAsync()
              .then((ts) => {
                ts.maximumScreenSpaceError = lowRef.current ? 32 : 16;
                viewer.scene.primitives.add(ts);
                tiles.buildings = ts;
                return ts;
              })
              .catch((err) => {
                tiles.buildingsPromise = null;
                throw err;
              });
          }
          const ts = await tiles.buildingsPromise;
          if (cancelled) return;
          ts.show = true;
        } else if (tiles.buildings) {
          tiles.buildings.show = false;
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          showToast("Gedung 3D gagal dimuat.");
          setOpts((o) => ({ ...o, buildings: false }));
        }
      }

      try {
        if (wantPhoto) {
          if (!tiles.photoPromise) {
            tiles.photoPromise = Cesium.Cesium3DTileset.fromIonAssetId(GOOGLE_3D_ASSET)
              .then((ts) => {
                ts.maximumScreenSpaceError = lowRef.current ? 24 : 16;
                viewer.scene.primitives.add(ts);
                tiles.photo = ts;
                return ts;
              })
              .catch((err) => {
                tiles.photoPromise = null;
                throw err;
              });
          }
          const ts = await tiles.photoPromise;
          if (cancelled) return;
          ts.show = true;
          viewer.scene.globe.show = false;
        } else {
          viewer.scene.globe.show = true;
          if (tiles.photo) tiles.photo.show = false;
        }
      } catch (err) {
        console.error(err);
        viewer.scene.globe.show = true;
        if (!cancelled) {
          showToast(
            "Foto kota gagal dimuat. Tambahkan aset Google Photorealistic 3D Tiles ke akun ion dulu."
          );
          setOpts((o) => ({ ...o, photo: false }));
        }
      }
      if (!viewer.isDestroyed()) viewer.scene.requestRender();
    })();

    return () => {
      cancelled = true;
    };
  }, [opts.buildings, opts.photo, viewerReady, showToast]);

  const flyToPlace = useCallback(async (lat, lon, opt = {}) => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;
    let range = opt.range || 1400;
    if (opt.bbox && opt.bbox.length === 4) {
      const [s, n, w, e] = opt.bbox;
      const span = Math.max(
        Math.abs(n - s),
        Math.abs(e - w) * Math.cos((lat * Math.PI) / 180)
      );
      range = Math.min(Math.max(span * 111000 * 1.7, 700), 9000000);
    }
    let ground = 0;
    if (
      range < 300000 &&
      !(viewer.terrainProvider instanceof Cesium.EllipsoidTerrainProvider)
    ) {
      try {
        const [c] = await Cesium.sampleTerrainMostDetailed(viewer.terrainProvider, [
          Cesium.Cartographic.fromDegrees(lon, lat),
        ]);
        ground = c.height || 0;
      } catch {
        ground = 0;
      }
    }
    if (viewer.isDestroyed()) return;
    viewer.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lon, lat, ground), 0),
      {
        duration: prefersReducedMotion() ? 0 : range > 1000000 ? 3 : 2.2,
        offset: new Cesium.HeadingPitchRange(
          0,
          Cesium.Math.toRadians(range > 600000 ? -90 : -48),
          range
        ),
      }
    );
  }, []);

  const placePin = useCallback((lat, lon) => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;
    const pos = Cesium.Cartesian3.fromDegrees(lon, lat);
    if (!pinRef.current) {
      pinRef.current = viewer.entities.add({
        position: pos,
        billboard: {
          image: makePinImage(),
          scale: 0.5,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    } else {
      pinRef.current.position = pos;
    }
    viewer.scene.requestRender();
  }, []);

  const openPlace = useCallback(
    async (lat, lon, info = {}) => {
      placePin(lat, lon);
      setPanel(false);
      setSearchOpen(false);
      setCopied(false);
      const id = ++reverseId.current;
      setPlace({
        name: info.name || "Titik terpilih",
        address: info.address || "",
        lat,
        lon,
        height: info.height ?? null,
        loading: !info.name,
      });
      setSheetOpen(true);
      if (info.name) return;
      try {
        const r = await reversePlace(lat, lon);
        if (id !== reverseId.current) return;
        setPlace((p) =>
          p
            ? {
                ...p,
                name: (r && r.name) || "Titik terpilih",
                address: (r && r.address) || "Alamat tidak ditemukan",
                loading: false,
              }
            : p
        );
      } catch {
        if (id !== reverseId.current) return;
        setPlace((p) =>
          p ? { ...p, address: "Alamat tidak bisa dimuat.", loading: false } : p
        );
      }
    },
    [placePin]
  );

  const closePlace = () => {
    reverseId.current += 1;
    setSheetOpen(false);
    const viewer = viewerRef.current;
    if (pinRef.current && viewer && !viewer.isDestroyed()) {
      viewer.entities.remove(pinRef.current);
      pinRef.current = null;
      viewer.scene.requestRender();
    }
  };

  // Handler ketuk globe selalu memakai versi fungsi terbaru
  tapRef.current = (pos) => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;
    const scene = viewer.scene;
    setSearchOpen(false);
    setPanel(false);
    if (inputRef.current) inputRef.current.blur();
    let cart;
    if (scene.globe.show) {
      const ray = viewer.camera.getPickRay(pos);
      cart = ray ? scene.globe.pick(ray, scene) : undefined;
    } else if (scene.pickPositionSupported) {
      cart = scene.pickPosition(pos);
    }
    if (!cart) return;
    const c = Cesium.Cartographic.fromCartesian(cart);
    openPlace(Cesium.Math.toDegrees(c.latitude), Cesium.Math.toDegrees(c.longitude), {
      height: c.height,
    });
  };

  const onSearch = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (inputRef.current) inputRef.current.blur();
    const coords = parseCoords(q);
    if (coords) {
      setResults([]);
      setSearchMsg("");
      openPlace(coords.lat, coords.lon);
      flyToPlace(coords.lat, coords.lon, { range: 1400 });
      return;
    }
    if (searchAbort.current) searchAbort.current.abort();
    const ctrl = new AbortController();
    searchAbort.current = ctrl;
    setSearching(true);
    setSearchMsg("");
    setResults([]);
    setSearchOpen(true);
    setPanel(false);
    try {
      const found = await searchPlaces(q, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setResults(found);
      if (!found.length) {
        setSearchMsg(
          "Tempat tidak ditemukan. Coba nama yang lebih spesifik atau tulis koordinat, contoh: -6.2, 106.8"
        );
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setSearchMsg("Pencarian gagal. Cek koneksi lalu coba lagi.");
    } finally {
      if (!ctrl.signal.aborted) setSearching(false);
    }
  };

  const pickResult = (r) => {
    setQuery(r.name);
    setSearchOpen(false);
    openPlace(r.lat, r.lon, { name: r.name, address: r.address });
    flyToPlace(r.lat, r.lon, { bbox: r.bbox });
  };

  const clearQuery = () => {
    if (searchAbort.current) searchAbort.current.abort();
    setQuery("");
    setResults([]);
    setSearchMsg("");
    setSearching(false);
    setSearchOpen(false);
    if (inputRef.current) inputRef.current.focus();
  };

  const toggleTilt = () => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;
    const cam = viewer.camera;
    const scene = viewer.scene;
    const mid = new Cesium.Cartesian2(
      scene.canvas.clientWidth / 2,
      scene.canvas.clientHeight / 2
    );
    const ray = cam.getPickRay(mid);
    const target =
      (scene.globe.show && ray ? scene.globe.pick(ray, scene) : undefined) ||
      cam.pickEllipsoid(mid, scene.globe.ellipsoid);
    if (!target) {
      showToast("Arahkan kamera ke permukaan bumi dulu.");
      return;
    }
    const range = Cesium.Cartesian3.distance(cam.positionWC, target);
    const tilted = cam.pitch > Cesium.Math.toRadians(-75);
    cam.flyToBoundingSphere(new Cesium.BoundingSphere(target, 0), {
      duration: prefersReducedMotion() ? 0 : 1.1,
      offset: new Cesium.HeadingPitchRange(
        cam.heading,
        Cesium.Math.toRadians(tilted ? -90 : -45),
        range
      ),
    });
  };

  const resetNorth = () => {
    const viewer = viewerRef.current;
    const Cesium = window.Cesium;
    if (!viewer || !Cesium) return;
    const cam = viewer.camera;
    cam.flyTo({
      destination: cam.positionWC.clone(),
      orientation: { heading: 0, pitch: cam.pitch, roll: 0 },
      duration: prefersReducedMotion() ? 0 : 0.7,
    });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      showToast("Perangkat ini tidak mendukung lokasi.");
      return;
    }
    showToast("Mencari lokasi...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const viewer = viewerRef.current;
        const Cesium = window.Cesium;
        if (!viewer || !Cesium) return;
        const { latitude: lat, longitude: lon } = pos.coords;
        const p = Cesium.Cartesian3.fromDegrees(lon, lat);
        if (!meRef.current) {
          meRef.current = viewer.entities.add({
            position: p,
            point: {
              pixelSize: 14,
              color: Cesium.Color.fromCssColorString("#1e6bff"),
              outlineColor: Cesium.Color.WHITE,
              outlineWidth: 3,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          });
        } else {
          meRef.current.position = p;
        }
        showToast("");
        flyToPlace(lat, lon, { range: 1800 });
      },
      (err) => {
        showToast(
          err.code === 1
            ? "Izin lokasi ditolak. Aktifkan lewat pengaturan browser."
            : "Lokasi tidak ditemukan. Coba lagi."
        );
      },
      { enableHighAccuracy: !low, timeout: 12000, maximumAge: 60000 }
    );
  };

  const copyCoords = async () => {
    if (!place) return;
    const text = `${place.lat.toFixed(6)}, ${place.lon.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* abaikan */
      }
      ta.remove();
    }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1800);
  };

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    writePref("hg-theme", next);
  };

  const toggleLow = () => {
    const next = !low;
    setLow(next);
    document.documentElement.dataset.perf = next ? "low" : "normal";
    writePref("hg-perf", next ? "low" : "normal");
    if (next) setOpts((o) => ({ ...o, buildings: false, photo: false }));
  };

  const flip = (key) => setOpts((o) => ({ ...o, [key]: !o[key] }));

  const showElev =
    place &&
    place.height != null &&
    opts.terrain &&
    HAS_TOKEN &&
    !opts.photo;
  const dockOpen = (sheetOpen && !!place) || panel;
  const resultsVisible =
    searchOpen && (searching || !!searchMsg || results.length > 0);

  return (
    <div
      className={`app ${introDone ? "ready" : ""} ${dockOpen ? "dock-open" : ""}`}
    >
      <Script
        src={`${CESIUM_BASE}/Cesium.js`}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => setScriptFailed(true)}
      />

      <div ref={containerRef} className="globe" />

      <header className="top">
        <h1 className="sr-only">Hidaka Globe</h1>
        <form className="search glass" onSubmit={onSearch} role="search">
          <span className="brand-mark">
            <IconBrand />
          </span>
          <input
            ref={inputRef}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Cari tempat atau koordinat"
            aria-label="Cari tempat atau koordinat"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setSearchOpen(true)}
          />
          {query && (
            <button
              type="button"
              className="icon-btn"
              onClick={clearQuery}
              aria-label="Hapus pencarian"
            >
              <IconClose />
            </button>
          )}
          <button type="submit" className="icon-btn go" aria-label="Cari">
            <IconSearch />
          </button>
        </form>

        {resultsVisible && (
          <ul className="results">
            {searching && <li className="results-msg">Mencari...</li>}
            {!searching && searchMsg && <li className="results-msg">{searchMsg}</li>}
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" className="result" onClick={() => pickResult(r)}>
                  <span className="result-name">{r.name}</span>
                  <span className="result-addr">{r.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </header>

      <nav className="stack glass" aria-label="Kontrol peta">
        <button
          type="button"
          className="tool"
          title="Tampilan peta"
          aria-label="Tampilan peta"
          aria-expanded={panel}
          onClick={() => {
            setPanel((p) => !p);
            setSearchOpen(false);
          }}
        >
          <IconLayers />
        </button>
        <button
          type="button"
          className="tool"
          title="Ganti sudut pandang 3D"
          aria-label="Ganti sudut pandang 3D"
          onClick={toggleTilt}
        >
          <IconTilt />
        </button>
        <button
          type="button"
          className="tool"
          title="Lokasi saya"
          aria-label="Lokasi saya"
          onClick={locate}
        >
          <IconLocate />
        </button>
        <button
          type="button"
          className="tool compass"
          title="Arahkan ke utara"
          aria-label="Arahkan ke utara"
          onClick={resetNorth}
        >
          <span ref={compassRef} className="compass-dial">
            <IconCompass />
          </span>
        </button>
        <button
          type="button"
          className="tool"
          title={theme === "dark" ? "Tema terang" : "Tema gelap"}
          aria-label={theme === "dark" ? "Pakai tema terang" : "Pakai tema gelap"}
          onClick={toggleTheme}
        >
          <IconSun className="i-sun" />
          <IconMoon className="i-moon" />
        </button>
      </nav>

      <div className="dock">
        <section
          className={`sheet glass ${sheetOpen && !panel ? "open" : ""}`}
          aria-hidden={!(sheetOpen && !panel)}
          aria-label="Detail tempat"
        >
          {place && (
            <>
              <div className="sheet-head">
                <div className="sheet-title">
                  <h2>{place.name}</h2>
                  <p>{place.loading ? "Mencari alamat..." : place.address}</p>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={closePlace}
                  aria-label="Tutup dan hapus penanda"
                >
                  <IconClose />
                </button>
              </div>
              <dl className="facts">
                <div>
                  <dt>Koordinat</dt>
                  <dd>
                    {place.lat.toFixed(5)}, {place.lon.toFixed(5)}
                  </dd>
                </div>
                {showElev && (
                  <div>
                    <dt>Ketinggian</dt>
                    <dd>{Math.round(place.height)} m</dd>
                  </div>
                )}
              </dl>
              <div className="sheet-actions">
                <button
                  type="button"
                  className="btn solid"
                  onClick={() => flyToPlace(place.lat, place.lon, { range: 1100 })}
                >
                  Dekati
                </button>
                <button type="button" className="btn soft" onClick={copyCoords}>
                  {copied ? (
                    <>
                      <IconCheck /> Tersalin
                    </>
                  ) : (
                    <>
                      <IconCopy /> Salin koordinat
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </section>

        <section
          className={`panel glass ${panel ? "open" : ""}`}
          aria-hidden={!panel}
          aria-label="Tampilan peta"
        >
          <div className="panel-head">
            <h2>Tampilan peta</h2>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setPanel(false)}
              aria-label="Tutup"
            >
              <IconClose />
            </button>
          </div>
          <div className="panel-body">
            <h3>Peta dasar</h3>
            <div className="bases">
              {BASES.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="base"
                  aria-pressed={base === b.id}
                  onClick={() => setBase(b.id)}
                >
                  <span className={`swatch swatch-${b.id}`} />
                  <span className="base-label">{b.label}</span>
                </button>
              ))}
            </div>

            <h3>Lapisan 3D</h3>
            <Switch
              id="sw-terrain"
              label="Medan 3D"
              hint="Gunung dan lembah dengan data elevasi asli"
              checked={opts.terrain && HAS_TOKEN}
              disabled={!HAS_TOKEN}
              onChange={() => flip("terrain")}
            />
            <Switch
              id="sw-buildings"
              label="Gedung 3D"
              hint="Bentuk gedung dari OpenStreetMap, terlihat saat didekati"
              checked={opts.buildings && !opts.photo && HAS_TOKEN}
              disabled={!HAS_TOKEN || opts.photo}
              onChange={() => flip("buildings")}
            />
            <Switch
              id="sw-photo"
              label="Foto kota 3D"
              hint={
                opts.photo
                  ? "Aktif, menggantikan peta dasar dan gedung"
                  : "Model foto-realistis dari Google, berat untuk HP lemah"
              }
              checked={opts.photo && HAS_TOKEN}
              disabled={!HAS_TOKEN}
              onChange={() => flip("photo")}
            />
            {!HAS_TOKEN && (
              <p className="note">
                Medan, gedung, dan foto kota butuh token Cesium ion. Isi
                NEXT_PUBLIC_CESIUM_TOKEN di Vercel lalu deploy ulang.
              </p>
            )}

            <h3>Kinerja</h3>
            <Switch
              id="sw-low"
              label="Mode hemat"
              hint="Kurangi blur, bintang, dan detail supaya lancar di HP lemah"
              checked={low}
              onChange={toggleLow}
            />
            <p className="byline">Hidaka Globe oleh Hidaka401</p>
          </div>
        </section>
      </div>

      <footer className="foot">
        <p className="readout">
          Tinggi kamera <b ref={altRef}>--</b>
          <span className="readout-center" ref={centerRef} />
        </p>
        <div ref={creditRef} className="credit" />
      </footer>

      <div className={`toast ${toast ? "show" : ""}`} role="status" aria-live="polite">
        {toast}
      </div>

      <div
        className={`splash ${viewerReady ? "live" : ""} ${introDone ? "gone" : ""}`}
        aria-hidden="true"
      >
        <div className="splash-inner">
          <p className="wordmark">
            Hidaka
            <br />
            Globe
          </p>
          {!viewerReady && (
            <p className="splash-status">
              Memuat mesin peta
              <span className="loadbar" />
            </p>
          )}
        </div>
      </div>

      {(fatal || scriptFailed) && (
        <div className="fatal" role="alert">
          <h2>Globe tidak bisa dimuat</h2>
          <p>
            {fatal ||
              "Pustaka peta gagal diunduh. Cek koneksi internet lalu muat ulang halaman."}
          </p>
          <button type="button" className="btn solid" onClick={() => window.location.reload()}>
            Muat ulang
          </button>
        </div>
      )}
    </div>
  );
}
