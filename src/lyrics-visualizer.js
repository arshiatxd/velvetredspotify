(() => {
  if (window.__wmpVelvetVisualizerInit) return;
  window.__wmpVelvetVisualizerInit = true;

  const MODELS = [
    { id: "tunnel", label: "XP Tunnel" },
    { id: "spiral", label: "Spiral Vortex" },
    { id: "starburst", label: "WMC Starburst" },
    { id: "scope", label: "Scope & Bars" },
    { id: "cyber", label: "Cyber Orb" }
  ];

  const SENSITIVITY_MAP = {
    subtle: 0.78,
    balanced: 1.24,
    overdrive: 1.78
  };

  const STORE_KEYS = {
    model: "wmp_viz_model_v2",
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

  const config = {
    model: readStore(STORE_KEYS.model, "tunnel"),
    hue: Math.max(0, Math.min(360, Number(readStore(STORE_KEYS.hue, "348")) || 348)),
    sat: Math.max(0, Math.min(100, Number(readStore(STORE_KEYS.sat, "88")) || 88)),
    rgbRotate: readStore(STORE_KEYS.rgbRotate, "1") === "1",
    lyricsEnabled: readStore(STORE_KEYS.lyricsEnabled, "1") === "1",
    sensitivity: SENSITIVITY_MAP[readStore(STORE_KEYS.sensitivity, "balanced")] ? readStore(STORE_KEYS.sensitivity, "balanced") : "balanced"
  };

  if (!MODELS.some((m) => m.id === config.model)) {
    config.model = "tunnel";
  }

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
    wasLyricsRoute: false
  };

  const playback = {
    trackUri: "",
    title: "",
    artist: "",
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

  const meter = {
    bass: 0,
    mid: 0,
    high: 0,
    energy: 0,
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
  let hudRoot = null;
  let wheelCanvas = null;
  let wheelMarker = null;
  let beatLedEl = null;
  let bpmLabelEl = null;
  let titleEl = null;
  let artistEl = null;

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

  function exitSurfaceMode(keepFullscreen) {
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

  function readDomPlaybackHints() {
    const posEl = document.querySelector('[data-testid="playback-position"]');
    const durEl = document.querySelector('[data-testid="playback-duration"]');
    const titleNode = document.querySelector('[data-testid="context-item-info-title"] a, [data-testid="context-item-link"]');
    const artistNodes = document.querySelectorAll('[data-testid="context-item-info-artist"], [data-testid="context-item-info-subtitles"] a');
    const playBtn = document.querySelector('button[data-testid="control-button-playpause"]');

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

    for (let i = 0; i < 128; i++) {
      const p = (i / 128) * Math.PI * 2;
      const b0 = meter.bins[(i * 3) % 48];
      const b1 = meter.bins[(i * 7 + 19) % 48];
      const wSub = Math.sin(p * 3 + tSec * 9.5) * (0.28 + meter.bass * 0.78 + meter.kick * 0.32);
      const wMid = Math.sin(p * 8 - tSec * 16.5) * (0.18 + meter.mid * 0.58 + b0 * 0.36);
      const wHigh = Math.sin(p * 23 + tSec * 31.0) * (0.08 + meter.high * 0.52 + b1 * 0.28);
      const edgeBuzz = ((i & 1) === 0 ? 1 : -1) * Math.pow(Math.max(0, Math.sin(p * 11 + tSec * 24)), 3) * (meter.snare * 0.42 + meter.high * 0.24);
      meter.wave[i] = Math.max(-1.6, Math.min(1.6, wSub + wMid + wHigh + edgeBuzz));
      meter.waveB[i] = Math.max(-1.6, Math.min(1.6, Math.cos(p * 4 - tSec * 11.2) * (0.24 + meter.mid * 0.72) - wHigh * 0.85 + edgeBuzz * 0.7));
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
    const l = Math.max(18, Math.min(96, 54 + (lightBoost || 0)));
    return `hsla(${h.toFixed(1)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%, ${alpha.toFixed(3)})`;
  }

  function renderTunnel(w, h, dtSec, isPlaying) {
    const minDim = Math.min(w, h);
    const driftAmp = isPlaying ? (0.085 + meter.energy * 0.065) : 0.03;
    const ox = Math.sin(runtime.driftPhase * 0.82) * w * driftAmp + meter.shakeX * w;
    const oy = Math.cos(runtime.driftPhase * 1.13) * h * driftAmp + meter.shakeY * h;
    const cx = w * 0.5 + ox;
    const cy = h * 0.5 + oy;

    const zoom = isPlaying ? (1.046 + meter.bass * 0.088 + meter.kick * 0.065) : 1.016;
    const rot = isPlaying ? (Math.sin(runtime.tunnelPhase * 0.58) * 0.018 + meter.mid * 0.016 * runtime.spinDir) : 0.004;
    const shiftX = isPlaying ? (Math.sin(runtime.driftPhase * 0.82) * 0.0055) : 0;
    const shiftY = isPlaying ? (Math.cos(runtime.driftPhase * 1.13) * 0.0055) : 0;
    const fade = isPlaying ? Math.max(0.04, 0.14 - Math.min(0.08, meter.energy * 0.055)) : 0.24;

    applyFeedbackPass(w, h, zoom, rot, fade, shiftX, shiftY, 0.91);
    ctx.globalCompositeOperation = "lighter";

    if (isPlaying && meter.shock > 0.05) {
      const shockR = minDim * (0.14 + (1 - meter.shock) * 0.48);
      ctx.beginPath();
      ctx.arc(cx, cy, shockR, 0, Math.PI * 2);
      ctx.lineWidth = 1.6 + meter.shock * 3.5;
      ctx.strokeStyle = hslColor(18, meter.shock * 0.65, 34);
      ctx.stroke();
    }

    const outerHalo = ctx.createRadialGradient(cx, cy, minDim * 0.08, cx, cy, minDim * (0.34 + meter.bass * 0.14));
    outerHalo.addColorStop(0, "rgba(0, 0, 0, 0)");
    outerHalo.addColorStop(0.55, hslColor(-12, 0.14 + meter.bass * 0.18, 12));
    outerHalo.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = outerHalo;
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * 0.48, 0, Math.PI * 2);
    ctx.fill();

    const baseR = minDim * (0.17 + meter.bass * 0.085 + meter.kick * 0.045);
    const strands = 8;
    const pts = 128;

    for (let s = 0; s < strands; s++) {
      const isHotCore = s >= 5;
      const strandShift = (s / strands) * Math.PI * 2;
      const hueOff = (s * 38) - 52;
      ctx.beginPath();
      ctx.lineWidth = isHotCore ? (0.95 + meter.high * 0.65) : (2.1 + meter.bass * 1.4);
      ctx.strokeStyle = hslColor(hueOff, isHotCore ? 0.95 : 0.62, isHotCore ? 38 : 10);

      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const wIdx = i & 127;
        const wVal = meter.wave[(wIdx + s * 17) & 127];
        const wAlt = meter.waveB[(wIdx + s * 29) & 127];
        const bVal = meter.bins[(i + s * 5) % 48];
        const sharpTooth = Math.sin(a * (7 + (s % 4) * 2) + runtime.phase * (1.8 + s * 0.35) * runtime.spinDir) * (4 + meter.mid * 18 + meter.snare * 16);
        const r = Math.max(14, baseR + (wVal * 0.65 + wAlt * 0.35) * minDim * (0.055 + meter.bass * 0.068) + bVal * minDim * 0.058 + sharpTooth);
        const px = cx + Math.cos(a + strandShift * 0.06) * r;
        const py = cy + Math.sin(a + strandShift * 0.06) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }

    if (isPlaying && (meter.kick > 0.32 || meter.high > 0.55)) {
      const rayCount = 16;
      for (let rIdx = 0; rIdx < rayCount; rIdx++) {
        const bVal = meter.bins[(rIdx * 3) % 48];
        if (bVal < 0.36) continue;
        const ang = (rIdx / rayCount) * Math.PI * 2 + runtime.phase * 0.45 * runtime.spinDir;
        const rStart = baseR * 1.05;
        const rEnd = rStart + minDim * (0.12 + bVal * 0.24 + meter.kick * 0.14);
        ctx.strokeStyle = hslColor(rIdx * 18, 0.55 + bVal * 0.35, 30);
        ctx.lineWidth = 1.0 + bVal * 1.4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * rStart, cy + Math.sin(ang) * rStart);
        ctx.lineTo(cx + Math.cos(ang) * rEnd, cy + Math.sin(ang) * rEnd);
        ctx.stroke();
      }
    }

    stepAndDrawSparks(dtSec, cx, cy, minDim, 0.9 * runtime.spinDir);
    ctx.globalCompositeOperation = "source-over";
  }

  function renderSpiral(w, h, dtSec, isPlaying) {
    const cx = w * 0.5 + (isPlaying ? meter.shakeX * w : 0);
    const cy = h * 0.5 + (isPlaying ? meter.shakeY * h : 0);
    const minDim = Math.min(w, h);
    const maxR = minDim * 0.48;

    const zoom = isPlaying ? (1.032 + meter.bass * 0.056 + meter.kick * 0.042) : 1.012;
    const swirl = isPlaying ? ((0.032 + meter.energy * 0.052 + meter.kick * 0.034) * runtime.spinDir) : 0.008;
    const fade = isPlaying ? 0.14 : 0.24;

    applyFeedbackPass(w, h, zoom, swirl, fade, 0, 0, 0.90);
    ctx.globalCompositeOperation = "lighter";

    const arms = 6;
    const steps = 88;
    for (let a = 0; a < arms; a++) {
      const baseAngle = (a / arms) * Math.PI * 2 + runtime.spiralPhase;

      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        ctx.lineWidth = pass === 0 ? (3.2 + meter.bass * 2.2) : (1.05 + meter.high * 0.6);
        ctx.strokeStyle = hslColor(a * 42 + pass * 16, pass === 0 ? 0.65 : 0.96, pass === 0 ? 10 : 38);

        for (let i = 0; i < steps; i++) {
          const t = i / (steps - 1);
          const bin = meter.bins[Math.floor(t * 47)];
          const wave = meter.wave[Math.floor(t * 127)];
          const radius = t * maxR * (0.86 + meter.bass * 0.24 + meter.kick * 0.12);
          const twist = 5.4 + meter.mid * 2.4 + meter.kick * 1.1;
          const theta = baseAngle + t * twist * runtime.spinDir + Math.sin(t * 12 - runtime.phase * 1.4) * (0.16 + bin * 0.36);
          const amp = (bin * 34 + wave * 18) * (0.35 + t * 0.9);
          const x = cx + Math.cos(theta) * (radius + amp);
          const y = cy + Math.sin(theta) * (radius + amp);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    const coreR = 14 + meter.bass * 36 + meter.kick * 28;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.6);
    grad.addColorStop(0, hslColor(0, 0.96, 40));
    grad.addColorStop(0.32, hslColor(22, 0.72, 18));
    grad.addColorStop(0.7, hslColor(-24, 0.28, 6));
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 2.6, 0, Math.PI * 2);
    ctx.fill();

    if (isPlaying && meter.beatPulse > 0.25) {
      spawnSparks(3, 0.08, 0.55 + meter.bass * 0.85, 45, 0, 0);
    }
    stepAndDrawSparks(dtSec, cx, cy, minDim, 2.8 * runtime.spinDir);
    ctx.globalCompositeOperation = "source-over";
  }

  function renderStarburst(w, h, dtSec, isPlaying) {
    const cx = w * 0.5 + (isPlaying ? meter.shakeX * w : 0);
    const cy = h * 0.5 + (isPlaying ? meter.shakeY * h : 0);
    const minDim = Math.min(w, h);

    const zoom = isPlaying ? (1.030 + meter.bass * 0.052 + meter.kick * 0.048) : 1.010;
    const twist = isPlaying ? (Math.sin(runtime.phase * 0.35) * 0.024 * runtime.spinDir) : 0.003;
    applyFeedbackPass(w, h, zoom, twist, isPlaying ? 0.14 : 0.24, 0, 0, 0.89);

    ctx.globalCompositeOperation = "lighter";

    const crowns = 8;
    const pts = 96;
    for (let l = 0; l < crowns; l++) {
      const k = l / (crowns - 1);
      const baseR = minDim * (0.075 + k * 0.34) * (0.85 + meter.bass * 0.28 + meter.kick * 0.18);
      const spikes = 6 + (l % 4) * 2;
      const dir = l % 2 === 0 ? runtime.spinDir : -runtime.spinDir;

      for (let pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        ctx.lineWidth = pass === 0 ? (2.4 + (1 - k) * 1.8) : 0.95;
        ctx.strokeStyle = hslColor(l * 30 - 35 + pass * 14, pass === 0 ? (0.72 - k * 0.22) : 0.92, pass === 0 ? 10 : 38);

        for (let i = 0; i <= pts; i++) {
          const ang = (i / pts) * Math.PI * 2;
          const bin = meter.bins[(i + l * 5) % 48];
          const wVal = meter.wave[(i * 2 + l * 13) & 127];
          const petal = Math.pow(Math.abs(Math.sin(ang * (spikes * 0.5) + runtime.phase * (0.9 + l * 0.15) * dir)), 1.6);
          const jagged = petal * (18 + meter.mid * 46 + meter.kick * 28) + bin * (22 + meter.high * 44) + wVal * (8 + meter.snare * 18);
          const r = Math.max(8, baseR + jagged);
          const x = cx + Math.cos(ang) * r;
          const y = cy + Math.sin(ang) * r;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    if (isPlaying) {
      const needleCount = 24;
      for (let n = 0; n < needleCount; n++) {
        const ang = (n / needleCount) * Math.PI * 2 + runtime.phase * 0.65 * runtime.spinDir;
        const bin = meter.bins[(n * 2) % 48];
        const rIn = minDim * (0.06 + meter.kick * 0.04);
        const rOut = minDim * (0.22 + bin * 0.28 + meter.beatPulse * 0.08);
        ctx.strokeStyle = hslColor(n * 15, 0.55 + bin * 0.4, 34);
        ctx.lineWidth = 1.2 + bin * 1.4;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * rIn, cy + Math.sin(ang) * rIn);
        ctx.lineTo(cx + Math.cos(ang) * rOut, cy + Math.sin(ang) * rOut);
        ctx.stroke();
      }
    }

    stepAndDrawSparks(dtSec, cx, cy, minDim, 1.4 * runtime.spinDir);
    ctx.globalCompositeOperation = "source-over";
  }

  function renderScope(w, h, dtSec, isPlaying) {
    const zoom = isPlaying ? (1.022 + meter.bass * 0.028 + meter.kick * 0.018) : 1.005;
    applyFeedbackPass(w, h, zoom, 0, isPlaying ? 0.24 : 0.30, 0, 0, 0.84);

    const cx = w * 0.5;
    const cy = h * 0.5;
    const minDim = Math.min(w, h);
    const padX = Math.max(20, w * 0.04);
    const usableW = w - padX * 2;
    const barCount = 48;
    const slotW = usableW / barCount;
    const barW = Math.max(4, slotW * 0.72);
    const maxBarH = h * 0.36;

    ctx.globalCompositeOperation = "lighter";

    if (isPlaying && meter.kick > 0.2) {
      ctx.strokeStyle = hslColor(12, meter.kick * 0.55, 36);
      ctx.lineWidth = 1.5 + meter.kick * 3.0;
      ctx.beginPath();
      ctx.moveTo(padX, cy);
      ctx.lineTo(padX + usableW, cy);
      ctx.stroke();
    }

    const segStep = 6;
    for (let i = 0; i < barCount; i++) {
      const val = meter.bins[i];
      const peakVal = meter.peaks[i];
      const x = padX + i * slotW + (slotW - barW) * 0.5;
      const barH = Math.max(4, val * maxBarH);
      const peakYOff = peakVal * maxBarH;

      const grad = ctx.createLinearGradient(x, cy - barH, x, cy + barH);
      grad.addColorStop(0, hslColor(i * 4.2 + 24, 0.95, 30));
      grad.addColorStop(0.5, hslColor(i * 2.5, 0.80, 6));
      grad.addColorStop(1, hslColor(i * 4.2 + 24, 0.95, 30));

      ctx.fillStyle = grad;
      const numSegs = Math.max(1, Math.floor(barH / segStep));
      for (let s = 0; s < numSegs; s++) {
        const yOff = s * segStep;
        ctx.fillRect(x, cy - yOff - 4, barW, 4);
        ctx.fillRect(x, cy + yOff + 1, barW, 4);
      }

      ctx.fillStyle = hslColor(i * 4 + 35, 1.0, 42);
      ctx.fillRect(x, cy - peakYOff - 4, barW, 3);
      ctx.fillRect(x, cy + peakYOff + 1, barW, 3);
    }

    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.lineWidth = pass === 0 ? 3.8 : 1.3;
      ctx.strokeStyle = hslColor(pass === 0 ? 8 : 22, pass === 0 ? 0.62 : 0.98, pass === 0 ? 16 : 42);
      for (let i = 0; i < 128; i++) {
        const x = padX + (i / 127) * usableW;
        const amp = h * (0.095 + meter.energy * 0.14 + meter.kick * 0.045);
        const y = cy + meter.wave[i] * amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = hslColor(62, 0.82, 28);
    for (let i = 0; i < 128; i++) {
      const x = padX + (i / 127) * usableW;
      const y = cy + meter.waveB[i] * h * (0.075 + meter.high * 0.10 + meter.snare * 0.04);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    stepAndDrawSparks(dtSec, cx, cy, minDim, 0);
    ctx.globalCompositeOperation = "source-over";
  }

  function renderCyber(w, h, dtSec, isPlaying) {
    const minDim = Math.min(w, h);
    const cx = w * 0.5 + (isPlaying ? meter.shakeX * w * 0.6 : 0);
    const horizonY = h * 0.48;
    const orbY = horizonY - minDim * 0.05;

    ctx.fillStyle = "rgba(6, 1, 3, 0.34)";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.strokeStyle = hslColor(-8, 0.62 + meter.energy * 0.25, 10);
    ctx.lineWidth = 1.3;

    const gridCols = 22;
    for (let i = -gridCols; i <= gridCols; i++) {
      const xTop = cx + i * (w * 0.015);
      const xBot = cx + i * (w * 0.082);
      ctx.beginPath();
      ctx.moveTo(xTop, horizonY);
      ctx.lineTo(xBot, h);
      ctx.stroke();
    }

    const zLines = 14;
    const zScroll = (runtime.tunnelPhase * 0.92) % 1;
    for (let i = 0; i < zLines; i++) {
      const frac = Math.pow((i + zScroll) / zLines, 2.3);
      const y = horizonY + frac * (h - horizonY);
      ctx.strokeStyle = hslColor(i * 3, 0.45 + frac * 0.45, 10 + meter.beatPulse * 14);
      ctx.lineWidth = 1 + frac * 1.4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "lighter";

    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    for (let i = 0; i < 48; i++) {
      const px = (i / 47) * w;
      const distCenter = Math.abs((i / 47) - 0.5) * 2;
      const peakH = meter.bins[i] * h * (0.14 + distCenter * 0.16) * (0.75 + meter.bass * 0.45);
      ctx.lineTo(px, horizonY - peakH);
    }
    ctx.lineTo(w, horizonY);
    ctx.strokeStyle = hslColor(-22, 0.9, 26);
    ctx.lineWidth = 2.0;
    ctx.stroke();

    ctx.strokeStyle = hslColor(6, 0.96, 32);
    ctx.lineWidth = 2.2 + meter.kick * 1.8;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();
    ctx.restore();

    ctx.globalCompositeOperation = "lighter";
    const orbR = minDim * (0.135 + meter.bass * 0.055 + meter.kick * 0.032);
    const spokes = 48;

    for (let i = 0; i < spokes; i++) {
      const ang = (i / spokes) * Math.PI * 2 + runtime.phase * 0.35 * runtime.spinDir;
      const bin = meter.bins[i];
      const len = orbR + bin * minDim * (0.18 + meter.energy * 0.09);
      const x1 = cx + Math.cos(ang) * (orbR * 0.82);
      const y1 = orbY + Math.sin(ang) * (orbR * 0.82);
      const x2 = cx + Math.cos(ang) * len;
      const y2 = orbY + Math.sin(ang) * len;

      ctx.strokeStyle = hslColor(i * 4.5, 0.92, 24);
      ctx.lineWidth = 2.2 + bin * 1.6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    ctx.beginPath();
    const orbitPts = 96;
    const ringR = orbR * (1.28 + meter.mid * 0.16);
    for (let i = 0; i <= orbitPts; i++) {
      const ang = (i / orbitPts) * Math.PI * 2;
      const wOff = meter.wave[i & 127] * minDim * (0.025 + meter.bass * 0.035);
      const rx = cx + Math.cos(ang) * (ringR + wOff);
      const ry = orbY + Math.sin(ang) * (ringR + wOff);
      if (i === 0) ctx.moveTo(rx, ry);
      else ctx.lineTo(rx, ry);
    }
    ctx.closePath();
    ctx.strokeStyle = hslColor(30, 0.92, 34);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    const sunGrad = ctx.createLinearGradient(cx, orbY - orbR, cx, orbY + orbR);
    sunGrad.addColorStop(0, hslColor(28, 0.96, 36));
    sunGrad.addColorStop(0.55, hslColor(0, 0.82, 16));
    sunGrad.addColorStop(1, hslColor(-22, 0.92, -4));
    ctx.beginPath();
    ctx.arc(cx, orbY, orbR * 0.78, 0, Math.PI * 2);
    ctx.strokeStyle = hslColor(10, 0.98, 32);
    ctx.lineWidth = 2.6;
    ctx.stroke();
    ctx.fillStyle = sunGrad;
    ctx.globalAlpha = 0.34 + meter.bass * 0.28;
    ctx.fill();
    ctx.globalAlpha = 1;

    stepAndDrawSparks(dtSec, cx, orbY, minDim, 0.7 * runtime.spinDir);
    ctx.globalCompositeOperation = "source-over";
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

  function syncCanvasSize(rect) {
    if (!canvas || !ctx) return;
    const mainView = getMainViewContainer();
    const mountInMainView = !runtime.surfaceMode && !runtime.isFullscreen && !document.fullscreenElement && !!mainView;
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

    const rect = getHostContainerRect();
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

    if (config.model === "tunnel") renderTunnel(w, h, dtSec, isPlaying);
    else if (config.model === "spiral") renderSpiral(w, h, dtSec, isPlaying);
    else if (config.model === "starburst") renderStarburst(w, h, dtSec, isPlaying);
    else if (config.model === "scope") renderScope(w, h, dtSec, isPlaying);
    else renderCyber(w, h, dtSec, isPlaying);

    runtime.rafId = requestAnimationFrame(renderLoop);
  }

  function ensureRenderLoopState() {
    if (runtime.visualActive && !document.hidden) {
      syncCanvasSize(getHostContainerRect());
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
    const r = wheelCanvas.width / 2;
    const rad = (config.hue * Math.PI) / 180;
    const dist = (config.sat / 100) * (r - 2);
    wheelMarker.style.left = `${(r + Math.cos(rad) * dist).toFixed(1)}px`;
    wheelMarker.style.top = `${(r + Math.sin(rad) * dist).toFixed(1)}px`;
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

  function updateAudioStatusPill() {
    if (!bpmLabelEl) return;
    const srcTag = features.sourceMode === "full-hd" || features.sourceMode === "3-band" ? "3-Band" : features.sourceMode === "loudness" ? "Loudness" : "Auto";
    setTextSafe(bpmLabelEl, `${Math.round(features.bpm || 120)} BPM · ${srcTag}`);
  }

  function updateFooterMeta() {
    setTextSafe(titleEl, playback.title || "Spotify Velvet Red");
    setTextSafe(artistEl, playback.artist || (playback.isPaused ? "Paused" : "Playing"));
    updateAudioStatusPill();
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

    toggleClassSafe(document.documentElement, "wmp-lyrics-viz-active", showLyricsViz);
    toggleClassSafe(document.documentElement, "wmp-surface-active", runtime.surfaceMode);

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
        setStyleSafe(hudRoot, "left", `${Math.round(rect.left + 16)}px`);
        setStyleSafe(hudRoot, "top", `${Math.round(rect.top + 14)}px`);
        setStyleSafe(hudRoot, "width", `${Math.max(260, Math.round(rect.width - 34))}px`);
        setStyleSafe(hudRoot, "height", `${Math.max(120, Math.round(rect.height - 28))}px`);
        setStyleSafe(hudRoot, "zIndex", runtime.surfaceMode ? "65" : "55");
      }
    }

    const leftCluster = document.getElementById("wmp-hud-left-cluster");
    const lyricsToggle = document.getElementById("wmp-lyrics-viz-toggle");
    const fullBtn = document.getElementById("wmp-fullscreen-btn");
    const exitBtn = document.getElementById("wmp-surface-exit-btn");
    const footer = document.getElementById("wmp-hud-track-footer");

    setStyleSafe(leftCluster, "display", runtime.visualActive ? "inline-flex" : "none");
    setStyleSafe(fullBtn, "display", runtime.visualActive ? "inline-flex" : "none");
    setStyleSafe(exitBtn, "display", runtime.surfaceMode ? "inline-flex" : "none");
    setStyleSafe(footer, "display", runtime.surfaceMode ? "flex" : "none");

    if (lyricsToggle) {
      setStyleSafe(lyricsToggle, "display", !runtime.surfaceMode && lyricsRoute ? "inline-flex" : "none");
      toggleClassSafe(lyricsToggle, "is-on", config.lyricsEnabled);
      const txt = lyricsToggle.querySelector("span");
      setTextSafe(txt, config.lyricsEnabled ? "Visualizer: ON" : "Visualizer: OFF");
    }

    const surfaceBtn = document.getElementById("wmp-visualizer-surface-btn");
    toggleClassSafe(surfaceBtn, "active", runtime.surfaceMode);

    ensureRenderLoopState();
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
      const mb = document.createElement("button");
      mb.type = "button";
      mb.className = "wmp-model-btn" + (config.model === m.id ? " active" : "");
      mb.textContent = m.label;
      mb.dataset.modelId = m.id;
      mb.addEventListener("click", () => {
        config.model = m.id;
        writeStore(STORE_KEYS.model, m.id);
        modelsWrap.querySelectorAll(".wmp-model-btn").forEach((el) => {
          el.classList.toggle("active", el.dataset.modelId === m.id);
        });
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
    titleEl = document.createElement("div");
    titleEl.id = "wmp-hud-track-title";
    artistEl = document.createElement("div");
    artistEl.id = "wmp-hud-track-artist";
    footer.appendChild(titleEl);
    footer.appendChild(artistEl);

    hudRoot.appendChild(topBar);
    hudRoot.appendChild(footer);
    document.body.appendChild(hudRoot);

    drawColorWheel();
    updateWheelMarker();
  }

  function setupListeners() {
    window.addEventListener("resize", updateVisibilityAndLayout);

    document.addEventListener("fullscreenchange", () => {
      const activeFs = !!document.fullscreenElement;
      if (runtime.isFullscreen !== activeFs) {
        runtime.isFullscreen = activeFs;
        const fullBtn = document.getElementById("wmp-fullscreen-btn");
        setTextSafe(fullBtn, activeFs ? "Exit Fullscreen" : "Fullscreen");
        updateVisibilityAndLayout();
      }
    });

    document.addEventListener("visibilitychange", () => {
      ensureRenderLoopState();
    });

    document.addEventListener("click", (e) => {
      if (!runtime.surfaceMode) return;
      const target = e.target && e.target.closest ? e.target : null;
      if (!target || target.closest("#wmp-visualizer-surface-hud, #wmp-visualizer-surface-btn")) return;

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

    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;

      if (e.altKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        if (runtime.surfaceMode) {
          exitSurfaceMode(false);
        } else {
          runtime.surfaceMode = true;
          updateVisibilityAndLayout();
        }
      } else if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.altKey && !e.metaKey && runtime.visualActive) {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "Escape" && (runtime.isFullscreen || runtime.surfaceMode)) {
        if (runtime.isFullscreen) {
          toggleFullscreen();
        } else if (runtime.surfaceMode) {
          exitSurfaceMode(false);
        }
      }
    });

    let moRafQueued = false;
    const isOwnNode = (n) => n === canvas || n === hudRoot || n === surfaceBtnRef;
    let surfaceBtnRef = null;
    const mo = new MutationObserver((mutations) => {
      surfaceBtnRef = document.getElementById("wmp-visualizer-surface-btn");
      let relevant = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        const t = m.target;
        if ((hudRoot && hudRoot.contains(t)) || t === canvas || (surfaceBtnRef && surfaceBtnRef.contains(t))) {
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
    setupListeners();
    scanReactApis(true);
    pollPlaybackClock();
    updateVisibilityAndLayout();

    setInterval(() => {
      createSurfacePlayerButton();
      pollPlaybackClock();
      updateVisibilityAndLayout();
    }, 220);
  }

  boot();
})();
