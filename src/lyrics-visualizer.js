(() => {
  if (window.__wmpVelvetVisualizerInit) return;
  window.__wmpVelvetVisualizerInit = true;

  const MODELS = [
    { id: "none", label: "No Visualization", shortLabel: "Off", presets: [{ id: "default", label: "No Visualization" }] },
    { id: "album", label: "Album Art", shortLabel: "Album Art", presets: [{ id: "default", label: "Album Art" }] },
    {
      id: "alchemy",
      label: "Alchemy",
      shortLabel: "Alchemy",
      presets: [
        { id: "blossom", label: "Velvet Blossom" },
        { id: "random", label: "Random" },
        { id: "spectrum", label: "Crimson Bloom" }
      ]
    },
    {
      id: "ambience",
      label: "Ambience",
      shortLabel: "Ambience",
      presets: [
        { id: "warp", label: "Warp" },
        { id: "water", label: "Water" },
        { id: "fire", label: "Fire" }
      ]
    },
    {
      id: "bars",
      label: "Bars and Waves",
      shortLabel: "Bars & Waves",
      presets: [
        { id: "bars", label: "Bars" },
        { id: "scope", label: "Scope" },
        { id: "mist", label: "Ocean Mist" }
      ]
    },
    {
      id: "battery",
      label: "Battery",
      shortLabel: "Battery",
      presets: [
        { id: "brightsphere", label: "Brightsphere" },
        { id: "electriarnation", label: "Electriarnation" },
        { id: "whirlpool", label: "Whirlpool" },
        { id: "smokewater", label: "Smoke & Water" }
      ]
    },
    {
      id: "particle",
      label: "Particle",
      shortLabel: "Particle",
      presets: [
        { id: "rotating", label: "Rotating Particle" },
        { id: "fountain", label: "Galaxy Fountain" },
        { id: "aurora", label: "Aurora Drift" }
      ]
    },
    {
      id: "plenoptic",
      label: "Plenoptic",
      shortLabel: "Plenoptic",
      presets: [
        { id: "smokey", label: "Smokey Circles" },
        { id: "prism", label: "Prism Tunnel" },
        { id: "fractal", label: "Fractal Web" }
      ]
    },
    {
      id: "spikes",
      label: "Spikes",
      shortLabel: "Spikes",
      presets: [
        { id: "radial", label: "Radial Flare" },
        { id: "corona", label: "Crimson Corona" },
        { id: "crossfire", label: "Crossfire" }
      ]
    }
  ];

  const LEGACY_MODEL_MAP = {
    tunnel: { model: "ambience", preset: "warp" },
    spiral: { model: "battery", preset: "whirlpool" },
    starburst: { model: "spikes", preset: "radial" },
    scope: { model: "bars", preset: "bars" },
    cyber: { model: "alchemy", preset: "blossom" }
  };

  const SENSITIVITY_MAP = {
    subtle: 0.78,
    balanced: 1.24,
    overdrive: 1.78
  };

  const STORE_KEYS = {
    model: "wmp_viz_model_v2",
    preset: "wmp_viz_preset_v2",
    hue: "wmp_viz_hue_v2",
    sat: "wmp_viz_sat_v2",
    rgbRotate: "wmp_viz_rgb_rotate_v2",
    lyricsEnabled: "wmp_viz_lyrics_on_v2",
    sensitivity: "wmp_viz_sensitivity_v2"
  };

  function readStore(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch {}
  }

  function getModelDef(modelId) {
    for (let i = 0; i < MODELS.length; i++) {
      if (MODELS[i].id === modelId) return MODELS[i];
    }
    return MODELS[3];
  }

  function resolveModelAndPreset(rawModel, rawPreset) {
    if (LEGACY_MODEL_MAP[rawModel]) {
      return LEGACY_MODEL_MAP[rawModel];
    }
    const def = getModelDef(rawModel);
    if (def.id !== rawModel) {
      return { model: "ambience", preset: "warp" };
    }
    const hasPreset = def.presets.some((p) => p.id === rawPreset);
    return {
      model: def.id,
      preset: hasPreset ? rawPreset : def.presets[0].id
    };
  }

  const initialChoice = resolveModelAndPreset(
    readStore(STORE_KEYS.model, "ambience"),
    readStore(STORE_KEYS.preset, "warp")
  );

  const config = {
    model: initialChoice.model,
    preset: initialChoice.preset,
    hue: Math.max(0, Math.min(360, Number(readStore(STORE_KEYS.hue, "348")) || 348)),
    sat: Math.max(0, Math.min(100, Number(readStore(STORE_KEYS.sat, "88")) || 88)),
    rgbRotate: readStore(STORE_KEYS.rgbRotate, "1") === "1",
    lyricsEnabled: readStore(STORE_KEYS.lyricsEnabled, "1") === "1",
    sensitivity: SENSITIVITY_MAP[readStore(STORE_KEYS.sensitivity, "balanced")] ? readStore(STORE_KEYS.sensitivity, "balanced") : "balanced"
  };

  const runtime = {
    surfaceMode: false,
    onLyricsRoute: false,
    isFullscreen: false,
    visualActive: false,
    rafId: 0,
    lastFrameMs: 0,
    rotHue: config.hue,
    phase: 0,
    spiralPhase: 0,
    tunnelPhase: 0,
    driftPhase: 0,
    spinDir: 1,
    spinVel: 1,
    lastPath: location.pathname,
    wasLyricsRoute: false,
    menuOpen: false,
    hudContainerMode: "",
    fsIdle: false,
    fsIdleTimer: 0,
    lastMouseMoveMs: 0
  };

  const playback = {
    trackUri: "",
    title: "",
    artist: "",
    coverUrl: "",
    durationMs: 0,
    isPaused: true,
    speed: 1,
    anchorPosMs: 0,
    anchorWallMs: 0,
    interpPosMs: 0,
    lastDomText: "",
    lastDomChangeWallMs: 0
  };

  const audioCache = new Map();
  const pendingFetches = new Set();

  const features = {
    sourceMode: "idle",
    bpm: 120,
    lows: null,
    mids: null,
    highs: null,
    windowMs: 40,
    loudness: null,
    loudnessStartMs: 0,
    loudnessPeriodMs: 40,
    beats: null,
    tatums: null,
    segments: null,
    onsets: null
  };

  const SPK_COUNT = 96;
  const spkX = new Float32Array(SPK_COUNT);
  const spkY = new Float32Array(SPK_COUNT);
  const spkVx = new Float32Array(SPK_COUNT);
  const spkVy = new Float32Array(SPK_COUNT);
  const spkLife = new Float32Array(SPK_COUNT);
  const spkMaxLife = new Float32Array(SPK_COUNT);
  const spkHue = new Float32Array(SPK_COUNT);
  let spkCursor = 0;

  const FX_W = 192;
  const FX_H = 144;
  const fxNormX = new Float32Array(FX_W * FX_H);
  const fxNormY = new Float32Array(FX_W * FX_H);
  const fxDist = new Float32Array(FX_W * FX_H);
  const fxAng = new Float32Array(FX_W * FX_H);
  (function initFxLuts() {
    for (let y = 0; y < FX_H; y++) {
      const ny = (y / (FX_H - 1)) * 2 - 1;
      for (let x = 0; x < FX_W; x++) {
        const nx = (x / (FX_W - 1)) * 2 - 1;
        const idx = y * FX_W + x;
        fxNormX[idx] = nx;
        fxNormY[idx] = ny;
        fxDist[idx] = Math.sqrt(nx * nx * 1.15 + ny * ny * 0.88);
        fxAng[idx] = Math.atan2(ny, nx);
      }
    }
  })();

  const PT_COUNT = 480;
  const ptX = new Float32Array(PT_COUNT);
  const ptY = new Float32Array(PT_COUNT);
  const ptZ = new Float32Array(PT_COUNT);
  const ptR = new Float32Array(PT_COUNT);
  const ptA = new Float32Array(PT_COUNT);
  const ptSeed = new Float32Array(PT_COUNT);
  (function initParticles() {
    let s = 1337;
    const rnd = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < PT_COUNT; i++) {
      const arm = i % 3;
      const dist = Math.pow(rnd(), 0.72);
      const ang = dist * 7.8 + arm * ((Math.PI * 2) / 3) + (rnd() - 0.5) * 0.95;
      ptX[i] = Math.cos(ang) * dist;
      ptY[i] = (rnd() - 0.5) * 0.34 * (1.15 - dist * 0.5);
      ptZ[i] = Math.sin(ang) * dist;
      ptR[i] = dist;
      ptA[i] = ang;
      ptSeed[i] = rnd();
    }
  })();

  const meter = {
    bass: 0,
    mid: 0,
    high: 0,
    energy: 0,
    softBass: 0,
    softEnergy: 0,
    beatPulse: 0,
    kick: 0,
    snare: 0,
    shock: 0,
    shakeX: 0,
    shakeY: 0,
    prevRawBass: 0,
    prevRawMid: 0,
    flux: 0,
    avgFlux: 0.05,
    lastBeatIndex: -1,
    lastOnsetWallMs: 0,
    bins: new Float32Array(48),
    peaks: new Float32Array(48),
    bins32: new Float32Array(32),
    peaks32: new Float32Array(32),
    peaks32Vel: new Float32Array(32),
    wave: new Float32Array(128),
    waveB: new Float32Array(128)
  };

  const apis = {
    player: null,
    platform: null,
    history: null,
    requestBuilder: null,
    metadataExtensions: null,
    playerListenerBound: false,
    historyListenerBound: false,
    lastScanMs: 0
  };

  let canvas = null;
  let ctx = null;
  let fbCanvas = null;
  let fbCtx = null;
  let fxCanvas = null;
  let fxCtx = null;
  let fxImg = null;
  let fxU32 = null;
  let hudRoot = null;
  let wheelCanvas = null;
  let wheelMarker = null;
  let beatLedEl = null;
  let bpmLabelEl = null;
  let titleEl = null;
  let artistEl = null;
  let tickerLeftEl = null;
  let tickerRightEl = null;
  let presetLabelEl = null;
  let popupMenuEl = null;
  let coverImg = null;
  let coverImgSrc = "";
  let loadedCoverSrc = "";

  function normalizeSeries(arr) {
    if (!arr || !arr.length) return null;
    const len = arr.length;
    const out = new Float32Array(len);
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < len; i++) {
      const v = Number(arr[i]) || 0;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = max - min;
    if (span <= 1e-6) {
      out.fill(max > 0 ? 0.35 : 0);
      return out;
    }
    for (let i = 0; i < len; i++) {
      const n = ((Number(arr[i]) || 0) - min) / span;
      out[i] = Math.max(0, Math.min(1, n));
    }
    return out;
  }

  function detectOnsetEnvelope(lows, mids, windowMs) {
    if (!lows || lows.length < 4) return null;
    const len = lows.length;
    const onsets = new Float32Array(len);
    const look = Math.max(2, Math.round(180 / Math.max(10, windowMs)));
    for (let i = 1; i < len; i++) {
      const combined = lows[i] * 0.72 + (mids ? mids[i] * 0.28 : 0);
      const prev = lows[i - 1] * 0.72 + (mids ? mids[i - 1] * 0.28 : 0);
      let avg = 0;
      const start = Math.max(0, i - look);
      for (let j = start; j < i; j++) {
        avg += lows[j] * 0.72 + (mids ? mids[j] * 0.28 : 0);
      }
      avg /= Math.max(1, i - start);
      const diff = Math.max(0, combined - prev);
      const excess = Math.max(0, combined - avg * 1.12);
      onsets[i] = Math.min(1, diff * 2.4 + excess * 1.8);
    }
    return onsets;
  }

  function extractTrackId(uri) {
    if (!uri) return "";
    const m = /^spotify:track:([A-Za-z0-9]+)$/.exec(uri);
    if (m) return m[1];
    const parts = uri.split(":");
    return parts.length >= 3 && parts[1] === "track" ? parts[2] : "";
  }

  function hashTrackSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function scanReactApis(force) {
    const now = performance.now();
    if (!force && now - apis.lastScanMs < 450) return;
    apis.lastScanMs = now;

    const root = document.getElementById("main") || document.body;
    if (!root) return;

    const keys = Object.keys(root);
    let fiber = null;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].startsWith("__reactContainer$") || keys[i].startsWith("__reactFiber$")) {
        fiber = root[keys[i]];
        break;
      }
    }
    if (!fiber) return;

    const queue = [fiber];
    const seen = new Set();
    let steps = 0;

    while (queue.length > 0 && steps < 5500) {
      const node = queue.shift();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      steps++;

      const props = node.memoizedProps;
      if (props && typeof props === "object") {
        if (!apis.player && props.playerAPI && typeof props.playerAPI.getState === "function") {
          apis.player = props.playerAPI;
        }
        if (!apis.platform && props.value && typeof props.value.getRegistry === "function" && typeof props.value.getRequestBuilder === "function") {
          apis.platform = props.value;
        }
        if (!apis.requestBuilder && props.instance && typeof props.instance.build === "function" && typeof props.instance.withHost === "function") {
          apis.requestBuilder = props.instance;
        }
      }

      if (apis.platform && !apis.requestBuilder) {
        try {
          apis.requestBuilder = apis.platform.getRequestBuilder();
        } catch {}
      }

      if (apis.platform && !apis.history) {
        try {
          if (typeof apis.platform.getHistory === "function") {
            apis.history = apis.platform.getHistory();
          }
        } catch {}
      }

      if (apis.platform && !apis.metadataExtensions) {
        try {
          const reg = apis.platform.getRegistry();
          if (reg && typeof reg.resolve === "function") {
            apis.metadataExtensions = reg.resolve(Symbol.for("MetadataExtensions"));
          }
        } catch {}
      }

      if (apis.player && apis.requestBuilder && apis.metadataExtensions && apis.history) break;

      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }

    bindPlayerEvents();
    bindHistoryEvents();
  }

  function closeVizPopupMenu() {
    runtime.menuOpen = false;
    if (popupMenuEl) {
      popupMenuEl.classList.remove("open");
    }
  }

  function exitSurfaceMode(keepFullscreen) {
    closeVizPopupMenu();
    if (!runtime.surfaceMode && (!runtime.isFullscreen || keepFullscreen)) return;
    runtime.surfaceMode = false;
    if (!keepFullscreen && runtime.isFullscreen) {
      toggleFullscreen();
    } else {
      updateVisibilityAndLayout();
    }
  }

  function bindHistoryEvents() {
    if (apis.historyListenerBound || !apis.history || typeof apis.history.listen !== "function") return;
    try {
      const initLoc = apis.history.location;
      if (initLoc && initLoc.pathname) {
        runtime.lastPath = initLoc.pathname;
      }
      apis.history.listen((loc) => {
        const nextPath = loc && loc.pathname ? loc.pathname : "";
        if (nextPath && nextPath !== runtime.lastPath) {
          runtime.lastPath = nextPath;
          if (runtime.surfaceMode) {
            exitSurfaceMode(false);
            return;
          }
        }
        updateVisibilityAndLayout();
      });
      apis.historyListenerBound = true;
    } catch {}
  }

  function bindPlayerEvents() {
    if (apis.playerListenerBound || !apis.player) return;
    try {
      const events = typeof apis.player.getEvents === "function" ? apis.player.getEvents() : apis.player._events;
      if (events && typeof events.addListener === "function") {
        events.addListener("update", (ev) => {
          applyPlayerState(ev && ev.data ? ev.data : ev);
        });
        apis.playerListenerBound = true;
      }
    } catch {}
  }

  function parseDomClockSeconds(text) {
    if (!text) return -1;
    const cleaned = text.trim();
    const parts = cleaned.split(":");
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const s = parseInt(parts[1], 10);
      if (!Number.isNaN(m) && !Number.isNaN(s)) return m * 60 + s;
    } else if (parts.length === 3) {
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const s = parseInt(parts[2], 10);
      if (!Number.isNaN(h) && !Number.isNaN(m) && !Number.isNaN(s)) return h * 3600 + m * 60 + s;
    }
    return -1;
  }

  function normalizeCoverUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== "string") return "";
    const u = rawUrl.trim();
    if (!u) return "";
    if (u.startsWith("spotify:image:")) {
      return `https://i.scdn.co/image/${u.slice("spotify:image:".length)}`;
    }
    return u;
  }

  function ensureCoverImage(url) {
    if (!url || url === coverImgSrc) return;
    coverImgSrc = url;
    loadedCoverSrc = "";
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (coverImgSrc === url && img.naturalWidth > 0) {
        coverImg = img;
        loadedCoverSrc = url;
      }
    };
    img.onerror = () => {
      if (url.includes("ab67616d0000b273")) {
        ensureCoverImage(url.replace("ab67616d0000b273", "ab67616d00001e02"));
      }
    };
    img.src = url;
  }

  function readDomPlaybackHints() {
    const posEl = document.querySelector('[data-testid="playback-position"]');
    const durEl = document.querySelector('[data-testid="playback-duration"]');
    const titleNode = document.querySelector('[data-testid="context-item-info-title"] a, [data-testid="context-item-link"]');
    const artistNodes = document.querySelectorAll('[data-testid="context-item-info-artist"], [data-testid="context-item-info-subtitles"] a');
    const playBtn = document.querySelector('button[data-testid="control-button-playpause"]');
    const bigCoverEl = document.querySelector('.s8fIIxwITjOk1aFOxhPv img[data-testid="cover-art-image"], aside[data-testid="now-playing-bar"] img[data-testid="cover-art-image"]');

    const domPosText = posEl ? posEl.textContent.trim() : "";
    const domPosSec = parseDomClockSeconds(domPosText);
    const domDurSec = durEl ? parseDomClockSeconds(durEl.textContent.trim()) : -1;

    if (domPosText && domPosText !== playback.lastDomText) {
      playback.lastDomText = domPosText;
      playback.lastDomChangeWallMs = Date.now();
    }

    if (titleNode && !playback.title) {
      playback.title = titleNode.textContent.trim();
    }
    if (artistNodes.length > 0 && !playback.artist) {
      playback.artist = Array.from(artistNodes).map((n) => n.textContent.trim()).filter(Boolean).join(", ");
    }
    if (bigCoverEl && bigCoverEl.src) {
      const rawDomSrc = normalizeCoverUrl(bigCoverEl.src);
      const upgradedSrc = rawDomSrc.includes("00004851") ? rawDomSrc.replace("00004851", "0000b273") : rawDomSrc;
      if (upgradedSrc && (!playback.coverUrl || upgradedSrc.includes("0000b273"))) {
        playback.coverUrl = upgradedSrc;
        ensureCoverImage(playback.coverUrl);
      }
    }

    let domPaused = null;
    if (domPosText && Date.now() - playback.lastDomChangeWallMs < 1500) {
      domPaused = false;
    } else if (playBtn) {
      const lbl = (playBtn.getAttribute("aria-label") || "").toLowerCase();
      if (lbl.includes("pause")) domPaused = false;
      else if (lbl.includes("play")) domPaused = true;
    }

    return { domPosSec, domDurSec, domPaused };
  }

  function pickBestCoverFromItem(item) {
    if (!item || typeof item !== "object") return "";
    const md = item.metadata || {};
    const metaCandidate = md.image_xlarge_url || md.image_large_url || md.image_url || md.image_small_url || "";
    const imgs = (item.album && Array.isArray(item.album.images) && item.album.images) || (Array.isArray(item.images) && item.images) || null;
    if (imgs && imgs.length > 0) {
      let best = imgs[0];
      for (let i = 1; i < imgs.length; i++) {
        if ((imgs[i].width || 0) > (best.width || 0)) best = imgs[i];
      }
      if (best && best.url) return normalizeCoverUrl(best.url);
    }
    return normalizeCoverUrl(metaCandidate);
  }

  function applyPlayerState(raw) {
    if (!raw || typeof raw !== "object") return;
    const item = raw.item || raw.track;
    const newUri = item && item.uri ? String(item.uri) : "";

    if (item) {
      playback.title = item.name || item.metadata?.title || playback.title;
      if (Array.isArray(item.artists) && item.artists.length > 0) {
        playback.artist = item.artists.map((a) => a.name).filter(Boolean).join(", ");
      } else if (item.metadata?.artist_name) {
        playback.artist = item.metadata.artist_name;
      }
      const dMs = Number(item.duration?.milliseconds ?? raw.duration ?? item.metadata?.duration ?? 0);
      if (dMs > 0) playback.durationMs = dMs;
      const artUrl = pickBestCoverFromItem(item);
      if (artUrl) {
        playback.coverUrl = artUrl;
        ensureCoverImage(artUrl);
      }
    }

    const rawPaused = raw.isPaused ?? raw.is_paused;
    if (typeof rawPaused === "boolean") {
      playback.isPaused = rawPaused;
    }

    const spd = Number(raw.speed ?? raw.playbackSpeed ?? 1);
    playback.speed = spd > 0 && spd < 5 ? spd : 1;

    const posAsOf = Number(raw.positionAsOfTimestamp ?? raw.position_as_of_timestamp);
    const ts = Number(raw.timestamp);

    if (!Number.isNaN(posAsOf) && posAsOf >= 0) {
      playback.anchorPosMs = posAsOf;
      playback.anchorWallMs = !Number.isNaN(ts) && ts > 1000000000000 ? ts : Date.now();
    }

    if (newUri && newUri !== playback.trackUri) {
      playback.trackUri = newUri;
      resetMeterTransientState();
      ensureTrackAudioData(newUri);
    }

    updateFooterMeta();
  }

  function resetMeterTransientState() {
    meter.lastBeatIndex = -1;
    meter.prevRawBass = 0;
    meter.avgFlux = 0.05;
    meter.beatPulse = 0.55;
  }

  function pollPlaybackClock() {
    if (!apis.player) {
      scanReactApis(false);
    }
    if (apis.player && typeof apis.player.getState === "function") {
      try {
        const s = apis.player.getState();
        if (s && typeof s.then === "function") {
          s.then((res) => applyPlayerState(res)).catch(() => {});
        } else if (s) {
          applyPlayerState(s);
        }
      } catch {}
    }

    const hints = readDomPlaybackHints();
    if (hints.domDurSec > 0 && playback.durationMs <= 0) {
      playback.durationMs = hints.domDurSec * 1000;
    }

    if (!apis.player && hints.domPaused !== null) {
      playback.isPaused = hints.domPaused;
    }

    const nowWall = Date.now();
    let computedPosMs = playback.anchorPosMs;
    if (!playback.isPaused && playback.anchorWallMs > 0) {
      computedPosMs += Math.max(0, nowWall - playback.anchorWallMs) * playback.speed;
    }

    if (hints.domPosSec >= 0) {
      const domMs = hints.domPosSec * 1000;
      if (playback.anchorWallMs === 0 || Math.abs(computedPosMs - domMs) > 1600) {
        playback.anchorPosMs = domMs + (playback.isPaused ? 0 : 250);
        playback.anchorWallMs = nowWall;
        computedPosMs = playback.anchorPosMs;
      }
    }

    if (playback.durationMs > 0) {
      computedPosMs = Math.max(0, Math.min(playback.durationMs, computedPosMs));
    }
    playback.interpPosMs = computedPosMs;

    if (playback.trackUri && !audioCache.has(playback.trackUri) && !pendingFetches.has(playback.trackUri)) {
      ensureTrackAudioData(playback.trackUri);
    }

    updateFooterMeta();
  }

  function applyCachedAudioData(entry) {
    if (!entry) return;
    features.sourceMode = entry.sourceMode || "fallback";
    features.bpm = entry.bpm > 20 ? entry.bpm : 120;
    features.lows = entry.lows || null;
    features.mids = entry.mids || null;
    features.highs = entry.highs || null;
    features.windowMs = entry.windowMs || 40;
    features.onsets = entry.onsets || null;
    features.loudness = entry.loudness || null;
    features.loudnessStartMs = entry.loudnessStartMs || 0;
    features.loudnessPeriodMs = entry.loudnessPeriodMs || 40;
    features.beats = entry.beats || null;
    features.tatums = entry.tatums || null;
    features.segments = entry.segments || null;
    updateAudioStatusPill();
  }

  async function ensureTrackAudioData(uri) {
    if (!uri) return;
    if (audioCache.has(uri)) {
      applyCachedAudioData(audioCache.get(uri));
      return;
    }
    if (pendingFetches.has(uri)) return;
    pendingFetches.add(uri);

    const record = {
      sourceMode: "synth",
      bpm: 120,
      lows: null,
      mids: null,
      highs: null,
      windowMs: 40,
      onsets: null,
      loudness: null,
      loudnessStartMs: 0,
      loudnessPeriodMs: 40,
      beats: null,
      tatums: null,
      segments: null
    };

    try {
      if (!apis.metadataExtensions || !apis.requestBuilder) {
        scanReactApis(true);
      }

      const tasks = [];

      if (apis.metadataExtensions && typeof apis.metadataExtensions.fetch === "function") {
        tasks.push(
          apis.metadataExtensions
            .fetch([uri, 237, 222, 217, 142])
            .then((res) => {
              const map = res && (res[uri] || res);
              if (!map) return;

              const attr = map[222] || map.AUDIO_ATTRIBUTES_V2;
              if (attr && Number(attr.bpm) > 20) {
                record.bpm = Math.round(Number(attr.bpm));
              }

              const beatsExt = map[217] || map.BEATS;
              if (beatsExt && beatsExt.beats && beatsExt.beats.length > 0) {
                const rawBeats = Array.from(beatsExt.beats)
                  .map((b) => Number(b.time))
                  .filter((t) => Number.isFinite(t) && t >= 0);
                if (rawBeats.length > 1) {
                  record.beats = rawBeats.map((t) => t * 1000);
                  if (!attr || !Number(attr.bpm)) {
                    const avgDiffSec = (rawBeats[rawBeats.length - 1] - rawBeats[0]) / (rawBeats.length - 1);
                    if (avgDiffSec > 0.25 && avgDiffSec < 2.0) {
                      record.bpm = Math.round(60 / avgDiffSec);
                    }
                  }
                }
              }

              const wf = map[237] || map.THREEBAND_WAVEFORMS;
              if (wf && wf.sampleWindowSizeMs > 0 && wf.lows && wf.lows.length > 0) {
                record.windowMs = Number(wf.sampleWindowSizeMs) || 40;
                record.lows = normalizeSeries(wf.lows);
                record.mids = normalizeSeries(wf.mids && wf.mids.length ? wf.mids : wf.lows);
                record.highs = normalizeSeries(wf.highs && wf.highs.length ? wf.highs : wf.mids || wf.lows);
                record.onsets = detectOnsetEnvelope(record.lows, record.mids, record.windowMs);
                record.sourceMode = "3-band";
              }

              const lta = map[142] || map.LIST_TUNER_AUDIO_ANALYSIS;
              if (lta && lta.loudness && lta.loudness.length > 0) {
                record.loudnessStartMs = Number(lta.startMs) || 0;
                record.loudnessPeriodMs = Number(lta.periodMs) || 40;
                record.loudness = normalizeSeries(lta.loudness);
                if (record.sourceMode === "synth") record.sourceMode = "loudness";
              }
            })
            .catch(() => {})
        );
      }

      const trackId = extractTrackId(uri);
      if (trackId && apis.requestBuilder && typeof apis.requestBuilder.build === "function") {
        tasks.push(
          (async () => {
            try {
              const req = apis.requestBuilder
                .build()
                .withHost("https://spclient.wg.spotify.com")
                .withPath(`/audio-attributes/v1/audio-analysis/${trackId}`)
                .withQueryParameters({ format: "json" });
              const sent = typeof req.send === "function" ? await req.send() : null;
              const body = sent && (sent.body || sent);
              if (body && typeof body === "object") {
                if (body.track && Number(body.track.tempo) > 20) {
                  record.bpm = Math.round(Number(body.track.tempo));
                }
                if (Array.isArray(body.beats) && body.beats.length > 0) {
                  record.beats = body.beats.map((b) => b.start * 1000);
                }
                if (Array.isArray(body.tatums) && body.tatums.length > 0) {
                  record.tatums = body.tatums.map((t) => t.start * 1000);
                }
                if (Array.isArray(body.segments) && body.segments.length > 0) {
                  record.segments = body.segments;
                  record.sourceMode = record.lows ? "full-hd" : "analysis";
                }
              }
            } catch {}
          })()
        );
      }

      await Promise.all(tasks);
      if (record.sourceMode === "synth" && !record.bpm) {
        const seed = hashTrackSeed(uri);
        record.bpm = 96 + (seed % 44);
      }

      if (audioCache.size > 40) {
        const firstKey = audioCache.keys().next().value;
        if (firstKey) audioCache.delete(firstKey);
      }
      audioCache.set(uri, record);

      if (playback.trackUri === uri) {
        applyCachedAudioData(record);
      }
    } finally {
      pendingFetches.delete(uri);
    }
  }

  function bSearchIndex(arr, targetMs) {
    let lo = 0;
    let hi = arr.length - 1;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] <= targetMs) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  }

  function spawnSparks(count, radiusNorm, speedBase, hueSpread, oxNorm, oyNorm) {
    for (let k = 0; k < count; k++) {
      const idx = spkCursor;
      spkCursor = (spkCursor + 1) % SPK_COUNT;
      const ang = (idx * 2.399963) + runtime.phase * 1.9 + k * 0.41;
      const spd = speedBase * (0.65 + ((idx * 17) % 13) / 13);
      spkX[idx] = oxNorm + Math.cos(ang) * radiusNorm;
      spkY[idx] = oyNorm + Math.sin(ang) * radiusNorm;
      spkVx[idx] = Math.cos(ang) * spd;
      spkVy[idx] = Math.sin(ang) * spd;
      const maxL = 0.42 + ((idx * 7) % 10) * 0.045;
      spkLife[idx] = maxL;
      spkMaxLife[idx] = maxL;
      spkHue[idx] = ((k % 5) - 2) * hueSpread;
    }
  }

  function stepAndDrawSparks(dtSec, cx, cy, minDim, swirlRate) {
    for (let i = 0; i < SPK_COUNT; i++) {
      let life = spkLife[i];
      if (life <= 0) continue;
      life -= dtSec;
      if (life <= 0) {
        spkLife[i] = 0;
        continue;
      }
      spkLife[i] = life;

      const x0 = spkX[i];
      const y0 = spkY[i];
      let vx = spkVx[i];
      let vy = spkVy[i];

      if (swirlRate !== 0) {
        const sx = -y0 * swirlRate;
        const sy = x0 * swirlRate;
        vx += sx * dtSec;
        vy += sy * dtSec;
      }

      const accel = 1 + dtSec * (0.85 + meter.bass * 1.6);
      vx *= accel;
      vy *= accel;
      spkVx[i] = vx;
      spkVy[i] = vy;

      const x1 = x0 + vx * dtSec;
      const y1 = y0 + vy * dtSec;
      spkX[i] = x1;
      spkY[i] = y1;

      const alpha = Math.min(1, (life / spkMaxLife[i]) * 1.25);
      const px0 = cx + x0 * minDim;
      const py0 = cy + y0 * minDim;
      const px1 = cx + x1 * minDim + (x1 - x0) * minDim * 1.6;
      const py1 = cy + y1 * minDim + (y1 - y0) * minDim * 1.6;

      ctx.strokeStyle = hslColor(spkHue[i], alpha * 0.92, 34);
      ctx.lineWidth = 1.1 + alpha * 1.4;
      ctx.beginPath();
      ctx.moveTo(px0, py0);
      ctx.lineTo(px1, py1);
      ctx.stroke();
    }
  }

  function applyFeedbackPass(w, h, zoom, rot, fadeAlpha, shiftX, shiftY, trailAlpha) {
    const fbW = fbCanvas.width;
    const fbH = fbCanvas.height;

    fbCtx.save();
    fbCtx.setTransform(1, 0, 0, 1, 0, 0);
    fbCtx.globalCompositeOperation = "copy";
    fbCtx.globalAlpha = 1;
    fbCtx.fillStyle = "#040102";
    fbCtx.fillRect(0, 0, fbW, fbH);
    fbCtx.restore();

    fbCtx.save();
    fbCtx.setTransform(1, 0, 0, 1, 0, 0);
    fbCtx.globalCompositeOperation = "source-over";
    fbCtx.translate(fbW * 0.5 + shiftX * fbW, fbH * 0.5 + shiftY * fbH);
    fbCtx.rotate(rot);
    fbCtx.scale(zoom, zoom);
    fbCtx.globalAlpha = trailAlpha;
    fbCtx.drawImage(canvas, -fbW * 0.5, -fbH * 0.5, fbW, fbH);
    fbCtx.restore();

    fbCtx.save();
    fbCtx.setTransform(1, 0, 0, 1, 0, 0);
    fbCtx.globalCompositeOperation = "source-over";
    fbCtx.fillStyle = `rgba(4, 1, 2, ${fadeAlpha.toFixed(3)})`;
    fbCtx.fillRect(0, 0, fbW, fbH);
    fbCtx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(fbCanvas, 0, 0, w, h);
    ctx.restore();
  }

  function updateAudioFeatures(dtSec, nowMs) {
    const sens = SENSITIVITY_MAP[config.sensitivity] || 1.24;
    const isPlaying = !playback.isPaused && !!playback.trackUri;

    if (!isPlaying) {
      const decay = Math.exp(-dtSec * 6.5);
      meter.bass *= decay;
      meter.mid *= decay;
      meter.high *= decay;
      meter.energy *= decay;
      meter.kick *= Math.exp(-dtSec * 9.5);
      meter.snare *= Math.exp(-dtSec * 11.0);
      meter.shock *= Math.exp(-dtSec * 8.0);
      meter.shakeX *= decay;
      meter.shakeY *= decay;
      meter.beatPulse *= Math.exp(-dtSec * 9.5);
      meter.flux *= decay;
      runtime.spinVel += (1 - runtime.spinVel) * (1 - Math.exp(-dtSec * 4.5));
      for (let i = 0; i < 48; i++) {
        meter.bins[i] *= decay;
        meter.peaks[i] = Math.max(meter.bins[i], meter.peaks[i] - dtSec * 0.45);
      }
      for (let i = 0; i < 128; i++) {
        meter.wave[i] *= decay;
        meter.waveB[i] *= decay;
      }
      for (let i = 0; i < SPK_COUNT; i++) {
        if (spkLife[i] > 0) {
          spkLife[i] = Math.max(0, spkLife[i] - dtSec * 2.2);
        }
      }
      runtime.driftPhase += dtSec * 0.22;
      return false;
    }

    const posMs = playback.interpPosMs + dtSec * 1000 * playback.speed;
    playback.interpPosMs = posMs;

    const bpm = features.bpm > 20 ? features.bpm : 120;
    const beatPeriodMs = 60000 / bpm;
    const exactBeat = posMs / beatPeriodMs;
    const beatIdx = Math.floor(exactBeat);
    const beatFrac = exactBeat - beatIdx;

    let rawBass = 0;
    let rawMid = 0;
    let rawHigh = 0;
    let rawOnset = 0;
    let pitches = null;

    if (features.lows && features.lows.length > 0) {
      const wMs = features.windowMs || 40;
      const fIdx = Math.max(0, Math.min(features.lows.length - 1.001, posMs / wMs));
      const idx0 = Math.floor(fIdx);
      const frac = fIdx - idx0;
      const idx1 = Math.min(features.lows.length - 1, idx0 + 1);

      rawBass = features.lows[idx0] * (1 - frac) + features.lows[idx1] * frac;
      rawMid = features.mids[idx0] * (1 - frac) + features.mids[idx1] * frac;
      rawHigh = features.highs[idx0] * (1 - frac) + features.highs[idx1] * frac;
      if (features.onsets) {
        rawOnset = features.onsets[idx0] * (1 - frac) + features.onsets[idx1] * frac;
      }
    }

    if (features.segments && features.segments.length > 0) {
      const sec = posMs / 1000;
      let sLo = 0;
      let sHi = features.segments.length - 1;
      let sIdx = 0;
      while (sLo <= sHi) {
        const sMid = (sLo + sHi) >>> 1;
        if (features.segments[sMid].start <= sec) {
          sIdx = sMid;
          sLo = sMid + 1;
        } else {
          sHi = sMid - 1;
        }
      }
      const seg = features.segments[sIdx];
      if (seg) {
        pitches = seg.pitches;
        const rel = Math.max(0, sec - seg.start);
        const env = rel < 0.05 ? rel / 0.05 : Math.exp(-(rel - 0.05) * 5.0);
        const normLoud = Math.max(0, Math.min(1, ((seg.loudness_max ?? -12) + 34) / 34));
        if (!features.lows) {
          rawBass = normLoud * env * (pitches ? (pitches[0] + pitches[1] + pitches[2]) / 2.1 : 0.88);
          rawMid = normLoud * env * (pitches ? (pitches[4] + pitches[5] + pitches[7]) / 2.1 : 0.80);
          rawHigh = normLoud * env * (pitches ? (pitches[9] + pitches[10] + pitches[11]) / 2.1 : 0.72);
          rawOnset = env > 0.74 ? normLoud : 0;
        }
      }
    }

    if (!features.lows && !features.segments && features.loudness && features.loudness.length > 0) {
      const pMs = features.loudnessPeriodMs || 40;
      const idx = Math.max(0, Math.min(features.loudness.length - 1, Math.floor((posMs - features.loudnessStartMs) / pMs)));
      const loud = features.loudness[idx];
      const kickEnv = Math.exp(-beatFrac * 5.8);
      const snareEnv = Math.exp(-((beatFrac + 0.5) % 1) * 7.8);
      rawBass = Math.min(1, loud * (0.50 + 0.75 * kickEnv));
      rawMid = Math.min(1, loud * (0.45 + 0.65 * snareEnv));
      rawHigh = Math.min(1, loud * (0.35 + 0.55 * (Math.sin(exactBeat * Math.PI * 4) * 0.5 + 0.5)));
      rawOnset = kickEnv > 0.72 ? loud : 0;
    }

    if (!features.lows && !features.segments && !features.loudness) {
      const seed = hashTrackSeed(playback.trackUri || "velvet");
      const groove = (seed % 7) * 0.14;
      const kickEnv = Math.exp(-beatFrac * 5.6);
      const halfBeatFrac = (exactBeat * 2) - Math.floor(exactBeat * 2);
      const snareEnv = (beatIdx % 2 === 1 ? 1 : 0.45) * Math.exp(-beatFrac * 6.5);
      const hatEnv = Math.exp(-halfBeatFrac * 9.0);
      const phrase = 0.72 + 0.28 * Math.sin(posMs * 0.00055 + groove);
      rawBass = Math.min(1, (0.22 + 0.82 * kickEnv) * phrase);
      rawMid = Math.min(1, (0.20 + 0.72 * snareEnv) * phrase);
      rawHigh = Math.min(1, (0.16 + 0.76 * hatEnv) * phrase);
      rawOnset = beatIdx !== meter.lastBeatIndex ? 0.9 : 0;
    }

    let beatTriggered = false;
    if (features.beats && features.beats.length > 0) {
      const bi = bSearchIndex(features.beats, posMs);
      if (bi !== meter.lastBeatIndex && Math.abs(posMs - features.beats[bi]) < 95) {
        meter.lastBeatIndex = bi;
        beatTriggered = true;
      }
    } else if (beatIdx !== meter.lastBeatIndex) {
      meter.lastBeatIndex = beatIdx;
      if (rawBass > 0.18 || rawOnset > 0.24 || !features.lows) {
        beatTriggered = true;
      }
    }

    const posDelta = Math.max(0, rawBass - meter.prevRawBass);
    const midDelta = Math.max(0, rawMid - meter.prevRawMid);
    meter.prevRawBass = rawBass;
    meter.prevRawMid = rawMid;
    meter.flux = meter.flux * 0.55 + (posDelta * 4.2 + rawOnset * 0.75) * 0.45;
    meter.avgFlux = meter.avgFlux * 0.95 + meter.flux * 0.05;

    if (!beatTriggered && meter.flux > Math.max(0.20, meter.avgFlux * 1.85) && nowMs - meter.lastOnsetWallMs > Math.max(165, beatPeriodMs * 0.42)) {
      beatTriggered = true;
    }

    if (beatTriggered) {
      meter.beatPulse = 1;
      meter.kick = Math.min(1.6, 0.85 + rawBass * 0.65);
      meter.shock = 1;
      meter.lastOnsetWallMs = nowMs;
      runtime.spinVel = Math.min(4.2, 2.2 + rawBass * 1.9);
      if (rawBass > 0.68 || beatIdx % 4 === 0) {
        runtime.spinDir = -runtime.spinDir;
      }
      const punch = 0.008 + Math.min(0.022, (rawBass * 0.018 + meter.flux * 0.01) * sens);
      meter.shakeX = Math.cos(nowMs * 0.037) * punch;
      meter.shakeY = Math.sin(nowMs * 0.053) * punch;
      spawnSparks(Math.round(7 + rawBass * 10), 0.16 + rawBass * 0.10, 0.55 + rawBass * 0.95, 36, 0, 0);
    } else {
      meter.beatPulse *= Math.exp(-dtSec * (5.6 + bpm / 34));
      meter.kick *= Math.exp(-dtSec * 8.4);
      meter.shock *= Math.exp(-dtSec * 4.8);
      meter.shakeX *= Math.exp(-dtSec * 16.0);
      meter.shakeY *= Math.exp(-dtSec * 16.0);
    }

    const snareTarget = Math.min(1.5, (midDelta * 4.4 + rawHigh * 0.82) * sens);
    meter.snare += (snareTarget - meter.snare) * (1 - Math.exp(-dtSec * (snareTarget > meter.snare ? 38 : 11)));

    const bPow = Math.pow(Math.max(0, rawBass), 1.18);
    const tBass = Math.min(1.65, (bPow * 0.96 + meter.kick * 0.48 + meter.beatPulse * 0.34) * sens);
    const tMid = Math.min(1.55, (Math.pow(Math.max(0, rawMid), 1.12) * 1.05 + rawBass * 0.18 + meter.snare * 0.25) * sens);
    const tHigh = Math.min(1.55, (Math.pow(Math.max(0, rawHigh), 1.1) * 1.08 + meter.flux * 0.42) * sens);

    const kAttack = 1 - Math.exp(-dtSec * 42);
    const kRelease = 1 - Math.exp(-dtSec * 9.5);
    meter.bass += (tBass - meter.bass) * (tBass > meter.bass ? kAttack : kRelease);
    meter.mid += (tMid - meter.mid) * (tMid > meter.mid ? kAttack : kRelease);
    meter.high += (tHigh - meter.high) * (tHigh > meter.high ? kAttack : kRelease);
    meter.energy = meter.bass * 0.50 + meter.mid * 0.32 + meter.high * 0.18;

    runtime.spinVel += (1 + meter.energy * 0.9 - runtime.spinVel) * (1 - Math.exp(-dtSec * 5.2));
    const softK = 1 - Math.exp(-dtSec * 2.3);
    meter.softBass += (meter.bass - meter.softBass) * softK;
    meter.softEnergy += (meter.energy - meter.softEnergy) * softK;

    const tSec = posMs * 0.001;
    for (let i = 0; i < 48; i++) {
      const normF = i / 47;
      let bandBase;
      if (i < 14) {
        const w = i / 14;
        bandBase = meter.bass * (1.08 - w * 0.38) + meter.mid * (w * 0.35);
      } else if (i < 33) {
        const w = (i - 14) / 19;
        bandBase = meter.mid * (1.06 - Math.abs(w - 0.5) * 0.32) + meter.bass * ((1 - w) * 0.28) + meter.high * (w * 0.40);
      } else {
        const w = (i - 33) / 14;
        bandBase = meter.high * (0.78 + w * 0.48) + meter.mid * ((1 - w) * 0.26);
      }

      const pitchVal = pitches ? pitches[i % 12] : (0.50 + 0.50 * Math.sin(tSec * (5.6 + (i % 7) * 1.45) + i * 0.72));
      const ripple = 0.54 + 0.46 * Math.sin(tSec * (9.5 + i * 1.05) - normF * 11.0 + meter.beatPulse * 2.8) * Math.cos(tSec * 4.2 + i * 1.5);
      const kickLift = i < 14 ? meter.kick * 0.36 : i > 30 ? meter.snare * 0.22 : meter.beatPulse * 0.16;
      const binTarget = Math.max(0.03, Math.min(1.15, bandBase * (0.50 + pitchVal * 0.50) * ripple + kickLift));

      const bLerp = binTarget > meter.bins[i] ? kAttack : kRelease;
      meter.bins[i] += (binTarget - meter.bins[i]) * bLerp;
      if (meter.bins[i] > meter.peaks[i]) {
        meter.peaks[i] = meter.bins[i];
      } else {
        meter.peaks[i] = Math.max(meter.bins[i], meter.peaks[i] - dtSec * 0.58);
      }
    }

    for (let i = 0; i < 32; i++) {
      const fIdx = Math.min(47, Math.floor((i / 31) * 46));
      const nIdx = Math.min(47, fIdx + 1);
      const val = Math.max(0.02, Math.min(1, meter.bins[fIdx] * 0.65 + meter.bins[nIdx] * 0.35));
      meter.bins32[i] = val;
      if (val >= meter.peaks32[i]) {
        meter.peaks32[i] = val;
        meter.peaks32Vel[i] = 0;
      } else {
        meter.peaks32Vel[i] = Math.min(2.6, meter.peaks32Vel[i] + dtSec * 2.4);
        meter.peaks32[i] = Math.max(val, meter.peaks32[i] - meter.peaks32Vel[i] * dtSec);
      }
    }

    for (let i = 0; i < 128; i++) {
      const p = (i / 128) * Math.PI * 2;
      const b0 = meter.bins[(i * 3) % 48];
      const b1 = meter.bins[(i * 7 + 19) % 48];
      const wSub = Math.sin(p * 3 + tSec * 9.5) * (0.28 + meter.bass * 0.78 + meter.kick * 0.28);
      const wMid = Math.sin(p * 8 - tSec * 15.5) * (0.18 + meter.mid * 0.56 + b0 * 0.34);
      const wHigh = Math.sin(p * 14 + tSec * 21.0) * (0.08 + meter.high * 0.42 + b1 * 0.22);
      const edgeRipple = Math.sin(p * 11 - tSec * 18.0) * Math.cos(p * 5 + tSec * 9.0) * (meter.snare * 0.28 + meter.high * 0.18);
      meter.wave[i] = Math.max(-1.5, Math.min(1.5, wSub + wMid + wHigh + edgeRipple));
      meter.waveB[i] = Math.max(-1.5, Math.min(1.5, Math.cos(p * 4 - tSec * 10.6) * (0.24 + meter.mid * 0.68) - wHigh * 0.72 + edgeRipple * 0.55));
    }

    runtime.phase += dtSec * (1.8 + meter.energy * 4.4 + (bpm / 120) * 1.15);
    runtime.spiralPhase += dtSec * (0.72 + meter.bass * 2.1 + meter.kick * 1.25) * runtime.spinDir;
    runtime.tunnelPhase += dtSec * (0.95 + meter.energy * 2.6 + meter.kick * 1.3);
    runtime.driftPhase += dtSec * (0.65 + meter.energy * 1.35 + (bpm / 120) * 0.4);

    if (config.rgbRotate) {
      runtime.rotHue = (runtime.rotHue + dtSec * (32 + meter.energy * 58 + meter.kick * 40)) % 360;
    } else {
      runtime.rotHue = config.hue;
    }

    return true;
  }

  function hslColor(hueOffset, alpha, lightBoost) {
    const h = ((runtime.rotHue + hueOffset) % 360 + 360) % 360;
    const s = config.rgbRotate ? Math.max(82, config.sat) : config.sat;
    const l = Math.max(12, Math.min(96, 54 + (lightBoost || 0)));
    return `hsla(${h.toFixed(1)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%, ${alpha.toFixed(3)})`;
  }

  const rgbScratch = [255, 0, 80];
  function hslToRgb(hDeg, s01, l01, out) {
    const h = ((hDeg % 360) + 360) % 360;
    const s = s01 < 0 ? 0 : s01 > 1 ? 1 : s01;
    const l = l01 < 0 ? 0 : l01 > 1 ? 1 : l01;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c * 0.5;
    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    if (h < 60) {
      r1 = c; g1 = x;
    } else if (h < 120) {
      r1 = x; g1 = c;
    } else if (h < 180) {
      g1 = c; b1 = x;
    } else if (h < 240) {
      g1 = x; b1 = c;
    } else if (h < 300) {
      r1 = x; b1 = c;
    } else {
      r1 = c; b1 = x;
    }
    out[0] = Math.max(0, Math.min(255, ((r1 + m) * 255) | 0));
    out[1] = Math.max(0, Math.min(255, ((g1 + m) * 255) | 0));
    out[2] = Math.max(0, Math.min(255, ((b1 + m) * 255) | 0));
    return out;
  }

  function ensureFxBuffer() {
    if (!fxCanvas) {
      fxCanvas = document.createElement("canvas");
      fxCanvas.width = FX_W;
      fxCanvas.height = FX_H;
      fxCtx = fxCanvas.getContext("2d", { alpha: false });
      fxImg = fxCtx.createImageData(FX_W, FX_H);
      fxU32 = new Uint32Array(fxImg.data.buffer);
    }
  }

  function flushFxToMain(w, h) {
    fxCtx.putImageData(fxImg, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(fxCanvas, 0, 0, w, h);
    ctx.restore();
  }

  function drawWmpFallbackNote(x, y, size, pulse) {
    const cx = x + size * 0.5;
    const cy = y + size * 0.5;
    const frameGrad = ctx.createLinearGradient(x, y, x, y + size);
    frameGrad.addColorStop(0, "#1c050c");
    frameGrad.addColorStop(0.5, "#0d0205");
    frameGrad.addColorStop(1, "#040102");
    ctx.fillStyle = frameGrad;
    ctx.fillRect(x, y, size, size);

    ctx.strokeStyle = hslColor(0, 0.45 + pulse * 0.25, 22);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);

    const orbR = size * 0.34;
    const orbGrad = ctx.createRadialGradient(cx - orbR * 0.28, cy - orbR * 0.28, orbR * 0.08, cx, cy, orbR);
    orbGrad.addColorStop(0, "rgba(255, 232, 238, 0.36)");
    orbGrad.addColorStop(0.45, hslColor(0, 0.65, 8));
    orbGrad.addColorStop(1, "rgba(18, 2, 7, 0.95)");
    ctx.fillStyle = orbGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hslColor(8, 0.72, 28);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const noteGrad = ctx.createLinearGradient(cx - orbR * 0.4, cy - orbR * 0.5, cx + orbR * 0.4, cy + orbR * 0.5);
    noteGrad.addColorStop(0, "#ffffff");
    noteGrad.addColorStop(0.5, "#f5bccb");
    noteGrad.addColorStop(1, "#ff4d6d");
    ctx.fillStyle = noteGrad;
    ctx.strokeStyle = noteGrad;

    const stemX = cx + size * 0.04;
    const headX = cx - size * 0.05;
    const headY = cy + size * 0.14;
    ctx.beginPath();
    ctx.ellipse(headX, headY, size * 0.09, size * 0.064, -0.35, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = Math.max(3, size * 0.042);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(stemX, headY - size * 0.02);
    ctx.lineTo(stemX, cy - size * 0.19);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(stemX, cy - size * 0.19);
    ctx.bezierCurveTo(stemX + size * 0.16, cy - size * 0.15, stemX + size * 0.15, cy - size * 0.02, stemX + size * 0.06, cy + size * 0.01);
    ctx.lineWidth = Math.max(2.5, size * 0.036);
    ctx.stroke();
  }

  function renderNoViz(w, h) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = runtime.surfaceMode || runtime.isFullscreen ? "#000000" : "rgba(6, 1, 3, 0.88)";
    ctx.fillRect(0, 0, w, h);
  }

  function renderAlbumArt(w, h, dtSec, isPlaying) {
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = runtime.surfaceMode || runtime.isFullscreen ? "#000000" : "#070103";
    ctx.fillRect(0, 0, w, h);

    const pulse = isPlaying ? (meter.bass * 0.022 + meter.beatPulse * 0.014) : 0;
    const baseSize = Math.max(92, Math.min(w * 0.44, h * 0.56));
    const size = baseSize * (1 + pulse);
    const x = (w - size) * 0.5;
    const y = Math.max(28, (h - size) * 0.40);

    const bgGlow = ctx.createRadialGradient(x + size * 0.5, y + size * 0.5, size * 0.1, x + size * 0.5, y + size * 0.5, size * 0.95);
    bgGlow.addColorStop(0, hslColor(0, 0.14 + (isPlaying ? meter.bass * 0.16 : 0.03), 12));
    bgGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = bgGlow;
    ctx.fillRect(0, 0, w, h);

    const hasArt = !!(coverImg && loadedCoverSrc && coverImg.naturalWidth > 0);
    if (hasArt) {
      ctx.drawImage(coverImg, x, y, size, size);
      ctx.strokeStyle = "rgba(255, 224, 232, 0.24)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    } else {
      drawWmpFallbackNote(x, y, size, isPlaying ? meter.beatPulse : 0);
    }

    const refTop = y + size + 2;
    const refH = Math.max(20, Math.min(h - refTop, size * 0.56));
    if (refH > 8) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, refTop, size, refH);
      ctx.clip();
      ctx.translate(x, refTop);
      ctx.scale(1, -1);
      if (hasArt) {
        ctx.drawImage(coverImg, 0, -size, size, size);
      } else {
        drawWmpFallbackNote(0, -size, size, isPlaying ? meter.beatPulse : 0);
      }
      ctx.restore();

      const fadeGrad = ctx.createLinearGradient(0, refTop, 0, refTop + refH);
      fadeGrad.addColorStop(0, "rgba(0, 0, 0, 0.54)");
      fadeGrad.addColorStop(0.65, "rgba(0, 0, 0, 0.92)");
      fadeGrad.addColorStop(1, "#000000");
      ctx.fillStyle = fadeGrad;
      ctx.fillRect(x - 1, refTop, size + 2, refH + 2);
    }
  }

  function renderAlchemy(w, h, dtSec, isPlaying, preset) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const minDim = Math.min(w, h);
    const e = isPlaying ? meter.softEnergy : 0.14;
    const b = isPlaying ? meter.softBass : 0.12;
    const m = isPlaying ? meter.mid : 0.10;
    const ph = runtime.driftPhase;

    if (preset === "random") {
      applyFeedbackPass(w, h, 1.004, 0.002 * runtime.spinDir, isPlaying ? 0.16 : 0.24, 0, 0, 0.85);
      ctx.globalCompositeOperation = "screen";

      for (let c = 0; c < 3; c++) {
        const px = cx + Math.sin(ph * (0.38 + c * 0.14) + c * 2.1) * w * 0.26;
        const py = cy + Math.cos(ph * (0.31 + c * 0.11) + c * 1.7) * h * 0.22;
        const rad = minDim * (0.24 + c * 0.06 + b * 0.08);
        const cg = ctx.createRadialGradient(px, py, 0, px, py, rad);
        cg.addColorStop(0, hslColor(c * 88 + 20, 0.065 + e * 0.05, -8));
        cg.addColorStop(0.55, hslColor(c * 88 + 64, 0.025 + m * 0.025, -20));
        cg.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let wv = 0; wv < 4; wv++) {
        const pts = [];
        const baseY = h * (0.28 + wv * 0.15);
        for (let s = 0; s <= 24; s++) {
          const tx = s / 24;
          const bVal = meter.bins[(s * 2 + wv * 7) % 48];
          const wVal = meter.wave[(s * 5 + wv * 17) & 127];
          const env = Math.sin(tx * Math.PI);
          const x = w * (0.04 + tx * 0.92);
          const y =
            baseY +
            Math.sin(tx * 4.2 + ph * (0.55 + wv * 0.15) + wv * 1.3) * h * 0.14 +
            (bVal * 0.12 * (wv % 2 === 0 ? 1 : -1) + wVal * 0.08) * h * env;
          pts.push({ x, y });
        }
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, "rgba(0, 0, 0, 0)");
        grad.addColorStop(0.25, hslColor(wv * 54 + 12, 0.16 + e * 0.12, 4));
        grad.addColorStop(0.75, hslColor(wv * 54 + 125, 0.16 + e * 0.12, 6));
        grad.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = minDim * (0.005 + b * 0.004);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) * 0.5;
          const my = (pts[i].y + pts[i + 1].y) * 0.5;
          ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    applyFeedbackPass(w, h, 1.004, 0.002 * runtime.spinDir, isPlaying ? 0.22 : 0.28, 0, 0, 0.80);
    ctx.globalCompositeOperation = "screen";

    const isSpectrum = preset === "spectrum";
    const hazeGrad = ctx.createRadialGradient(cx, cy, minDim * 0.08, cx, cy, minDim * 0.72);
    hazeGrad.addColorStop(0, hslColor(isSpectrum ? 16 : -6, 0.04 + b * 0.04, -18));
    hazeGrad.addColorStop(0.55, hslColor(isSpectrum ? 175 : 185, 0.035 + m * 0.03, -24));
    hazeGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = hazeGrad;
    ctx.fillRect(0, 0, w, h);

    const cloudPairs = 4;
    for (let c = 0; c < cloudPairs; c++) {
      const f = c / cloudPairs;
      const bVal = meter.bins[(c * 10) % 48];
      const ox = Math.sin(ph * (0.42 + c * 0.11) + c * 1.7) * w * (0.17 + f * 0.16);
      const oy = Math.cos(ph * (0.37 + c * 0.09) + c * 2.4) * h * (0.15 + f * 0.14);
      const rad = minDim * (0.14 + f * 0.12 + b * 0.06 + bVal * 0.05);
      const hueA = isSpectrum ? c * 68 : -10 + c * 26;
      const hueB = hueA + 165;

      for (let mx = -1; mx <= 1; mx += 2) {
        for (let my = -1; my <= 1; my += 2) {
          const px = cx + ox * mx;
          const py = cy + oy * my;
          const cg = ctx.createRadialGradient(px, py, 0, px, py, rad);
          cg.addColorStop(0, hslColor(mx > 0 ? hueA : hueB, 0.065 + e * 0.060, -6));
          cg.addColorStop(0.5, hslColor(mx > 0 ? hueA + 18 : hueB - 14, 0.032 + bVal * 0.030, -18));
          cg.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const ribbonBand = ctx.createLinearGradient(0, cy - minDim * 0.05, 0, cy + minDim * 0.05);
    ribbonBand.addColorStop(0, "rgba(0, 0, 0, 0)");
    ribbonBand.addColorStop(0.5, hslColor(isSpectrum ? 35 : -4, 0.045 + e * 0.055, -4));
    ribbonBand.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = ribbonBand;
    ctx.fillRect(0, cy - minDim * 0.05, w, minDim * 0.10);

    ctx.globalCompositeOperation = "source-over";
    const softCenter = ctx.createRadialGradient(cx, cy, 0, cx, cy, minDim * 0.34);
    softCenter.addColorStop(0, "rgba(8, 2, 10, 0.16)");
    softCenter.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = softCenter;
    ctx.fillRect(0, 0, w, h);
  }

  function renderAmbience(w, h, dtSec, isPlaying, preset) {
    ensureFxBuffer();
    const minDim = Math.min(w, h);
    const tp = runtime.tunnelPhase;
    const ph = runtime.phase;
    const dp = runtime.driftPhase;
    const bassBoost = isPlaying ? meter.softBass : 0.12;
    const midBoost = isPlaying ? meter.softEnergy : 0.10;
    const satFrac = (config.rgbRotate ? Math.max(76, config.sat) : config.sat) * 0.01;
    const baseHue = runtime.rotHue;

    if (preset === "fire") {
      for (let y = 0; y < FX_H; y++) {
        const ny = y / (FX_H - 1);
        const up = 1 - ny;
        for (let x = 0; x < FX_W; x++) {
          const i = y * FX_W + x;
          const nx = fxNormX[i];
          const tongue =
            Math.sin(nx * 4.6 + ph * 1.1 + Math.sin(up * 4.0 - ph * 1.7) * 1.1) * 0.44 +
            Math.cos(nx * 8.2 - tp * 1.8 + up * 5.2) * 0.30 +
            Math.sin((nx * 2.8 - up * 6.8) + tp * 2.3) * 0.24;
          const heat = Math.max(0, Math.min(1.1, (up * (0.88 + bassBoost * 0.38) + tongue * 0.24 - Math.abs(nx) * 0.36)));
          const l = Math.min(0.58, Math.pow(heat, 1.65) * 0.52);
          const hue = baseHue + heat * 42 - 22;
          hslToRgb(hue, satFrac, l, rgbScratch);
          fxU32[i] = (255 << 24) | (rgbScratch[2] << 16) | (rgbScratch[1] << 8) | rgbScratch[0];
        }
      }
      flushFxToMain(w, h);
    } else if (preset === "water") {
      const s1x = Math.sin(dp * 0.6) * 0.45;
      const s1y = Math.cos(dp * 0.8) * 0.35;
      const s2x = Math.cos(dp * 0.5) * 0.52;
      const s2y = Math.sin(dp * 0.7) * 0.42;
      for (let i = 0; i < FX_W * FX_H; i++) {
        const nx = fxNormX[i];
        const ny = fxNormY[i];
        const d1 = Math.sqrt((nx - s1x) * (nx - s1x) + (ny - s1y) * (ny - s1y));
        const d2 = Math.sqrt((nx - s2x) * (nx - s2x) + (ny - s2y) * (ny - s2y));
        const ripple = Math.sin(d1 * 14 - ph * 1.8) * 0.5 + Math.cos(d2 * 13 - ph * 1.5) * 0.5;
        const caustic = Math.pow(Math.max(0, 0.52 + ripple * 0.48), 2.0) * (0.42 + bassBoost * 0.38);
        const hue = baseHue + ripple * 48 + d1 * 26;
        hslToRgb(hue, satFrac * 0.88, Math.min(0.60, 0.08 + caustic * 0.50), rgbScratch);
        fxU32[i] = (255 << 24) | (rgbScratch[2] << 16) | (rgbScratch[1] << 8) | rgbScratch[0];
      }
      flushFxToMain(w, h);
    } else {
      for (let i = 0; i < FX_W * FX_H; i++) {
        const d = fxDist[i];
        const a = fxAng[i];
        const nx = fxNormX[i];
        const ny = fxNormY[i];

        const warp =
          Math.sin(a * 3 + dp * 0.9) * (0.11 + midBoost * 0.08) +
          Math.cos(a * 5 - ph * 0.55) * (0.06 + bassBoost * 0.04) +
          Math.sin(nx * 4.2 + ny * 3.8 + tp * 0.8) * 0.07 +
          Math.cos(nx * 7.4 - ny * 6.8 - ph * 0.75) * 0.04;

        const voidEdge = 0.22 + warp * 0.48 - bassBoost * 0.025;
        if (d <= voidEdge * 0.78) {
          fxU32[i] = 0xff000000;
          continue;
        }

        const radialWave = Math.sin((d + warp) * 11.5 - tp * 3.1);
        const cloudRipple = Math.cos((d - warp * 0.65) * 18.0 - ph * 1.6 + Math.sin(a * 4 + dp * 0.8) * 1.4);
        const fineGrain = Math.sin(nx * 10.5 + ny * 9.0 - tp * 1.2) * 0.14;
        const ringMix = Math.max(0, 0.46 + 0.32 * radialWave + 0.20 * cloudRipple + fineGrain);
        const contrasted = Math.pow(ringMix, 1.75);

        let edgeFade = (d - voidEdge * 0.78) / 0.19;
        if (edgeFade < 0) edgeFade = 0;
        if (edgeFade > 1) edgeFade = 1;
        let outerFade = 1 - Math.max(0, (d - 0.85) / 0.75);
        if (outerFade < 0) outerFade = 0;

        const lum = Math.max(0, Math.min(0.54, edgeFade * outerFade * (0.02 + contrasted * (0.40 + bassBoost * 0.22))));
        const hue = baseHue + radialWave * 48 + cloudRipple * 28 + d * 36;
        hslToRgb(hue, satFrac * 0.88, lum, rgbScratch);
        fxU32[i] = (255 << 24) | (rgbScratch[2] << 16) | (rgbScratch[1] << 8) | rgbScratch[0];
      }
      flushFxToMain(w, h);
    }
  }

  function renderBarsAndWaves(w, h, dtSec, isPlaying, preset) {
    if (preset === "mist") {
      applyFeedbackPass(w, h, 1.012, 0, isPlaying ? 0.14 : 0.24, 0, isPlaying ? 0.012 : 0.003, 0.88);
      ctx.globalCompositeOperation = "lighter";
      const cy = h * 0.5;
      for (let pass = 0; pass < 2; pass++) {
        const sign = pass === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.lineWidth = 2.6 + meter.bass * 1.6;
        ctx.strokeStyle = hslColor(pass * 38, 0.86, pass === 0 ? 22 : 12);
        for (let i = 0; i < 128; i++) {
          const px = (i / 127) * w;
          const b = meter.bins[(i * 47) >> 7];
          const env = Math.sin((i / 127) * Math.PI);
          const y = cy + sign * (b * h * (0.28 + meter.bass * 0.14) * env + meter.wave[i] * h * 0.11);
          if (i === 0) ctx.moveTo(px, y);
          else ctx.lineTo(px, y);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = runtime.surfaceMode || runtime.isFullscreen ? "#000000" : "rgba(5, 1, 2, 0.86)";
    ctx.fillRect(0, 0, w, h);

    if (preset === "scope") {
      const cy = h * 0.5;
      const padX = Math.max(12, w * 0.025);
      const uw = w - padX * 2;
      ctx.strokeStyle = hslColor(0, 0.22, -16);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padX, cy);
      ctx.lineTo(padX + uw, cy);
      ctx.stroke();

      ctx.globalCompositeOperation = "lighter";
      for (let pass = 0; pass < 3; pass++) {
        ctx.beginPath();
        ctx.lineWidth = pass === 0 ? 6.5 : pass === 1 ? 2.8 : 1.1;
        ctx.strokeStyle = hslColor(pass === 2 ? 24 : 0, pass === 0 ? 0.26 : pass === 1 ? 0.85 : 0.98, pass === 2 ? 44 : 18);
        const amp = h * (0.14 + meter.energy * 0.18 + meter.kick * 0.05);
        for (let i = 0; i < 128; i++) {
          const px = padX + (i / 127) * uw;
          const py = cy + meter.wave[i] * amp;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = hslColor(55, 0.72, 26);
      const ampB = h * (0.10 + meter.high * 0.14);
      for (let i = 0; i < 128; i++) {
        const px = padX + (i / 127) * uw;
        const py = cy + meter.waveB[i] * ampB;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    const barCount = 32;
    const padX = Math.max(8, w * 0.018);
    const floorY = h - Math.max(10, h * 0.032);
    const maxH = h * 0.82;
    const slotW = (w - padX * 2) / barCount;
    const gap = Math.max(2, Math.floor(slotW * 0.14));
    const barW = Math.max(3, slotW - gap);
    const capH = Math.max(3, Math.min(6, Math.round(h * 0.009)));

    for (let i = 0; i < barCount; i++) {
      const val = meter.bins32[i];
      const peakVal = meter.peaks32[i];
      const bx = Math.round(padX + i * slotW + gap * 0.5);
      const bh = Math.max(3, Math.round(val * maxH));
      const by = floorY - bh;

      const barGrad = ctx.createLinearGradient(0, by, 0, floorY);
      barGrad.addColorStop(0, hslColor(i * 2.2 + 12, 1.0, 26));
      barGrad.addColorStop(0.55, hslColor(i * 1.4, 0.96, 4));
      barGrad.addColorStop(1, hslColor(-14, 0.92, -22));
      ctx.fillStyle = barGrad;
      ctx.fillRect(bx, by, barW, bh);

      const peakY = Math.min(floorY - capH, Math.round(floorY - Math.max(bh + capH + 2, peakVal * maxH)));
      ctx.fillStyle = hslColor(i * 2.2 + 24, 1.0, 42);
      ctx.fillRect(bx, peakY, barW, capH);
    }
  }

  function renderBattery(w, h, dtSec, isPlaying, preset) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const minDim = Math.min(w, h);

    if (preset === "smokewater" || preset === "brightsphere") {
      ensureFxBuffer();
      const ph = runtime.driftPhase * 0.95;
      const tp = runtime.tunnelPhase * 0.62;
      const satFrac = (config.rgbRotate ? Math.max(74, config.sat) : config.sat) * 0.01;
      const baseHue = runtime.rotHue;
      const e = isPlaying ? meter.softEnergy : 0.14;

      for (let i = 0; i < FX_W * FX_H; i++) {
        const nx = fxNormX[i];
        const ny = fxNormY[i];
        const d = fxDist[i];
        const wx = nx * 2.8 + Math.sin(ny * 2.5 + ph * 0.62) * 1.15;
        const wy = ny * 2.8 + Math.cos(nx * 2.3 - tp * 0.54) * 1.15;
        const swirl =
          Math.sin(wx + Math.cos(wy * 1.35 + ph * 0.48) * 1.12) * 0.54 +
          Math.cos(wy - Math.sin(wx * 1.25 - tp * 0.44) * 1.08) * 0.50 +
          Math.sin((wx - wy) * 0.92 + ph * 0.36) * 0.36;
        const nrm = Math.max(0, 0.5 + swirl * 0.25);
        const hue = preset === "smokewater" ? baseHue + 150 + swirl * 34 : baseHue + swirl * 44 + (nx + ny) * 26;
        const glow = preset === "smokewater"
          ? Math.max(0.03, Math.min(0.48, Math.pow(nrm, 1.35) * (0.36 + e * 0.26)))
          : Math.max(0.02, Math.min(0.46, Math.pow(nrm, 1.40) * (0.35 + e * 0.28) * Math.max(0.28, 1.05 - Math.max(0, d - 0.55) * 0.55)));
        hslToRgb(hue, satFrac, glow, rgbScratch);
        fxU32[i] = (255 << 24) | (rgbScratch[2] << 16) | (rgbScratch[1] << 8) | rgbScratch[0];
      }
      flushFxToMain(w, h);

      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";
      if (preset === "brightsphere") {
        for (let c = 0; c < 3; c++) {
          const ax = cx + Math.sin(ph * (0.44 + c * 0.16) + c * 2.2) * w * 0.24;
          const ay = cy + Math.cos(ph * (0.36 + c * 0.12) + c * 1.5) * h * 0.22;
          const rad = minDim * (0.28 + c * 0.08 + meter.softBass * 0.10);
          const ag = ctx.createRadialGradient(ax, ay, 0, ax, ay, rad);
          ag.addColorStop(0, hslColor(c * 72 + 12, 0.08 + e * 0.06, 6));
          ag.addColorStop(0.55, hslColor(c * 72 + 44, 0.035 + e * 0.03, -8));
          ag.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = ag;
          ctx.beginPath();
          ctx.arc(ax, ay, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        for (let wv = 0; wv < 3; wv++) {
          const yBase = h * (0.28 + wv * 0.22);
          ctx.beginPath();
          for (let s = 0; s <= 24; s++) {
            const tx = s / 24;
            const sx = tx * w;
            const sy = yBase + Math.sin(tx * 4.6 + ph * (0.65 + wv * 0.18) + wv * 1.6) * h * (0.06 + meter.softBass * 0.045);
            if (s === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
          }
          ctx.lineWidth = minDim * 0.048;
          ctx.strokeStyle = hslColor(150 + wv * 34, 0.065 + meter.softEnergy * 0.04, 4);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    if (preset === "whirlpool") {
      const zoom = isPlaying ? (1.028 + meter.softBass * 0.036) : 1.008;
      const rot = isPlaying ? ((0.028 + meter.softEnergy * 0.038) * runtime.spinDir) : 0.006;
      applyFeedbackPass(w, h, zoom, rot, isPlaying ? 0.14 : 0.22, 0, 0, 0.89);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const arms = 6;
      const steps = 128;
      const maxR = minDim * 0.49;
      for (let a = 0; a < arms; a++) {
        const baseA = (a / arms) * Math.PI * 2 + runtime.spiralPhase;
        for (let pass = 0; pass < 2; pass++) {
          ctx.beginPath();
          ctx.lineWidth = pass === 0 ? 7.0 : 2.2;
          ctx.strokeStyle = hslColor(a * 48 + pass * 14, pass === 0 ? 0.16 : 0.54, pass === 0 ? 12 : 20);
          for (let s = 0; s < steps; s++) {
            const t = s / (steps - 1);
            const bIdx = Math.floor(t * 47);
            const b = (meter.bins[Math.max(0, bIdx - 1)] + meter.bins[bIdx] * 2 + meter.bins[Math.min(47, bIdx + 1)]) * 0.25;
            const wIdx = Math.floor(t * 127);
            const wv = (meter.wave[(wIdx - 1) & 127] + meter.wave[wIdx] * 2 + meter.wave[(wIdx + 1) & 127]) * 0.25;
            const r = t * maxR * (0.88 + meter.softBass * 0.18);
            const th = baseA + t * (5.2 + meter.mid * 1.8) * runtime.spinDir + Math.sin(t * 10 - runtime.phase * 1.2) * 0.18;
            const x = cx + Math.cos(th) * (r + b * 24 + wv * 10);
            const y = cy + Math.sin(th) * (r + b * 24 + wv * 10);
            if (s === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    applyFeedbackPass(w, h, isPlaying ? (1.028 + meter.softBass * 0.030) : 1.008, isPlaying ? (0.010 * runtime.spinDir) : 0.002, 0.22, 0, 0, 0.86);
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const bolts = 10;
    for (let b = 0; b < bolts; b++) {
      const segs = 14;
      const baseAng = (b / bolts) * Math.PI * 2 + runtime.phase * 0.34 * (b % 2 ? 1 : -1);
      const reach = minDim * (0.28 + meter.bins[(b * 4) % 48] * 0.22 + meter.softBass * 0.09);
      const pts = [];
      for (let s = 1; s <= segs; s++) {
        const t = s / segs;
        const wi = (b * 13 + s * 6) & 127;
        const j = ((meter.wave[(wi - 1) & 127] + meter.wave[wi] * 2 + meter.wave[(wi + 1) & 127]) * 0.25) * (0.16 + meter.snare * 0.12);
        const curAng = baseAng + j;
        pts.push({
          x: cx + Math.cos(curAng) * reach * t,
          y: cy + Math.sin(curAng) * reach * t
        });
      }
      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        for (let s = 0; s < pts.length - 1; s++) {
          const mx = (pts[s].x + pts[s + 1].x) * 0.5;
          const my = (pts[s].y + pts[s + 1].y) * 0.5;
          ctx.quadraticCurveTo(pts[s].x, pts[s].y, mx, my);
        }
        ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        ctx.lineWidth = pass === 0 ? 6.2 : 2.0;
        ctx.strokeStyle = hslColor(b * 36 + 18, pass === 0 ? 0.16 : 0.48, pass === 0 ? 8 : 18);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function drawSmoothCurve(pts, closed) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    if (closed) {
      const n = pts.length;
      const startMx = (pts[n - 1].x + pts[0].x) * 0.5;
      const startMy = (pts[n - 1].y + pts[0].y) * 0.5;
      ctx.moveTo(startMx, startMy);
      for (let i = 0; i < n; i++) {
        const next = pts[(i + 1) % n];
        const mx = (pts[i].x + next.x) * 0.5;
        const my = (pts[i].y + next.y) * 0.5;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.closePath();
    } else {
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 0; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) * 0.5;
        const my = (pts[i].y + pts[i + 1].y) * 0.5;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    }
  }

  function project3dPoint(lx, ly, lz, cx, cy, scaleXY, cyw, syw, cp, sp, cr, sr, fov) {
    const x1 = lx * cyw - lz * syw;
    const z1 = lx * syw + lz * cyw;
    const y2 = ly * cp - z1 * sp;
    const z2 = ly * sp + z1 * cp;
    const xr = x1 * cr - y2 * sr;
    const yr = x1 * sr + y2 * cr;
    const depth = fov + z2;
    if (depth <= 0.25) return null;
    const pScale = fov / depth;
    return {
      x: cx + xr * scaleXY * pScale,
      y: cy + yr * scaleXY * pScale,
      s: pScale
    };
  }

  function renderParticle(w, h, dtSec, isPlaying, preset) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const minDim = Math.min(w, h);
    const e = isPlaying ? meter.softEnergy : 0.14;
    const b = isPlaying ? meter.softBass : 0.12;
    const ph = runtime.driftPhase;

    if (preset === "aurora") {
      applyFeedbackPass(w, h, 1.003, 0, isPlaying ? 0.14 : 0.22, 0, -0.008, 0.88);
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";
      const curtains = 4;
      const cols = 36;
      for (let c = 0; c < curtains; c++) {
        const yBase = h * (0.40 + c * 0.14);
        const pts = [];
        const ribbonH = h * (0.24 + (3 - c) * 0.04 + b * 0.12);
        for (let s = 0; s <= cols; s++) {
          const tx = s / cols;
          const bVal = meter.bins[(s + c * 9) % 48];
          const wVal = meter.wave[(s * 3 + c * 23) & 127];
          const px = w * (-0.04 + tx * 1.08);
          const py = yBase + Math.sin(tx * 4.4 + ph * (0.48 + c * 0.12) + c * 1.7) * h * 0.08 + wVal * h * 0.045 - bVal * h * 0.06;
          pts.push({ x: px, y: py, h: ribbonH * (0.65 + bVal * 0.55) });
        }
        const aurGrad = ctx.createLinearGradient(0, yBase - ribbonH, 0, yBase + h * 0.12);
        aurGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
        aurGrad.addColorStop(0.55, hslColor(135 + c * 42, 0.095 + e * 0.065, 2));
        aurGrad.addColorStop(0.88, hslColor(175 + c * 38, 0.16 + e * 0.09, 10));
        aurGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let s = 0; s < pts.length - 1; s++) {
          const mx = (pts[s].x + pts[s + 1].x) * 0.5;
          const my = (pts[s].y + pts[s + 1].y) * 0.5;
          ctx.quadraticCurveTo(pts[s].x, pts[s].y, mx, my);
        }
        for (let s = pts.length - 1; s >= 0; s--) {
          ctx.lineTo(pts[s].x, pts[s].y - pts[s].h);
        }
        ctx.closePath();
        ctx.fillStyle = aurGrad;
        ctx.fill();

        drawSmoothCurve(pts, false);
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = hslColor(145 + c * 36, 0.22 + e * 0.14, 14);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    if (preset === "fountain") {
      applyFeedbackPass(w, h, 1.008, 0, isPlaying ? 0.15 : 0.24, 0, 0, 0.88);
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";
      const yaw = runtime.spiralPhase * 0.42;
      const pitch = 0.28 + Math.sin(ph * 0.35) * 0.10;
      const roll = Math.sin(ph * 0.24) * 0.08;
      const cyw = Math.cos(yaw), syw = Math.sin(yaw);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const cr = Math.cos(roll), sr = Math.sin(roll);
      const scaleXY = minDim * (0.64 + b * 0.14);
      const baseCy = cy + minDim * 0.06;
      const fov = 2.5;
      const streams = 180;

      for (let i = 0; i < streams; i++) {
        const life = (runtime.tunnelPhase * 0.44 + ptSeed[i]) % 1;
        const lifePrev = Math.max(0, life - 0.045);
        const ang = ptA[i];
        const vRad = 0.34 + ptR[i] * 0.72;
        const arcH = 0.96 + meter.bins[i % 48] * 0.34 + b * 0.44;

        const pNow = project3dPoint(
          Math.cos(ang) * vRad * life,
          0.74 - (2.42 * life - 1.88 * life * life) * arcH,
          Math.sin(ang) * vRad * life,
          cx, baseCy, scaleXY, cyw, syw, cp, sp, cr, sr, fov
        );
        const pOld = project3dPoint(
          Math.cos(ang) * vRad * lifePrev,
          0.74 - (2.42 * lifePrev - 1.88 * lifePrev * lifePrev) * arcH,
          Math.sin(ang) * vRad * lifePrev,
          cx, baseCy, scaleXY, cyw, syw, cp, sp, cr, sr, fov
        );
        if (!pNow || !pOld) continue;

        const env = Math.sin(life * Math.PI);
        const alpha = env * (0.38 + e * 0.32);
        const hue = (i % 48) * 6.5 + life * 45;
        ctx.strokeStyle = hslColor(hue, alpha * 0.28, 6);
        ctx.lineWidth = Math.max(2.6, pNow.s * (4.4 + e * 1.8));
        ctx.beginPath();
        ctx.moveTo(pOld.x, pOld.y);
        ctx.lineTo(pNow.x, pNow.y);
        ctx.stroke();

        ctx.strokeStyle = hslColor(hue, alpha, 14 + life * 12);
        ctx.lineWidth = Math.max(1.2, pNow.s * (1.8 + e * 1.0));
        ctx.beginPath();
        ctx.moveTo(pOld.x, pOld.y);
        ctx.lineTo(pNow.x, pNow.y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    applyFeedbackPass(w, h, 1.005, 0, isPlaying ? 0.18 : 0.26, 0, 0, 0.85);
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const yaw = runtime.spiralPhase * 0.38;
    const pitch = 0.62 + Math.sin(ph * 0.32) * 0.16;
    const roll = 0.18 + Math.sin(ph * 0.26) * 0.12;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const scaleXY = minDim * (0.48 + b * 0.08);
    const fov = 2.6;
    const rows = 14;
    const cols = 22;

    for (let r = 0; r < rows; r++) {
      const rz = (r / (rows - 1) - 0.5) * 1.45;
      const linePts = [];
      for (let c = 0; c < cols; c++) {
        const cx3 = (c / (cols - 1) - 0.5) * 1.65;
        const dist = Math.sqrt(cx3 * cx3 + rz * rz);
        const bVal = meter.bins[Math.floor((c / cols) * 47)];
        const wVal = meter.wave[((c * 5 + r * 7) & 127)];
        const ripple = Math.sin(dist * 5.8 - runtime.phase * 2.1) * (0.08 + b * 0.16);
        const ly = ripple + bVal * (0.14 + e * 0.18) * Math.cos(rz * 1.6) + wVal * 0.08;
        const pt = project3dPoint(cx3, -ly, rz, cx, cy, scaleXY, cyw, syw, cp, sp, cr, sr, fov);
        if (pt) linePts.push(pt);
      }
      if (linePts.length < 2) continue;
      for (let pass = 0; pass < 2; pass++) {
        drawSmoothCurve(linePts, false);
        ctx.lineWidth = pass === 0 ? 5.2 : 1.7;
        ctx.strokeStyle = hslColor(r * 18 + pass * 14, pass === 0 ? (0.10 + e * 0.08) : (0.34 + e * 0.22), pass === 0 ? 4 : 16);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function renderPlenoptic(w, h, dtSec, isPlaying, preset) {
    const minDim = Math.min(w, h);
    const cx = w * 0.5;
    const cy = h * 0.5;
    const e = isPlaying ? meter.softEnergy : 0.14;
    const b = isPlaying ? meter.softBass : 0.12;
    const ph = runtime.driftPhase;

    if (preset === "prism") {
      applyFeedbackPass(w, h, isPlaying ? (1.022 + b * 0.024) : 1.006, isPlaying ? 0.009 * runtime.spinDir : 0.002, 0.14, 0, 0, 0.89);
      ctx.globalCompositeOperation = "screen";
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      const petals = 6;
      const samples = 48;
      const rings = 7;
      for (let rIdx = 0; rIdx < rings; rIdx++) {
        const prog = ((rIdx / rings) + runtime.tunnelPhase * 0.28) % 1;
        const rad = minDim * (0.05 + Math.pow(prog, 1.45) * 0.54);
        const rot = runtime.phase * 0.22 * (rIdx % 2 ? 1 : -1) + prog * 0.72;
        const pts = [];
        for (let s = 0; s < samples; s++) {
          const ang = (s / samples) * Math.PI * 2 + rot;
          const bVal = meter.bins[(s + rIdx * 5) % 48];
          const lobe = 1 + Math.sin(ang * petals + ph * 0.65) * (0.12 + bVal * 0.14);
          pts.push({
            x: cx + Math.cos(ang) * rad * lobe,
            y: cy + Math.sin(ang) * rad * lobe
          });
        }
        for (let pass = 0; pass < 2; pass++) {
          drawSmoothCurve(pts, true);
          ctx.lineWidth = pass === 0 ? (6.4 + prog * 3.0) : (1.8 + prog * 1.2);
          ctx.strokeStyle = hslColor(rIdx * 42 + pass * 16, Math.sin(prog * Math.PI) * (pass === 0 ? 0.14 : 0.42), pass === 0 ? 6 : 16);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    if (preset === "fractal") {
      applyFeedbackPass(w, h, isPlaying ? (1.012 + b * 0.016) : 1.005, 0.005 * runtime.spinDir, 0.14, 0, 0, 0.88);
      ctx.globalCompositeOperation = "screen";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const loops = 2;
      const samples = 72;
      for (let l = 0; l < loops; l++) {
        const pts = [];
        const kA = l === 0 ? 3 : 4;
        const kB = l === 0 ? 5 : 7;
        const rot = runtime.phase * (0.24 + l * 0.12) * (l === 0 ? 1 : -1);
        for (let s = 0; s < samples; s++) {
          const ang = (s / samples) * Math.PI * 2;
          const bVal = meter.bins[(s * 2 + l * 13) % 48];
          const rr = minDim * (0.18 + b * 0.10 + bVal * 0.08);
          const x =
            cx +
            Math.cos(ang * kA + rot) * rr * 0.62 +
            Math.sin(ang * kB - ph * 0.85) * rr * 0.42;
          const y =
            cy +
            Math.sin(ang * kA + rot) * rr * 0.62 +
            Math.cos(ang * (kB - 2) + ph * 0.72) * rr * 0.42;
          pts.push({ x, y });
        }
        for (let pass = 0; pass < 2; pass++) {
          drawSmoothCurve(pts, true);
          ctx.lineWidth = pass === 0 ? 6.8 : 1.9;
          ctx.strokeStyle = hslColor(l * 140 + ph * 24, pass === 0 ? (0.12 + e * 0.08) : (0.36 + e * 0.20), pass === 0 ? 6 : 16);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = "source-over";
      return;
    }

    applyFeedbackPass(w, h, isPlaying ? (1.016 + b * 0.016) : 1.006, 0.003 * runtime.spinDir, isPlaying ? 0.09 : 0.16, 0, 0, 0.91);
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const waveRings = 3;
    const ptsCount = 48;
    for (let r = 0; r < waveRings; r++) {
      const exp = ((r / waveRings) + runtime.tunnelPhase * 0.24) % 1;
      const baseR = minDim * (0.08 + exp * 0.34) * (0.92 + b * 0.14);
      const pts = [];
      for (let i = 0; i < ptsCount; i++) {
        const ang = (i / ptsCount) * Math.PI * 2 + ph * (0.28 + r * 0.1) * (r % 2 ? -1 : 1);
        const wIdx = Math.floor((i / ptsCount) * 128 + r * 31) & 127;
        const smoothWv = (meter.wave[(wIdx - 2) & 127] + meter.wave[(wIdx - 1) & 127] * 2 + meter.wave[wIdx] * 3 + meter.wave[(wIdx + 1) & 127] * 2 + meter.wave[(wIdx + 2) & 127]) / 9;
        const binMod = meter.bins[(i + r * 11) % 48];
        const rad = Math.max(12, baseR + smoothWv * minDim * 0.055 + binMod * minDim * 0.045);
        pts.push({
          x: cx + Math.cos(ang) * rad,
          y: cy + Math.sin(ang) * rad
        });
      }
      const envAlpha = Math.sin(exp * Math.PI);
      for (let pass = 0; pass < 2; pass++) {
        drawSmoothCurve(pts, true);
        ctx.lineWidth = pass === 0 ? 11.5 : 2.6;
        ctx.strokeStyle = hslColor(r * 95 + ph * 18, envAlpha * (pass === 0 ? 0.14 : 0.36), pass === 0 ? 4 : 16);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function renderSpikes(w, h, dtSec, isPlaying, preset) {
    const cx = w * 0.5 + (isPlaying ? meter.shakeX * w * 0.5 : 0);
    const cy = h * 0.5 + (isPlaying ? meter.shakeY * h * 0.5 : 0);
    const minDim = Math.min(w, h);
    const maxDim = Math.max(w, h);

    const zoom = isPlaying ? (1.030 + meter.softBass * 0.032) : 1.008;
    const twist = isPlaying && preset === "corona" ? 0.015 * runtime.spinDir : 0;
    applyFeedbackPass(w, h, zoom, twist, isPlaying ? 0.26 : 0.32, 0, 0, 0.82);
    ctx.globalCompositeOperation = "screen";

    const folds = 8;
    const raysPerHalf = 5;
    const sectorAng = Math.PI * 2 / folds;
    const spinBase = preset === "crossfire" ? runtime.phase * 0.22 : Math.sin(runtime.driftPhase * 0.55) * 0.14;

    for (let f = 0; f < folds; f++) {
      const fBase = f * sectorAng + spinBase;
      for (let m = -1; m <= 1; m += 2) {
        for (let r = 0; r < raysPerHalf; r++) {
          const frac = (r + 0.35) / raysPerHalf;
          const bIdx = (r * 7 + f * 3) % 48;
          const bVal = meter.bins[bIdx];
          const wVal = Math.abs(meter.wave[(r * 19 + f * 11) & 127]);
          const ang = fBase + m * frac * (sectorAng * 0.48);
          const len = maxDim * (0.15 + bVal * 0.32 + wVal * 0.09 + meter.softBass * 0.12);
          const spread = 0.028 + (1 - frac) * 0.028;
          const rCore = minDim * (0.048 + meter.softBass * 0.018);

          const x0 = cx + Math.cos(ang - spread) * rCore;
          const y0 = cy + Math.sin(ang - spread) * rCore;
          const x1 = cx + Math.cos(ang + spread) * rCore;
          const y1 = cy + Math.sin(ang + spread) * rCore;
          const xTip = cx + Math.cos(ang) * len;
          const yTip = cy + Math.sin(ang) * len;

          const spGrad = ctx.createLinearGradient(cx + Math.cos(ang) * rCore, cy + Math.sin(ang) * rCore, xTip, yTip);
          spGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
          spGrad.addColorStop(0.18, hslColor(r * 24 + 10, 0.22, 6));
          spGrad.addColorStop(0.48, hslColor(r * 28 + 14, 0.28, 10));
          spGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

          ctx.fillStyle = spGrad;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(xTip, yTip);
          ctx.lineTo(x1, y1);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    if (preset === "crossfire") {
      const rings = 3;
      for (let i = 0; i < rings; i++) {
        const rr = minDim * (0.11 + i * 0.12 + meter.softBass * 0.035);
        ctx.strokeStyle = hslColor(i * 42, 0.18, 10);
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.globalCompositeOperation = "source-over";
    const aperture = ctx.createRadialGradient(cx, cy, 0, cx, cy, minDim * 0.085);
    aperture.addColorStop(0, "rgba(0, 0, 0, 0.42)");
    aperture.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = aperture;
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.085, 0, Math.PI * 2);
    ctx.fill();
  }

  function getMainViewContainer() {
    return (
      document.getElementById("main-view") ||
      document.querySelector(".R1kU6b2KxZc8FWfbYf3m") ||
      document.querySelector(".main-view-container")
    );
  }

  function getCurrentPathname() {
    if (apis.history && apis.history.location && apis.history.location.pathname) {
      return apis.history.location.pathname;
    }
    return location.pathname;
  }

  function isOnLyricsRoute() {
    if (getCurrentPathname().includes("/lyrics")) return true;
    const lyricsRoot = document.querySelector(".wYWhVPZoG93lR7ogMIug, [data-testid='lyrics-line']");
    if (!lyricsRoot) return false;
    const mainView = getMainViewContainer();
    return !!(mainView && mainView.contains(lyricsRoot));
  }

  function getHostContainerRect() {
    if (runtime.isFullscreen || document.fullscreenElement) {
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    }
    const target = getMainViewContainer();
    if (target) {
      const r = target.getBoundingClientRect();
      if (r.width > 120 && r.height > 120) return r;
    }
    return { left: 0, top: 64, width: window.innerWidth, height: Math.max(200, window.innerHeight - 154) };
  }

  function getStageCanvasRect(hostRect) {
    if (runtime.isFullscreen || document.fullscreenElement) {
      return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    }
    if (runtime.surfaceMode) {
      return {
        left: hostRect.left + 2,
        top: hostRect.top + 2,
        width: Math.max(120, hostRect.width - 4),
        height: Math.max(120, hostRect.height - 58)
      };
    }
    return hostRect;
  }

  function syncCanvasSize(rect) {
    if (!canvas || !ctx) return;
    const mainView = getMainViewContainer();
    const mountInMainView = !runtime.surfaceMode && !!mainView;
    const targetParent = mountInMainView ? mainView : document.body;

    if (canvas.parentNode !== targetParent) {
      if (mountInMainView) {
        mainView.insertBefore(canvas, mainView.firstChild);
      } else {
        document.body.appendChild(canvas);
      }
    }

    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const cw = Math.max(1, Math.floor(rect.width * dpr));
    const ch = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#040102";
      ctx.fillRect(0, 0, cw, ch);
    }

    if (mountInMainView) {
      setStyleSafe(canvas, "position", "absolute");
      setStyleSafe(canvas, "left", "0px");
      setStyleSafe(canvas, "top", "0px");
      setStyleSafe(canvas, "width", "100%");
      setStyleSafe(canvas, "height", "100%");
      setStyleSafe(canvas, "zIndex", "1");
    } else {
      setStyleSafe(canvas, "position", "fixed");
      setStyleSafe(canvas, "left", `${Math.round(rect.left)}px`);
      setStyleSafe(canvas, "top", `${Math.round(rect.top)}px`);
      setStyleSafe(canvas, "width", `${Math.round(rect.width)}px`);
      setStyleSafe(canvas, "height", `${Math.round(rect.height)}px`);
      setStyleSafe(canvas, "zIndex", "30");
    }

    const fbDpr = Math.min(1.1, dpr);
    const fbw = Math.max(1, Math.floor(rect.width * fbDpr));
    const fbh = Math.max(1, Math.floor(rect.height * fbDpr));
    if (fbCanvas.width !== fbw || fbCanvas.height !== fbh) {
      fbCanvas.width = fbw;
      fbCanvas.height = fbh;
      fbCtx.fillStyle = "#040102";
      fbCtx.fillRect(0, 0, fbw, fbh);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function renderLoop(nowMs) {
    if (!runtime.visualActive || document.hidden) {
      runtime.rafId = 0;
      return;
    }

    const dtSec = runtime.lastFrameMs > 0 ? Math.min(0.05, Math.max(0.001, (nowMs - runtime.lastFrameMs) / 1000)) : 0.016;
    runtime.lastFrameMs = nowMs;

    const hostRect = getHostContainerRect();
    const rect = getStageCanvasRect(hostRect);
    syncCanvasSize(rect);

    const w = rect.width;
    const h = rect.height;

    const isPlaying = updateAudioFeatures(dtSec, nowMs);

    if (beatLedEl) {
      const scale = isPlaying ? 1 + meter.beatPulse * 0.55 : 0.85;
      beatLedEl.style.transform = `scale(${scale.toFixed(2)})`;
      beatLedEl.style.opacity = isPlaying ? (0.45 + meter.beatPulse * 0.55).toFixed(2) : "0.28";
      beatLedEl.style.background = isPlaying ? hslColor(0, 1, 18) : "#6b4e57";
      beatLedEl.style.boxShadow = isPlaying && meter.beatPulse > 0.25 ? `0 0 ${Math.round(8 + meter.beatPulse * 10)}px ${hslColor(0, 0.9, 18)}` : "none";
    }

    if (config.model === "none") renderNoViz(w, h);
    else if (config.model === "album") renderAlbumArt(w, h, dtSec, isPlaying);
    else if (config.model === "alchemy") renderAlchemy(w, h, dtSec, isPlaying, config.preset);
    else if (config.model === "ambience") renderAmbience(w, h, dtSec, isPlaying, config.preset);
    else if (config.model === "bars") renderBarsAndWaves(w, h, dtSec, isPlaying, config.preset);
    else if (config.model === "battery") renderBattery(w, h, dtSec, isPlaying, config.preset);
    else if (config.model === "particle") renderParticle(w, h, dtSec, isPlaying, config.preset);
    else if (config.model === "plenoptic") renderPlenoptic(w, h, dtSec, isPlaying, config.preset);
    else renderSpikes(w, h, dtSec, isPlaying, config.preset);

    runtime.rafId = requestAnimationFrame(renderLoop);
  }

  function ensureRenderLoopState() {
    if (runtime.visualActive && !document.hidden) {
      syncCanvasSize(getStageCanvasRect(getHostContainerRect()));
      setStyleSafe(canvas, "display", "block");
      setStyleSafe(canvas, "opacity", runtime.surfaceMode || runtime.isFullscreen ? "1" : "0.78");
      if (!runtime.rafId) {
        runtime.lastFrameMs = performance.now();
        runtime.rafId = requestAnimationFrame(renderLoop);
      }
    } else {
      if (runtime.rafId) {
        cancelAnimationFrame(runtime.rafId);
        runtime.rafId = 0;
      }
      if (canvas) {
        setStyleSafe(canvas, "opacity", "0");
        setStyleSafe(canvas, "display", "none");
      }
    }
  }

  function drawColorWheel() {
    if (!wheelCanvas) return;
    const wctx = wheelCanvas.getContext("2d");
    const size = wheelCanvas.width;
    const r = size / 2;
    const img = wctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - r;
        const dy = y - r;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const idx = (y * size + x) * 4;
        if (dist <= r) {
          let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
          if (deg < 0) deg += 360;
          const sat = Math.min(1, dist / r);
          const c = (1 - Math.abs(0 - 0)) * sat;
          const hp = deg / 60;
          const xVal = c * (1 - Math.abs((hp % 2) - 1));
          let r1 = 0, g1 = 0, b1 = 0;
          if (hp < 1) { r1 = c; g1 = xVal; }
          else if (hp < 2) { r1 = xVal; g1 = c; }
          else if (hp < 3) { g1 = c; b1 = xVal; }
          else if (hp < 4) { g1 = xVal; b1 = c; }
          else if (hp < 5) { r1 = xVal; b1 = c; }
          else { r1 = c; b1 = xVal; }
          const m = 1 - c;
          data[idx] = Math.round((r1 + m) * 255);
          data[idx + 1] = Math.round((g1 + m) * 255);
          data[idx + 2] = Math.round((b1 + m) * 255);
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }
    wctx.putImageData(img, 0, 0);
  }

  function updateWheelMarker() {
    if (!wheelMarker || !wheelCanvas) return;
    const rad = (config.hue * Math.PI) / 180;
    const pct = (config.sat / 100) * 42;
    wheelMarker.style.left = `${(50 + Math.cos(rad) * pct).toFixed(1)}%`;
    wheelMarker.style.top = `${(50 + Math.sin(rad) * pct).toFixed(1)}%`;
  }

  function pickColorFromWheelEvent(ev) {
    if (!wheelCanvas) return;
    const rect = wheelCanvas.getBoundingClientRect();
    const r = rect.width / 2;
    const dx = ev.clientX - (rect.left + r);
    const dy = ev.clientY - (rect.top + r);
    let deg = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const dist = Math.min(r, Math.sqrt(dx * dx + dy * dy));
    config.hue = Math.round(deg);
    config.sat = Math.round((dist / r) * 100);
    config.rgbRotate = false;
    runtime.rotHue = config.hue;
    const cb = document.getElementById("wmp-rgb-rotate-checkbox");
    if (cb) cb.checked = false;
    writeStore(STORE_KEYS.hue, config.hue);
    writeStore(STORE_KEYS.sat, config.sat);
    writeStore(STORE_KEYS.rgbRotate, "0");
    updateWheelMarker();
  }

  function setTextSafe(el, text) {
    if (el && el.textContent !== text) {
      el.textContent = text;
    }
  }

  function setStyleSafe(el, prop, value) {
    if (el && el.style[prop] !== value) {
      el.style[prop] = value;
    }
  }

  function toggleClassSafe(el, cls, force) {
    if (el && el.classList.contains(cls) !== !!force) {
      el.classList.toggle(cls, !!force);
    }
  }

  function getAllPresetPairs() {
    const out = [];
    for (let i = 0; i < MODELS.length; i++) {
      const m = MODELS[i];
      for (let j = 0; j < m.presets.length; j++) {
        out.push({
          modelId: m.id,
          modelLabel: m.label,
          presetId: m.presets[j].id,
          presetLabel: m.presets[j].label
        });
      }
    }
    return out;
  }

  function getActivePresetDisplayLabel() {
    const def = getModelDef(config.model);
    if (def.id === "none" || def.id === "album") {
      return def.label;
    }
    let pLabel = def.presets[0].label;
    for (let i = 0; i < def.presets.length; i++) {
      if (def.presets[i].id === config.preset) {
        pLabel = def.presets[i].label;
        break;
      }
    }
    return `${def.label} : ${pLabel}`;
  }

  function syncVizSelectionUi() {
    const modelsWrap = document.getElementById("wmp-hud-models");
    if (modelsWrap) {
      modelsWrap.querySelectorAll(".wmp-model-btn").forEach((el) => {
        el.classList.toggle("active", el.dataset.modelId === config.model);
      });
    }

    setTextSafe(presetLabelEl, getActivePresetDisplayLabel());

    if (popupMenuEl) {
      popupMenuEl.querySelectorAll(".wmp-menu-cat-group").forEach((grp) => {
        const isCat = grp.dataset.modelId === config.model;
        grp.classList.toggle("active", isCat);
        const item = grp.querySelector(".wmp-menu-item");
        if (item) {
          item.classList.toggle("active", isCat);
          const sub = item.querySelector(".wmp-menu-sub");
          if (sub && isCat) {
            const def = getModelDef(config.model);
            const found = def.presets.find((p) => p.id === config.preset);
            setTextSafe(sub, found ? found.label : def.presets[0].label);
          }
        }
        grp.querySelectorAll(".wmp-preset-chip").forEach((chip) => {
          chip.classList.toggle("active", isCat && chip.dataset.presetId === config.preset);
        });
      });
    }
  }

  function selectModelPreset(modelId, presetId) {
    const resolved = resolveModelAndPreset(modelId, presetId);
    config.model = resolved.model;
    config.preset = resolved.preset;
    writeStore(STORE_KEYS.model, config.model);
    writeStore(STORE_KEYS.preset, config.preset);
    syncVizSelectionUi();
  }

  function stepModelPreset(delta) {
    const pairs = getAllPresetPairs();
    let idx = pairs.findIndex((p) => p.modelId === config.model && p.presetId === config.preset);
    if (idx < 0) idx = 0;
    const nextIdx = (idx + delta + pairs.length) % pairs.length;
    selectModelPreset(pairs[nextIdx].modelId, pairs[nextIdx].presetId);
  }

  function toggleVizPopupMenu(force) {
    if (!popupMenuEl) return;
    const next = typeof force === "boolean" ? force : !runtime.menuOpen;
    runtime.menuOpen = next;
    popupMenuEl.classList.toggle("open", next);
    if (next) {
      const bar = document.getElementById("wmp-stage-bottom-bar");
      const anchor = document.getElementById("wmp-stage-menu-btn") || bar;
      if (anchor) {
        const ar = anchor.getBoundingClientRect();
        const barRect = bar ? bar.getBoundingClientRect() : ar;
        const left = Math.max(8, Math.min(window.innerWidth - 266, Math.round(ar.left)));
        const bottom = Math.max(60, Math.round(window.innerHeight - barRect.top + 4));
        setStyleSafe(popupMenuEl, "left", `${left}px`);
        setStyleSafe(popupMenuEl, "bottom", `${bottom}px`);
      }
      syncVizSelectionUi();
    }
  }

  function formatDurationClock(ms) {
    const totalSec = Math.max(0, Math.floor((ms || 0) / 1000));
    if (totalSec <= 0) return "--:--";
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const padS = s < 10 ? `0${s}` : `${s}`;
    if (h > 0) {
      const padM = m < 10 ? `0${m}` : `${m}`;
      return `${h}:${padM}:${padS}`;
    }
    return `${m}:${padS}`;
  }

  function updateAudioStatusPill() {
    const srcTag = features.sourceMode === "full-hd" || features.sourceMode === "3-band" ? "3-Band" : features.sourceMode === "loudness" ? "Loudness" : "Auto";
    const bpmText = `${Math.round(features.bpm || 120)} BPM · ${srcTag}`;
    setTextSafe(bpmLabelEl, bpmText);
    const durText = formatDurationClock(playback.durationMs);
    setTextSafe(tickerRightEl, `${bpmText}  |  Total Time: ${durText}`);
  }

  function updateFooterMeta() {
    const t = playback.title || "Spotify Velvet Red";
    const a = playback.artist || (playback.isPaused ? "Paused" : "Playing");
    setTextSafe(titleEl, t);
    setTextSafe(artistEl, a);
    const stateVerb = playback.isPaused ? "Paused" : "Playing";
    const playGlyph = document.getElementById("wmp-ticker-play-icon");
    setTextSafe(playGlyph, playback.isPaused ? "\u275A\u275A" : "\u25B6");
    const tickerLabel = document.getElementById("wmp-ticker-status-text");
    setTextSafe(tickerLabel, `${stateVerb}: "${t}"${playback.artist ? " - " + playback.artist : ""}`);
    updateAudioStatusPill();
  }

  function syncSharedControlsHost(useSurface) {
    const mode = useSurface ? "surface" : "lyrics";
    if (runtime.hudContainerMode === mode) return;
    runtime.hudContainerMode = mode;

    const colorsWrap = document.getElementById("wmp-hud-colors");
    const sensSelect = document.getElementById("wmp-sensitivity-select");
    const fullBtn = document.getElementById("wmp-fullscreen-btn");
    const exitBtn = document.getElementById("wmp-surface-exit-btn");

    if (useSurface) {
      const mid = document.getElementById("wmp-stage-ctrl-mid");
      const right = document.getElementById("wmp-stage-ctrl-right");
      if (mid && colorsWrap) mid.appendChild(colorsWrap);
      if (mid && sensSelect) mid.appendChild(sensSelect);
      if (right && fullBtn) right.appendChild(fullBtn);
      if (right && exitBtn) right.appendChild(exitBtn);
    } else {
      const panel = document.getElementById("wmp-hud-panel");
      const audioPill = document.getElementById("wmp-hud-audio-pill");
      const rightCluster = document.getElementById("wmp-hud-right-cluster");
      if (panel && colorsWrap) panel.appendChild(colorsWrap);
      if (audioPill && sensSelect) audioPill.appendChild(sensSelect);
      if (rightCluster && fullBtn) rightCluster.appendChild(fullBtn);
      if (rightCluster && exitBtn) rightCluster.appendChild(exitBtn);
    }
  }

  function updateLeftTaskbarState(routerPath, lyricsRoute) {
    const taskbar = document.getElementById("wmp-left-taskbar");
    if (!taskbar) return;
    const sidebar = taskbar.parentElement;
    if (sidebar) {
      const sw = sidebar.getBoundingClientRect().width;
      toggleClassSafe(taskbar, "is-expanded", sw >= 150);
    }

    let activeKey = "home";
    if (runtime.surfaceMode) {
      activeKey = "nowplaying";
    } else if (lyricsRoute) {
      activeKey = "lyrics";
    } else if (routerPath.startsWith("/search") || routerPath.startsWith("/genre") || routerPath.startsWith("/browse")) {
      activeKey = "browse";
    } else if (routerPath.startsWith("/collection") || routerPath.startsWith("/playlist") || routerPath.startsWith("/album") || routerPath.startsWith("/artist")) {
      activeKey = "library";
    }

    taskbar.querySelectorAll(".wmp-task-tab").forEach((tab) => {
      toggleClassSafe(tab, "active", tab.dataset.taskKey === activeKey);
    });
  }

  function isFullscreenUiBusy() {
    if (runtime.menuOpen) return true;
    const barIds = ["wmp-stage-bottom-bar", "wmp-hud-topbar", "wmp-viz-popup-menu"];
    for (let i = 0; i < barIds.length; i++) {
      const el = document.getElementById(barIds[i]);
      if (el && el.matches && el.matches(":hover")) return true;
    }
    return false;
  }

  function clearFsIdleTimer() {
    if (runtime.fsIdleTimer) {
      clearTimeout(runtime.fsIdleTimer);
      runtime.fsIdleTimer = 0;
    }
    if (runtime.fsIdle) {
      runtime.fsIdle = false;
    }
    toggleClassSafe(document.documentElement, "wmp-fs-idle", false);
  }

  function scheduleFsIdleHide() {
    if (runtime.fsIdleTimer) {
      clearTimeout(runtime.fsIdleTimer);
      runtime.fsIdleTimer = 0;
    }
    const fsActive = !!(runtime.isFullscreen || document.fullscreenElement);
    const fsTarget = fsActive && (runtime.surfaceMode || runtime.onLyricsRoute);
    if (!fsTarget) {
      clearFsIdleTimer();
      return;
    }
    runtime.fsIdleTimer = setTimeout(() => {
      runtime.fsIdleTimer = 0;
      const stillFs = !!(runtime.isFullscreen || document.fullscreenElement);
      if (!stillFs || !(runtime.surfaceMode || runtime.onLyricsRoute)) {
        clearFsIdleTimer();
        return;
      }
      if (isFullscreenUiBusy()) {
        scheduleFsIdleHide();
        return;
      }
      runtime.fsIdle = true;
      toggleClassSafe(document.documentElement, "wmp-fs-idle", true);
    }, 5000);
  }

  function wakeFullscreenChrome() {
    const fsActive = !!(runtime.isFullscreen || document.fullscreenElement);
    if (!fsActive || !(runtime.surfaceMode || runtime.onLyricsRoute)) {
      clearFsIdleTimer();
      return;
    }
    if (runtime.fsIdle) {
      runtime.fsIdle = false;
      toggleClassSafe(document.documentElement, "wmp-fs-idle", false);
    }
    scheduleFsIdleHide();
  }

  function updateVisibilityAndLayout() {
    const routerPath = getCurrentPathname();
    const lyricsRoute = isOnLyricsRoute();
    const pathChanged = routerPath !== runtime.lastPath;
    if (runtime.surfaceMode && (pathChanged || (lyricsRoute && !runtime.wasLyricsRoute))) {
      runtime.lastPath = routerPath;
      runtime.wasLyricsRoute = lyricsRoute;
      exitSurfaceMode(false);
      return;
    }
    runtime.lastPath = routerPath;
    runtime.wasLyricsRoute = lyricsRoute;
    runtime.onLyricsRoute = lyricsRoute;

    const showLyricsViz = !runtime.surfaceMode && lyricsRoute && config.lyricsEnabled;
    runtime.visualActive = runtime.surfaceMode || showLyricsViz;
    const fsActive = !!(runtime.isFullscreen || document.fullscreenElement);

    toggleClassSafe(document.documentElement, "wmp-lyrics-viz-active", showLyricsViz);
    toggleClassSafe(document.documentElement, "wmp-surface-active", runtime.surfaceMode);
    toggleClassSafe(document.documentElement, "wmp-surface-fullscreen", runtime.surfaceMode && fsActive);
    toggleClassSafe(document.documentElement, "wmp-lyrics-fullscreen", !runtime.surfaceMode && lyricsRoute && fsActive);

    if (fsActive && (runtime.surfaceMode || lyricsRoute)) {
      if (!runtime.fsIdle && !runtime.fsIdleTimer) {
        scheduleFsIdleHide();
      }
      toggleClassSafe(document.documentElement, "wmp-fs-idle", runtime.fsIdle);
    } else {
      clearFsIdleTimer();
    }

    syncSharedControlsHost(runtime.surfaceMode);

    const mainView = getMainViewContainer();
    if (mainView) {
      if (runtime.surfaceMode) {
        setStyleSafe(mainView, "overflow", "hidden");
      } else if (mainView.style.overflow === "hidden") {
        setStyleSafe(mainView, "overflow", "");
      }
    }

    const rect = getHostContainerRect();
    if (hudRoot) {
      const showHud = runtime.surfaceMode || lyricsRoute;
      setStyleSafe(hudRoot, "display", showHud ? "block" : "none");
      if (showHud) {
        if (fsActive) {
          setStyleSafe(hudRoot, "left", "0px");
          setStyleSafe(hudRoot, "top", "0px");
          setStyleSafe(hudRoot, "width", `${Math.round(window.innerWidth)}px`);
          setStyleSafe(hudRoot, "height", `${Math.round(window.innerHeight)}px`);
        } else if (runtime.surfaceMode) {
          setStyleSafe(hudRoot, "left", `${Math.round(rect.left + 2)}px`);
          setStyleSafe(hudRoot, "top", `${Math.round(rect.top + 2)}px`);
          setStyleSafe(hudRoot, "width", `${Math.max(260, Math.round(rect.width - 4))}px`);
          setStyleSafe(hudRoot, "height", `${Math.max(120, Math.round(rect.height - 4))}px`);
        } else {
          setStyleSafe(hudRoot, "left", `${Math.round(rect.left + 12)}px`);
          setStyleSafe(hudRoot, "top", `${Math.round(rect.top + 10)}px`);
          setStyleSafe(hudRoot, "width", `${Math.max(260, Math.round(rect.width - 24))}px`);
          setStyleSafe(hudRoot, "height", `${Math.max(120, Math.round(rect.height - 20))}px`);
        }
        setStyleSafe(hudRoot, "zIndex", runtime.surfaceMode ? "65" : "55");
      }
    }

    const leftCluster = document.getElementById("wmp-hud-left-cluster");
    const lyricsToggle = document.getElementById("wmp-lyrics-viz-toggle");
    const fullBtn = document.getElementById("wmp-fullscreen-btn");
    const exitBtn = document.getElementById("wmp-surface-exit-btn");
    const footer = document.getElementById("wmp-hud-track-footer");

    setStyleSafe(leftCluster, "display", !runtime.surfaceMode && showLyricsViz ? "flex" : "none");
    setStyleSafe(fullBtn, "display", runtime.visualActive ? "inline-flex" : "none");
    setStyleSafe(exitBtn, "display", runtime.surfaceMode ? "inline-flex" : "none");
    setStyleSafe(footer, "display", runtime.surfaceMode ? "flex" : "none");

    if (!runtime.surfaceMode && runtime.menuOpen) {
      closeVizPopupMenu();
    }

    if (lyricsToggle) {
      setStyleSafe(lyricsToggle, "display", !runtime.surfaceMode && lyricsRoute ? "inline-flex" : "none");
      toggleClassSafe(lyricsToggle, "is-on", config.lyricsEnabled);
      const txt = lyricsToggle.querySelector("span");
      setTextSafe(txt, config.lyricsEnabled ? "Visualizer: ON" : "Visualizer: OFF");
    }

    const surfaceBtn = document.getElementById("wmp-visualizer-surface-btn");
    toggleClassSafe(surfaceBtn, "active", runtime.surfaceMode);
    updateLeftTaskbarState(routerPath, lyricsRoute);
    syncVizSelectionUi();

    ensureRenderLoopState();
  }

  function createLeftTaskbar() {
    if (document.getElementById("wmp-left-taskbar")) return;
    const sidebar = document.querySelector("#Desktop_LeftSidebar_Id, .yQCyOSVcMCen_NJKPHB6");
    if (!sidebar) return;

    const bar = document.createElement("nav");
    bar.id = "wmp-left-taskbar";
    bar.setAttribute("aria-label", "WMP Media Taskbar");

    const tabs = [
      { key: "nowplaying", html: "Now <br>Playing", title: "Now Playing Visualizer Surface" },
      { key: "home", html: "Media <br>Guide", title: "Home" },
      { key: "browse", html: "Browse", title: "Search & Browse" },
      { key: "library", html: "Media <br>Library", title: "Your Library & Liked Songs" },
      { key: "lyrics", html: "Lyrics", title: "Track Lyrics" }
    ];

    tabs.forEach((t) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "wmp-task-tab";
      btn.dataset.taskKey = t.key;
      btn.title = t.title;
      btn.innerHTML = t.html;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (t.key === "nowplaying") {
          runtime.surfaceMode = true;
          updateVisibilityAndLayout();
          return;
        }
        exitSurfaceMode(false);
        if (t.key === "home") {
          const hb = document.querySelector('button[data-testid="home-button"]');
          if (hb) hb.click();
          else if (apis.history && typeof apis.history.push === "function") apis.history.push("/");
        } else if (t.key === "browse") {
          const bb = document.querySelector('button[data-testid="browse-button"]');
          if (bb) bb.click();
          else if (apis.history && typeof apis.history.push === "function") apis.history.push("/search");
          else {
            const si = document.querySelector('#global-nav-bar input[data-testid="search-input"]');
            if (si) si.focus();
          }
        } else if (t.key === "library") {
          if (apis.history && typeof apis.history.push === "function") {
            apis.history.push("/collection/tracks");
          }
        } else if (t.key === "lyrics") {
          if (!isOnLyricsRoute()) {
            const lb = document.querySelector('button[data-testid="lyrics-button"]');
            if (lb && !lb.disabled && lb.getAttribute("aria-disabled") !== "true") lb.click();
            else if (apis.history && typeof apis.history.push === "function") apis.history.push("/lyrics");
          }
        }
      });
      bar.appendChild(btn);
    });

    sidebar.insertBefore(bar, sidebar.firstElementChild);
  }

  function toggleFullscreen() {
    const next = !runtime.isFullscreen;
    runtime.isFullscreen = next;
    if (next) {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    const fullBtn = document.getElementById("wmp-fullscreen-btn");
    setTextSafe(fullBtn, next ? "Exit Fullscreen" : "Fullscreen");
    if (next) {
      wakeFullscreenChrome();
    } else {
      clearFsIdleTimer();
    }
    updateVisibilityAndLayout();
  }

  function createSurfacePlayerButton() {
    if (document.getElementById("wmp-visualizer-surface-btn")) return;

    const btn = document.createElement("button");
    btn.id = "wmp-visualizer-surface-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Toggle WMP Visualizer Surface");
    btn.title = "WMP Visualizer Studio (Alt+V)";
    btn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' +
      '<rect x="1" y="9" width="2.2" height="5.5" rx="0.8"/>' +
      '<rect x="4.8" y="4.5" width="2.2" height="10" rx="0.8"/>' +
      '<rect x="8.6" y="1.5" width="2.2" height="13" rx="0.8"/>' +
      '<rect x="12.4" y="6.5" width="2.2" height="8" rx="0.8"/>' +
      "</svg>";

    btn.addEventListener("click", () => {
      if (runtime.surfaceMode) {
        exitSurfaceMode(false);
      } else {
        runtime.surfaceMode = true;
        updateVisibilityAndLayout();
      }
    });

    const lyricsWrap = document.querySelector(".NmfW_y2jYByYTRtCmPaB");
    if (lyricsWrap && lyricsWrap.parentElement) {
      lyricsWrap.parentElement.insertBefore(btn, lyricsWrap);
      return;
    }

    const lyricsBtn = document.querySelector('button[data-testid="lyrics-button"]');
    if (lyricsBtn && lyricsBtn.parentElement) {
      lyricsBtn.parentElement.insertBefore(btn, lyricsBtn);
      return;
    }

    const extraBar = document.querySelector(".vQrn40NmmpeUfmOfgxeo");
    if (extraBar) {
      extraBar.prepend(btn);
    }
  }

  function buildUi() {
    if (document.getElementById("spotify-lyrics-visualizer")) return;

    canvas = document.createElement("canvas");
    canvas.id = "spotify-lyrics-visualizer";
    canvas.setAttribute("aria-hidden", "true");
    ["click", "dblclick", "auxclick", "contextmenu"].forEach((evName) => {
      canvas.addEventListener(evName, (e) => {
        if (!runtime.surfaceMode) return;
        e.preventDefault();
        e.stopPropagation();
      });
    });
    document.body.appendChild(canvas);
    ctx = canvas.getContext("2d", { alpha: false });

    fbCanvas = document.createElement("canvas");
    fbCtx = fbCanvas.getContext("2d", { alpha: false });

    hudRoot = document.createElement("div");
    hudRoot.id = "wmp-visualizer-surface-hud";

    const topBar = document.createElement("div");
    topBar.id = "wmp-hud-topbar";

    const leftCluster = document.createElement("div");
    leftCluster.id = "wmp-hud-left-cluster";

    const panel = document.createElement("div");
    panel.id = "wmp-hud-panel";

    const modelsWrap = document.createElement("div");
    modelsWrap.id = "wmp-hud-models";

    MODELS.forEach((m) => {
      if (m.id === "none") return;
      const mb = document.createElement("button");
      mb.type = "button";
      mb.className = "wmp-model-btn" + (config.model === m.id ? " active" : "");
      mb.textContent = m.shortLabel || m.label;
      mb.dataset.modelId = m.id;
      mb.addEventListener("click", () => {
        selectModelPreset(m.id, m.presets[0].id);
      });
      modelsWrap.appendChild(mb);
    });

    const sep = document.createElement("div");
    sep.id = "wmp-hud-sep";

    const colorsWrap = document.createElement("div");
    colorsWrap.id = "wmp-hud-colors";

    const wheelWrap = document.createElement("div");
    wheelWrap.id = "wmp-color-wheel-wrap";
    wheelWrap.title = "Pick Visualizer Color";

    wheelCanvas = document.createElement("canvas");
    wheelCanvas.id = "wmp-color-wheel-canvas";
    wheelCanvas.width = 28;
    wheelCanvas.height = 28;

    wheelMarker = document.createElement("div");
    wheelMarker.id = "wmp-color-wheel-marker";

    let draggingWheel = false;
    wheelWrap.addEventListener("pointerdown", (e) => {
      draggingWheel = true;
      wheelWrap.setPointerCapture(e.pointerId);
      pickColorFromWheelEvent(e);
    });
    wheelWrap.addEventListener("pointermove", (e) => {
      if (draggingWheel) pickColorFromWheelEvent(e);
    });
    wheelWrap.addEventListener("pointerup", (e) => {
      draggingWheel = false;
      try { wheelWrap.releasePointerCapture(e.pointerId); } catch {}
    });

    wheelWrap.appendChild(wheelCanvas);
    wheelWrap.appendChild(wheelMarker);

    const rgbLabel = document.createElement("label");
    rgbLabel.id = "wmp-rgb-rotate-label";
    const rgbCb = document.createElement("input");
    rgbCb.id = "wmp-rgb-rotate-checkbox";
    rgbCb.type = "checkbox";
    rgbCb.checked = config.rgbRotate;
    rgbCb.addEventListener("change", () => {
      config.rgbRotate = rgbCb.checked;
      writeStore(STORE_KEYS.rgbRotate, config.rgbRotate ? "1" : "0");
    });
    const rgbText = document.createElement("span");
    rgbText.textContent = "RGB Rotation";
    rgbLabel.appendChild(rgbCb);
    rgbLabel.appendChild(rgbText);

    colorsWrap.appendChild(wheelWrap);
    colorsWrap.appendChild(rgbLabel);

    panel.appendChild(modelsWrap);
    panel.appendChild(sep);
    panel.appendChild(colorsWrap);

    const audioPill = document.createElement("div");
    audioPill.id = "wmp-hud-audio-pill";

    beatLedEl = document.createElement("span");
    beatLedEl.id = "wmp-beat-led";

    bpmLabelEl = document.createElement("span");
    bpmLabelEl.textContent = "120 BPM · Auto";

    const sensSelect = document.createElement("select");
    sensSelect.id = "wmp-sensitivity-select";
    sensSelect.title = "Beat Reactivity Intensity";
    [
      { val: "subtle", label: "Subtle" },
      { val: "balanced", label: "Balanced" },
      { val: "overdrive", label: "Overdrive" }
    ].forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.val;
      o.textContent = opt.label;
      if (config.sensitivity === opt.val) o.selected = true;
      sensSelect.appendChild(o);
    });
    sensSelect.addEventListener("change", () => {
      config.sensitivity = sensSelect.value;
      writeStore(STORE_KEYS.sensitivity, config.sensitivity);
    });

    audioPill.appendChild(beatLedEl);
    audioPill.appendChild(bpmLabelEl);
    audioPill.appendChild(sensSelect);

    leftCluster.appendChild(panel);
    leftCluster.appendChild(audioPill);

    const rightCluster = document.createElement("div");
    rightCluster.id = "wmp-hud-right-cluster";

    const lyricsToggle = document.createElement("button");
    lyricsToggle.id = "wmp-lyrics-viz-toggle";
    lyricsToggle.type = "button";
    const toggleDot = document.createElement("i");
    toggleDot.id = "wmp-lyrics-viz-toggle-dot";
    const toggleSpan = document.createElement("span");
    toggleSpan.textContent = config.lyricsEnabled ? "Visualizer: ON" : "Visualizer: OFF";
    lyricsToggle.appendChild(toggleDot);
    lyricsToggle.appendChild(toggleSpan);
    lyricsToggle.addEventListener("click", () => {
      config.lyricsEnabled = !config.lyricsEnabled;
      writeStore(STORE_KEYS.lyricsEnabled, config.lyricsEnabled ? "1" : "0");
      if (!config.lyricsEnabled && runtime.isFullscreen) {
        toggleFullscreen();
      }
      updateVisibilityAndLayout();
    });

    const fullBtn = document.createElement("button");
    fullBtn.id = "wmp-fullscreen-btn";
    fullBtn.type = "button";
    fullBtn.className = "wmp-action-btn";
    fullBtn.textContent = "Fullscreen";
    fullBtn.addEventListener("click", toggleFullscreen);

    const exitBtn = document.createElement("button");
    exitBtn.id = "wmp-surface-exit-btn";
    exitBtn.type = "button";
    exitBtn.className = "wmp-action-btn";
    exitBtn.textContent = "Exit Surface";
    exitBtn.addEventListener("click", () => {
      exitSurfaceMode(false);
    });

    rightCluster.appendChild(lyricsToggle);
    rightCluster.appendChild(fullBtn);
    rightCluster.appendChild(exitBtn);

    topBar.appendChild(leftCluster);
    topBar.appendChild(rightCluster);

    const footer = document.createElement("div");
    footer.id = "wmp-hud-track-footer";
    artistEl = document.createElement("div");
    artistEl.id = "wmp-hud-track-artist";
    titleEl = document.createElement("div");
    titleEl.id = "wmp-hud-track-title";
    footer.appendChild(artistEl);
    footer.appendChild(titleEl);

    const stageBottomBar = document.createElement("div");
    stageBottomBar.id = "wmp-stage-bottom-bar";

    const stageCtrlRow = document.createElement("div");
    stageCtrlRow.id = "wmp-stage-controls-row";

    const ctrlLeft = document.createElement("div");
    ctrlLeft.id = "wmp-stage-ctrl-left";

    const menuBtn = document.createElement("button");
    menuBtn.id = "wmp-stage-menu-btn";
    menuBtn.type = "button";
    menuBtn.className = "wmp-bevel-sq-btn";
    menuBtn.title = "Select visualization";
    menuBtn.textContent = "\u2630";
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleVizPopupMenu();
    });

    const prevBtn = document.createElement("button");
    prevBtn.id = "wmp-stage-prev-btn";
    prevBtn.type = "button";
    prevBtn.className = "wmp-bevel-round-btn";
    prevBtn.title = "Previous visualization";
    prevBtn.textContent = "\u25C4";
    prevBtn.addEventListener("click", () => {
      stepModelPreset(-1);
    });

    const nextBtn = document.createElement("button");
    nextBtn.id = "wmp-stage-next-btn";
    nextBtn.type = "button";
    nextBtn.className = "wmp-bevel-round-btn";
    nextBtn.title = "Next visualization";
    nextBtn.textContent = "\u25BA";
    nextBtn.addEventListener("click", () => {
      stepModelPreset(1);
    });

    presetLabelEl = document.createElement("span");
    presetLabelEl.id = "wmp-active-preset-label";
    presetLabelEl.title = "Click to choose visualization preset";
    presetLabelEl.textContent = getActivePresetDisplayLabel();
    presetLabelEl.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleVizPopupMenu();
    });

    ctrlLeft.appendChild(menuBtn);
    ctrlLeft.appendChild(prevBtn);
    ctrlLeft.appendChild(nextBtn);
    ctrlLeft.appendChild(presetLabelEl);

    const ctrlMid = document.createElement("div");
    ctrlMid.id = "wmp-stage-ctrl-mid";

    const ctrlRight = document.createElement("div");
    ctrlRight.id = "wmp-stage-ctrl-right";

    stageCtrlRow.appendChild(ctrlLeft);
    stageCtrlRow.appendChild(ctrlMid);
    stageCtrlRow.appendChild(ctrlRight);

    const tickerRow = document.createElement("div");
    tickerRow.id = "wmp-stage-ticker-row";

    tickerLeftEl = document.createElement("div");
    tickerLeftEl.id = "wmp-ticker-left";
    const playGlyph = document.createElement("span");
    playGlyph.id = "wmp-ticker-play-icon";
    playGlyph.textContent = "\u25B6";
    const tickerStatus = document.createElement("span");
    tickerStatus.id = "wmp-ticker-status-text";
    tickerStatus.textContent = "Playing";
    tickerLeftEl.appendChild(playGlyph);
    tickerLeftEl.appendChild(tickerStatus);

    tickerRightEl = document.createElement("div");
    tickerRightEl.id = "wmp-ticker-right";
    tickerRightEl.textContent = "120 BPM · Auto  |  Total Time: --:--";

    tickerRow.appendChild(tickerLeftEl);
    tickerRow.appendChild(tickerRightEl);

    stageBottomBar.appendChild(stageCtrlRow);
    stageBottomBar.appendChild(tickerRow);

    popupMenuEl = document.createElement("div");
    popupMenuEl.id = "wmp-viz-popup-menu";
    MODELS.forEach((m, idx) => {
      if (idx === 2) {
        const divEl = document.createElement("div");
        divEl.className = "wmp-menu-divider";
        popupMenuEl.appendChild(divEl);
      }
      const grp = document.createElement("div");
      grp.className = "wmp-menu-cat-group" + (config.model === m.id ? " active" : "");
      grp.dataset.modelId = m.id;

      const item = document.createElement("button");
      item.type = "button";
      item.className = "wmp-menu-item" + (config.model === m.id ? " active" : "");
      const titleSpan = document.createElement("span");
      titleSpan.textContent = m.label;
      item.appendChild(titleSpan);
      if (m.presets.length > 1) {
        const subSpan = document.createElement("span");
        subSpan.className = "wmp-menu-sub";
        subSpan.textContent = m.presets[0].label + " \u25B8";
        item.appendChild(subSpan);
      }
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        selectModelPreset(m.id, m.presets[0].id);
        if (m.presets.length <= 1) {
          closeVizPopupMenu();
        }
      });
      grp.appendChild(item);

      if (m.presets.length > 1) {
        const presetsRow = document.createElement("div");
        presetsRow.className = "wmp-menu-presets";
        m.presets.forEach((p) => {
          const chip = document.createElement("button");
          chip.type = "button";
          chip.className = "wmp-preset-chip" + (config.model === m.id && config.preset === p.id ? " active" : "");
          chip.dataset.presetId = p.id;
          chip.textContent = p.label;
          chip.addEventListener("click", (e) => {
            e.stopPropagation();
            selectModelPreset(m.id, p.id);
            closeVizPopupMenu();
          });
          presetsRow.appendChild(chip);
        });
        grp.appendChild(presetsRow);
      }

      popupMenuEl.appendChild(grp);
    });

    hudRoot.appendChild(topBar);
    hudRoot.appendChild(footer);
    hudRoot.appendChild(stageBottomBar);
    hudRoot.appendChild(popupMenuEl);
    document.body.appendChild(hudRoot);

    drawColorWheel();
    updateWheelMarker();
    syncVizSelectionUi();
  }

  function setupListeners() {
    window.addEventListener("resize", updateVisibilityAndLayout);

    document.addEventListener("fullscreenchange", () => {
      const activeFs = !!document.fullscreenElement;
      if (runtime.isFullscreen !== activeFs) {
        runtime.isFullscreen = activeFs;
        const fullBtn = document.getElementById("wmp-fullscreen-btn");
        setTextSafe(fullBtn, activeFs ? "Exit Fullscreen" : "Fullscreen");
        if (activeFs) {
          wakeFullscreenChrome();
        } else {
          clearFsIdleTimer();
        }
        updateVisibilityAndLayout();
      }
    });

    document.addEventListener("mousemove", () => {
      if (!(runtime.isFullscreen || document.fullscreenElement) || !(runtime.surfaceMode || runtime.onLyricsRoute)) return;
      const now = performance.now();
      if (runtime.fsIdle || now - runtime.lastMouseMoveMs > 100) {
        runtime.lastMouseMoveMs = now;
        wakeFullscreenChrome();
      }
    }, true);

    ["mousedown", "touchstart", "wheel"].forEach((evName) => {
      document.addEventListener(evName, () => {
        if ((runtime.isFullscreen || document.fullscreenElement) && (runtime.surfaceMode || runtime.onLyricsRoute)) {
          wakeFullscreenChrome();
        }
      }, true);
    });

    document.addEventListener("visibilitychange", () => {
      ensureRenderLoopState();
    });

    document.addEventListener("click", (e) => {
      const target = e.target && e.target.closest ? e.target : null;
      if (runtime.menuOpen && (!target || !target.closest("#wmp-viz-popup-menu, #wmp-stage-menu-btn, #wmp-active-preset-label"))) {
        closeVizPopupMenu();
      }
      if (!runtime.surfaceMode) return;
      if (!target || target.closest("#wmp-visualizer-surface-hud, #wmp-visualizer-surface-btn, #wmp-left-taskbar")) return;

      if (target.closest('button[data-testid="top-bar-back-button"]')) {
        e.preventDefault();
        e.stopPropagation();
        exitSurfaceMode(false);
        return;
      }

      if (target.closest('button[data-testid="lyrics-button"]')) {
        if (isOnLyricsRoute()) {
          e.preventDefault();
          e.stopPropagation();
        }
        exitSurfaceMode(false);
        return;
      }

      if (
        target.closest(
          'button[data-testid="top-bar-forward-button"],' +
          'button[data-testid="home-button"],' +
          'button[data-testid="browse-button"],' +
          'button[data-testid="whats-new-feed-button"],' +
          '[data-testid="user-widget-link"],' +
          '#global-nav-bar form[role="search"],' +
          '#global-nav-bar a,' +
          '#Desktop_LeftSidebar_Id a,' +
          '#Desktop_LeftSidebar_Id [data-testid="rootlist-item"],' +
          '#Desktop_LeftSidebar_Id [role="listitem"],' +
          '#Desktop_LeftSidebar_Id [aria-labelledby*="listrow"],' +
          '#Desktop_LeftSidebar_Id [draggable="true"],' +
          'a[href],' +
          '[data-testid="context-item-link"],' +
          '[data-testid="context-item-info-artist"]'
        )
      ) {
        exitSurfaceMode(false);
      }
    }, true);

    document.addEventListener("focusin", (e) => {
      if (!runtime.surfaceMode) return;
      const target = e.target && e.target.closest ? e.target : null;
      if (target && target.closest('#global-nav-bar input[data-testid="search-input"]')) {
        exitSurfaceMode(false);
      }
    }, true);

    window.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;

      if ((runtime.isFullscreen || document.fullscreenElement) && (runtime.surfaceMode || runtime.onLyricsRoute) && e.key !== "Escape") {
        wakeFullscreenChrome();
      }

      if (e.altKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        if (runtime.surfaceMode) {
          exitSurfaceMode(false);
        } else {
          runtime.surfaceMode = true;
          updateVisibilityAndLayout();
        }
      } else if (e.altKey && e.key === "Enter" && runtime.visualActive) {
        e.preventDefault();
        toggleFullscreen();
      } else if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.altKey && !e.metaKey && runtime.visualActive) {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "Escape") {
        if (runtime.menuOpen) {
          closeVizPopupMenu();
        } else if (runtime.isFullscreen || document.fullscreenElement) {
          toggleFullscreen();
        } else if (runtime.surfaceMode) {
          exitSurfaceMode(false);
        }
      }
    }, true);

    let moRafQueued = false;
    let surfaceBtnRef = null;
    let taskbarRef = null;
    const isOwnNode = (n) => n === canvas || n === hudRoot || n === surfaceBtnRef || n === taskbarRef;
    const mo = new MutationObserver((mutations) => {
      surfaceBtnRef = document.getElementById("wmp-visualizer-surface-btn");
      taskbarRef = document.getElementById("wmp-left-taskbar");
      let relevant = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        const t = m.target;
        if ((hudRoot && hudRoot.contains(t)) || t === canvas || (surfaceBtnRef && surfaceBtnRef.contains(t)) || (taskbarRef && taskbarRef.contains(t))) {
          continue;
        }
        const onlyOwnAdd = m.addedNodes.length > 0 && m.removedNodes.length === 0 && Array.from(m.addedNodes).every(isOwnNode);
        const onlyOwnRem = m.removedNodes.length > 0 && m.addedNodes.length === 0 && Array.from(m.removedNodes).every(isOwnNode);
        if (onlyOwnAdd || onlyOwnRem) continue;
        relevant = true;
        break;
      }
      if (!relevant || moRafQueued) return;
      moRafQueued = true;
      requestAnimationFrame(() => {
        moRafQueued = false;
        createSurfacePlayerButton();
        createLeftTaskbar();
        updateVisibilityAndLayout();
      });
    });

    mo.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    if (!document.body) {
      window.addEventListener("DOMContentLoaded", boot, { once: true });
      return;
    }
    buildUi();
    createSurfacePlayerButton();
    createLeftTaskbar();
    setupListeners();
    scanReactApis(true);
    pollPlaybackClock();
    updateVisibilityAndLayout();

    setInterval(() => {
      createSurfacePlayerButton();
      createLeftTaskbar();
      pollPlaybackClock();
      updateVisibilityAndLayout();
    }, 220);
  }

  boot();
})();
