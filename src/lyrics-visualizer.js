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
    subtle: 0.72,
    balanced: 1.08,
    overdrive: 1.52
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

  const meter = {
    bass: 0,
    mid: 0,
    high: 0,
    energy: 0,
    beatPulse: 0,
    prevRawBass: 0,
    flux: 0,
    avgFlux: 0.05,
    lastBeatIndex: -1,
    lastOnsetWallMs: 0,
    bins: new Float32Array(48),
    peaks: new Float32Array(48),
    wave: new Float32Array(128)
  };

  const apis = {
    player: null,
    platform: null,
    requestBuilder: null,
    metadataExtensions: null,
    playerListenerBound: false,
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

      if (apis.platform && !apis.metadataExtensions) {
        try {
          const reg = apis.platform.getRegistry();
          if (reg && typeof reg.resolve === "function") {
            apis.metadataExtensions = reg.resolve(Symbol.for("MetadataExtensions"));
          }
        } catch {}
      }

      if (apis.player && apis.requestBuilder && apis.metadataExtensions) break;

      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }

    bindPlayerEvents();
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

  function updateAudioFeatures(dtSec, nowMs) {
    const sens = SENSITIVITY_MAP[config.sensitivity] || 1.08;
    const isPlaying = !playback.isPaused && !!playback.trackUri;

    if (!isPlaying) {
      const decay = Math.exp(-dtSec * 6.5);
      meter.bass *= decay;
      meter.mid *= decay;
      meter.high *= decay;
      meter.energy *= decay;
      meter.beatPulse *= Math.exp(-dtSec * 9.0);
      meter.flux *= decay;
      for (let i = 0; i < 48; i++) {
        meter.bins[i] *= decay;
        meter.peaks[i] = Math.max(meter.bins[i], meter.peaks[i] - dtSec * 0.42);
      }
      for (let i = 0; i < 128; i++) {
        meter.wave[i] *= decay;
      }
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
        const env = rel < 0.06 ? rel / 0.06 : Math.exp(-(rel - 0.06) * 4.5);
        const normLoud = Math.max(0, Math.min(1, ((seg.loudness_max ?? -12) + 36) / 36));
        if (!features.lows) {
          rawBass = normLoud * env * (pitches ? (pitches[0] + pitches[1] + pitches[2]) / 2.2 : 0.85);
          rawMid = normLoud * env * (pitches ? (pitches[4] + pitches[5] + pitches[7]) / 2.2 : 0.78);
          rawHigh = normLoud * env * (pitches ? (pitches[9] + pitches[10] + pitches[11]) / 2.2 : 0.7);
          rawOnset = env > 0.78 ? normLoud : 0;
        }
      }
    }

    if (!features.lows && !features.segments && features.loudness && features.loudness.length > 0) {
      const pMs = features.loudnessPeriodMs || 40;
      const idx = Math.max(0, Math.min(features.loudness.length - 1, Math.floor((posMs - features.loudnessStartMs) / pMs)));
      const loud = features.loudness[idx];
      const kickEnv = Math.exp(-beatFrac * 5.2);
      const snareEnv = Math.exp(-((beatFrac + 0.5) % 1) * 7.5);
      rawBass = Math.min(1, loud * (0.55 + 0.65 * kickEnv));
      rawMid = Math.min(1, loud * (0.48 + 0.55 * snareEnv));
      rawHigh = Math.min(1, loud * (0.35 + 0.45 * Math.sin(exactBeat * Math.PI * 4) * 0.5 + 0.25));
      rawOnset = kickEnv > 0.75 ? loud : 0;
    }

    if (!features.lows && !features.segments && !features.loudness) {
      const seed = hashTrackSeed(playback.trackUri || "velvet");
      const groove = (seed % 7) * 0.14;
      const kickEnv = Math.exp(-beatFrac * 5.5);
      const halfBeatFrac = (exactBeat * 2) - Math.floor(exactBeat * 2);
      const snareEnv = (beatIdx % 2 === 1 ? 1 : 0.42) * Math.exp(-beatFrac * 6.5);
      const hatEnv = Math.exp(-halfBeatFrac * 9.0);
      const phrase = 0.72 + 0.28 * Math.sin(posMs * 0.0005 + groove);
      rawBass = Math.min(1, (0.24 + 0.76 * kickEnv) * phrase);
      rawMid = Math.min(1, (0.22 + 0.68 * snareEnv) * phrase);
      rawHigh = Math.min(1, (0.18 + 0.72 * hatEnv) * phrase);
      rawOnset = beatIdx !== meter.lastBeatIndex ? 0.88 : 0;
    }

    let beatTriggered = false;
    if (features.beats && features.beats.length > 0) {
      const bi = bSearchIndex(features.beats, posMs);
      if (bi !== meter.lastBeatIndex && Math.abs(posMs - features.beats[bi]) < 90) {
        meter.lastBeatIndex = bi;
        beatTriggered = true;
      }
    } else if (beatIdx !== meter.lastBeatIndex) {
      meter.lastBeatIndex = beatIdx;
      if (rawBass > 0.22 || rawOnset > 0.28 || !features.lows) {
        beatTriggered = true;
      }
    }

    const posDelta = Math.max(0, rawBass - meter.prevRawBass);
    meter.prevRawBass = rawBass;
    meter.flux = meter.flux * 0.6 + (posDelta * 3.5 + rawOnset * 0.6) * 0.4;
    meter.avgFlux = meter.avgFlux * 0.96 + meter.flux * 0.04;

    if (!beatTriggered && meter.flux > Math.max(0.24, meter.avgFlux * 2.05) && nowMs - meter.lastOnsetWallMs > Math.max(190, beatPeriodMs * 0.48)) {
      beatTriggered = true;
    }

    if (beatTriggered) {
      meter.beatPulse = 1;
      meter.lastOnsetWallMs = nowMs;
    } else {
      meter.beatPulse *= Math.exp(-dtSec * (5.2 + bpm / 38));
    }

    const tBass = Math.min(1.4, (rawBass * 0.85 + meter.beatPulse * 0.42) * sens);
    const tMid = Math.min(1.4, (rawMid * 0.92 + rawBass * 0.16) * sens);
    const tHigh = Math.min(1.4, (rawHigh * 0.95 + meter.flux * 0.35) * sens);

    const kAttack = 1 - Math.exp(-dtSec * 28);
    const kRelease = 1 - Math.exp(-dtSec * 7.5);
    meter.bass += (tBass - meter.bass) * (tBass > meter.bass ? kAttack : kRelease);
    meter.mid += (tMid - meter.mid) * (tMid > meter.mid ? kAttack : kRelease);
    meter.high += (tHigh - meter.high) * (tHigh > meter.high ? kAttack : kRelease);
    meter.energy = meter.bass * 0.48 + meter.mid * 0.34 + meter.high * 0.18;

    const tSec = posMs * 0.001;
    for (let i = 0; i < 48; i++) {
      const normF = i / 47;
      let bandBase;
      if (i < 14) {
        const w = i / 14;
        bandBase = meter.bass * (1 - w * 0.45) + meter.mid * (w * 0.35);
      } else if (i < 33) {
        const w = (i - 14) / 19;
        bandBase = meter.mid * (1 - Math.abs(w - 0.5) * 0.35) + meter.bass * ((1 - w) * 0.28) + meter.high * (w * 0.35);
      } else {
        const w = (i - 33) / 14;
        bandBase = meter.high * (0.72 + w * 0.42) + meter.mid * ((1 - w) * 0.25);
      }

      const pitchVal = pitches ? pitches[i % 12] : (0.52 + 0.48 * Math.sin(tSec * (4.2 + (i % 7) * 1.3) + i * 0.65));
      const ripple = 0.58 + 0.42 * Math.sin(tSec * (7.5 + i * 0.95) - normF * 9.0 + meter.beatPulse * 2.2) * Math.cos(tSec * 3.1 + i * 1.4);
      const binTarget = Math.max(0.02, Math.min(1.0, bandBase * (0.52 + pitchVal * 0.42) * ripple + meter.beatPulse * (i < 12 ? 0.26 : 0.09)));

      const bLerp = binTarget > meter.bins[i] ? kAttack : kRelease;
      meter.bins[i] += (binTarget - meter.bins[i]) * bLerp;
      if (meter.bins[i] > meter.peaks[i]) {
        meter.peaks[i] = meter.bins[i];
      } else {
        meter.peaks[i] = Math.max(meter.bins[i], meter.peaks[i] - dtSec * 0.38);
      }
    }

    for (let i = 0; i < 128; i++) {
      const p = (i / 128) * Math.PI * 2;
      const w1 = Math.sin(p * 2 + tSec * 7.2) * (0.35 + meter.bass * 0.85);
      const w2 = Math.sin(p * 6 - tSec * 12.5) * (0.22 + meter.mid * 0.65);
      const w3 = Math.sin(p * 17 + tSec * 23.0) * (0.12 + meter.high * 0.55);
      const wBeat = Math.cos(p * 4 + tSec * 4.5) * meter.beatPulse * 0.35;
      meter.wave[i] = Math.max(-1.2, Math.min(1.2, w1 + w2 + w3 + wBeat));
    }

    runtime.phase += dtSec * (1.2 + meter.energy * 3.6 + (bpm / 120) * 0.8);
    runtime.spiralPhase += dtSec * (0.45 + meter.bass * 1.65 + meter.beatPulse * 0.9);
    runtime.tunnelPhase += dtSec * (0.55 + meter.energy * 1.9);

    if (config.rgbRotate) {
      runtime.rotHue = (runtime.rotHue + dtSec * (22 + meter.energy * 42)) % 360;
    } else {
      runtime.rotHue = config.hue;
    }

    return true;
  }

  function hslColor(hueOffset, alpha, lightBoost) {
    const h = ((runtime.rotHue + hueOffset) % 360 + 360) % 360;
    const s = config.rgbRotate ? Math.max(76, config.sat) : config.sat;
    const l = Math.max(18, Math.min(92, 54 + (lightBoost || 0)));
    return `hsla(${h.toFixed(1)}, ${s.toFixed(0)}%, ${l.toFixed(0)}%, ${alpha.toFixed(3)})`;
  }

  function renderTunnel(w, h) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const minDim = Math.min(w, h);
    const fbW = fbCanvas.width;
    const fbH = fbCanvas.height;

    fbCtx.save();
    fbCtx.globalCompositeOperation = "copy";
    fbCtx.globalAlpha = 1;
    fbCtx.fillStyle = "#000000";
    fbCtx.fillRect(0, 0, fbW, fbH);
    fbCtx.restore();

    fbCtx.save();
    fbCtx.fillStyle = `rgba(6, 1, 3, ${(0.12 + (1 - Math.min(1, meter.energy)) * 0.14).toFixed(3)})`;
    fbCtx.fillRect(0, 0, fbW, fbH);
    const zoom = 1.028 + meter.bass * 0.042 + meter.beatPulse * 0.036;
    const rot = Math.sin(runtime.tunnelPhase * 0.45) * 0.012 + meter.mid * 0.008;
    fbCtx.translate(fbW * 0.5, fbH * 0.5);
    fbCtx.rotate(rot);
    fbCtx.scale(zoom, zoom);
    fbCtx.globalAlpha = 0.88;
    fbCtx.drawImage(canvas, -fbW * 0.5, -fbH * 0.5, fbW, fbH);
    fbCtx.restore();

    ctx.globalCompositeOperation = "copy";
    ctx.drawImage(fbCanvas, 0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const strands = 6;
    const pts = 112;
    const baseR = minDim * (0.20 + meter.bass * 0.085 + meter.beatPulse * 0.045);

    for (let s = 0; s < strands; s++) {
      const strandShift = (s / strands) * Math.PI * 2;
      const hueOff = (s * 42) - 40;
      ctx.beginPath();
      ctx.lineWidth = s === 0 ? 2.4 : 1.5;
      ctx.strokeStyle = hslColor(hueOff, s === 0 ? 0.92 : 0.58, s === 0 ? 18 : 6);

      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const wIdx = Math.floor((i / pts) * 127);
        const wVal = meter.wave[(wIdx + s * 19) & 127];
        const bVal = meter.bins[(i + s * 7) % 48];
        const sharpSpike = Math.sin(a * (5 + s) + runtime.phase * (1.2 + s * 0.25)) * (6 + meter.high * 22);
        const r = baseR + wVal * minDim * (0.045 + meter.mid * 0.055) + bVal * minDim * 0.045 + sharpSpike;
        const px = cx + Math.cos(a + strandShift * 0.08) * r;
        const py = cy + Math.sin(a + strandShift * 0.08) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function renderSpiral(w, h) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = Math.min(w, h) * 0.47;

    ctx.fillStyle = "rgba(8, 2, 4, 0.20)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const arms = 5;
    const steps = 84;
    for (let a = 0; a < arms; a++) {
      const baseAngle = (a / arms) * Math.PI * 2 + runtime.spiralPhase;
      ctx.beginPath();
      ctx.lineWidth = 2.0 + meter.bass * 1.4;
      ctx.strokeStyle = hslColor(a * 45, 0.85, 10);

      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const bin = meter.bins[Math.floor(t * 47)];
        const radius = t * maxR * (0.85 + meter.bass * 0.22);
        const theta = baseAngle + t * (4.6 + meter.mid * 1.8) + Math.sin(t * 10 - runtime.phase) * (0.18 + bin * 0.35);
        const wobble = bin * 28 * Math.sin(t * 14 + runtime.phase);
        const x = cx + Math.cos(theta) * (radius + wobble);
        const y = cy + Math.sin(theta) * (radius + wobble);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const coreR = 16 + meter.bass * 32 + meter.beatPulse * 24;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.2);
    grad.addColorStop(0, hslColor(0, 0.85, 28));
    grad.addColorStop(0.5, hslColor(25, 0.38, 10));
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "source-over";
  }

  function renderStarburst(w, h) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const minDim = Math.min(w, h);

    ctx.fillStyle = "rgba(8, 2, 4, 0.17)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";

    const layers = 7;
    const pts = 96;
    for (let l = 0; l < layers; l++) {
      const k = l / (layers - 1);
      const baseR = minDim * (0.09 + k * 0.31) * (0.86 + meter.bass * 0.28 + meter.beatPulse * 0.14);
      const lobes = 6 + (l % 3) * 2;
      ctx.beginPath();
      ctx.lineWidth = 1.6 + (1 - k) * 1.4;
      ctx.strokeStyle = hslColor(l * 34 - 30, 0.72 - k * 0.25, 12);

      for (let i = 0; i <= pts; i++) {
        const ang = (i / pts) * Math.PI * 2;
        const bin = meter.bins[(i + l * 5) % 48];
        const amp = Math.sin(ang * lobes + runtime.phase * (l % 2 === 0 ? 1 : -1)) * (14 + meter.mid * 36) + bin * (24 + meter.high * 38);
        const r = Math.max(8, baseR + amp);
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";
  }

  function renderScope(w, h) {
    ctx.fillStyle = "rgba(9, 2, 5, 0.32)";
    ctx.fillRect(0, 0, w, h);

    const padX = Math.max(24, w * 0.05);
    const usableW = w - padX * 2;
    const barCount = 48;
    const slotW = usableW / barCount;
    const barW = Math.max(4, slotW * 0.7);
    const cy = h * 0.5;
    const maxBarH = h * 0.34;

    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < barCount; i++) {
      const val = meter.bins[i];
      const peakVal = meter.peaks[i];
      const x = padX + i * slotW + (slotW - barW) * 0.5;
      const barH = Math.max(3, val * maxBarH);
      const peakYOff = peakVal * maxBarH;

      const grad = ctx.createLinearGradient(x, cy - barH, x, cy + barH);
      grad.addColorStop(0, hslColor(i * 3.5 + 20, 0.92, 22));
      grad.addColorStop(0.5, hslColor(i * 2.0, 0.75, 4));
      grad.addColorStop(1, hslColor(i * 3.5 + 20, 0.92, 22));

      ctx.fillStyle = grad;
      ctx.fillRect(x, cy - barH, barW, barH * 2);

      ctx.fillStyle = hslColor(i * 3.5 + 35, 0.96, 32);
      ctx.fillRect(x, cy - peakYOff - 3, barW, 2.5);
      ctx.fillRect(x, cy + peakYOff + 0.5, barW, 2.5);
    }

    ctx.beginPath();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = hslColor(10, 0.95, 28);
    for (let i = 0; i < 128; i++) {
      const x = padX + (i / 127) * usableW;
      const y = cy + meter.wave[i] * h * (0.09 + meter.energy * 0.11);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = hslColor(55, 0.72, 22);
    for (let i = 0; i < 128; i++) {
      const x = padX + (i / 127) * usableW;
      const y = cy - meter.wave[(i + 32) & 127] * h * (0.06 + meter.high * 0.08);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.globalCompositeOperation = "source-over";
  }

  function renderCyber(w, h) {
    const cx = w * 0.5;
    const horizonY = h * 0.46;
    const orbY = horizonY - Math.min(w, h) * 0.04;

    ctx.fillStyle = "rgba(8, 1, 4, 0.28)";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.strokeStyle = hslColor(-8, 0.52, 6);
    ctx.lineWidth = 1.2;

    const gridCols = 18;
    for (let i = -gridCols; i <= gridCols; i++) {
      const xTop = cx + i * (w * 0.018);
      const xBot = cx + i * (w * 0.085);
      ctx.beginPath();
      ctx.moveTo(xTop, horizonY);
      ctx.lineTo(xBot, h);
      ctx.stroke();
    }

    const zLines = 12;
    const zScroll = (runtime.tunnelPhase * 0.65) % 1;
    for (let i = 0; i < zLines; i++) {
      const frac = Math.pow((i + zScroll) / zLines, 2.2);
      const y = horizonY + frac * (h - horizonY);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.strokeStyle = hslColor(0, 0.9, 24);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();
    ctx.restore();

    ctx.globalCompositeOperation = "lighter";
    const orbR = Math.min(w, h) * (0.14 + meter.bass * 0.045 + meter.beatPulse * 0.025);
    const spokes = 48;

    for (let i = 0; i < spokes; i++) {
      const ang = (i / spokes) * Math.PI * 2 + runtime.phase * 0.18;
      const len = orbR + meter.bins[i] * Math.min(w, h) * 0.16;
      const x1 = cx + Math.cos(ang) * (orbR * 0.85);
      const y1 = orbY + Math.sin(ang) * (orbR * 0.85);
      const x2 = cx + Math.cos(ang) * len;
      const y2 = orbY + Math.sin(ang) * len;

      ctx.strokeStyle = hslColor(i * 4, 0.88, 18);
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    const sunGrad = ctx.createLinearGradient(cx, orbY - orbR, cx, orbY + orbR);
    sunGrad.addColorStop(0, hslColor(25, 0.92, 26));
    sunGrad.addColorStop(0.55, hslColor(0, 0.72, 10));
    sunGrad.addColorStop(1, hslColor(-20, 0.88, -6));
    ctx.beginPath();
    ctx.arc(cx, orbY, orbR * 0.78, 0, Math.PI * 2);
    ctx.strokeStyle = hslColor(10, 0.95, 25);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = sunGrad;
    ctx.globalAlpha = 0.26 + meter.bass * 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.globalCompositeOperation = "source-over";
  }

  function getMainViewContainer() {
    return (
      document.getElementById("main-view") ||
      document.querySelector(".R1kU6b2KxZc8FWfbYf3m") ||
      document.querySelector(".main-view-container")
    );
  }

  function isOnLyricsRoute() {
    if (location.pathname.includes("/lyrics")) return true;
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

    if (config.model === "tunnel") renderTunnel(w, h);
    else if (config.model === "spiral") renderSpiral(w, h);
    else if (config.model === "starburst") renderStarburst(w, h);
    else if (config.model === "scope") renderScope(w, h);
    else renderCyber(w, h);

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
    const lyricsRoute = isOnLyricsRoute();
    const pathChanged = location.pathname !== runtime.lastPath;
    if (runtime.surfaceMode && ((lyricsRoute && !runtime.wasLyricsRoute) || (pathChanged && location.pathname.includes("/lyrics")))) {
      runtime.surfaceMode = false;
    }
    runtime.lastPath = location.pathname;
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
      runtime.surfaceMode = !runtime.surfaceMode;
      if (!runtime.surfaceMode && runtime.isFullscreen) {
        toggleFullscreen();
      }
      updateVisibilityAndLayout();
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
      runtime.surfaceMode = false;
      if (runtime.isFullscreen) toggleFullscreen();
      updateVisibilityAndLayout();
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

    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target && e.target.isContentEditable)) return;

      if (e.altKey && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        runtime.surfaceMode = !runtime.surfaceMode;
        if (!runtime.surfaceMode && runtime.isFullscreen) toggleFullscreen();
        updateVisibilityAndLayout();
      } else if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.altKey && !e.metaKey && runtime.visualActive) {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "Escape" && (runtime.isFullscreen || runtime.surfaceMode)) {
        if (runtime.isFullscreen) {
          toggleFullscreen();
        } else if (runtime.surfaceMode) {
          runtime.surfaceMode = false;
          updateVisibilityAndLayout();
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
