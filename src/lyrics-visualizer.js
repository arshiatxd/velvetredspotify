(function () {
  if (window.__wmpTunnelVisualizerLoaded) return;
  window.__wmpTunnelVisualizerLoaded = true;

  var INTERNAL_W = 600;
  var INTERNAL_H = 375;
  var VERTEX_COUNT = 120;
  var STRAND_COUNT = 6;
  var FRAME_INTERVAL_PLAYING = 33;
  var FRAME_INTERVAL_PAUSED = 120;

  var WMP_PALETTES = [192, 118, 285, 348, 220, 38, 160, 315];
  var paletteIdx = 0;

  var settings = {
    model: "tunnel",
    customHue: 192,
    customSat: 94,
    rgbRotation: true,
    lyricsVizOn: true
  };

  try {
    var saved = localStorage.getItem("wmp_viz_settings_v2");
    if (saved) {
      var parsed = JSON.parse(saved);
      if (parsed.model) settings.model = parsed.model;
      if (typeof parsed.customHue === "number") settings.customHue = parsed.customHue;
      if (typeof parsed.customSat === "number") settings.customSat = parsed.customSat;
      if (typeof parsed.rgbRotation === "boolean") settings.rgbRotation = parsed.rgbRotation;
      if (typeof parsed.lyricsVizOn === "boolean") settings.lyricsVizOn = parsed.lyricsVizOn;
    }
  } catch (e) {}

  function saveSettings() {
    try {
      localStorage.setItem("wmp_viz_settings_v2", JSON.stringify(settings));
    } catch (e) {}
  }

  var currentHue = settings.customHue;
  var targetHue = settings.customHue;

  var canvas = null;
  var ctx = null;
  var backCanvas = null;
  var backCtx = null;
  var hudEl = null;
  var lyricsToggleBtn = null;
  var surfaceBtn = null;
  var wheelCanvas = null;
  var wheelCtx = null;
  var wheelImageCache = null;

  var surfaceMode = false;
  var fullscreenMode = false;
  var wasLyricsOpen = false;
  var isRunning = false;
  var rafId = 0;
  var lastFrameTime = 0;

  var cachedViewportEl = null;
  var rectLeft = 300;
  var rectTop = 64;
  var rectWidth = 900;
  var rectHeight = 600;
  var rectDirty = true;

  var cosTable = new Float32Array(VERTEX_COUNT + 1);
  var sinTable = new Float32Array(VERTEX_COUNT + 1);
  var vxBuf = new Float32Array(VERTEX_COUNT + 1);
  var vyBuf = new Float32Array(VERTEX_COUNT + 1);
  var waveHarmonics = new Float32Array(24);
  var targetHarmonics = new Float32Array(24);
  var barPeaks = new Float32Array(48);
  var barValues = new Float32Array(48);

  for (var i = 0; i <= VERTEX_COUNT; i++) {
    var a = (i / VERTEX_COUNT) * Math.PI * 2;
    cosTable[i] = Math.cos(a);
    sinTable[i] = Math.sin(a);
  }

  var spPlayerAPI = null;
  var spRequestBuilder = null;
  var currentTrackId = "";
  var currentTrackTitle = "";
  var currentTrackArtist = "";
  var isMusicPlaying = false;
  var trackAnalysis = null;
  var analysisPendingId = "";
  var lastBarIdx = -1;
  var lastBeatIdx = -1;
  var lastLyricText = "";

  var smoothBass = 0;
  var smoothMid = 0;
  var smoothHigh = 0;
  var beatPulse = 0;
  var barShock = 0;
  var tunnelPhase = 0;
  var spiralAngle = 0;
  var spiralDir = 1;
  var throatOffsetX = 0;
  var throatOffsetY = 0;
  var gridOffset = 0;
  var edgeAngle = 0;
  var localPlayPosSec = 0;
  var lastAnchorRaw = "";
  var lastTelemetryMs = 0;
  var trackDurationSec = 240;

  function connectSpotifyInternalAPIs() {
    if (spPlayerAPI && spRequestBuilder) return true;
    var root = document.getElementById("main");
    if (!root) return false;
    var keys = Object.keys(root);
    var fiberKey = null;
    for (var i = 0; i < keys.length; i++) {
      if (keys[i].indexOf("__reactContainer") === 0 || keys[i].indexOf("__reactFiber") === 0) {
        fiberKey = keys[i];
        break;
      }
    }
    if (!fiberKey) return false;

    var queue = [root[fiberKey]];
    var visited = new Set();
    var map = null;
    while (queue.length > 0) {
      var node = queue.shift();
      if (!node || visited.has(node)) continue;
      visited.add(node);
      var props = node.memoizedProps || node.pendingProps;
      if (props && props.value && props.value._map) {
        map = props.value._map;
        break;
      }
      if (node.child) queue.push(node.child);
      if (node.sibling) queue.push(node.sibling);
    }
    if (!map) return false;

    map.forEach(function (val, key) {
      var s = key.toString();
      if (s === "Symbol(PlayerAPI)" && val && val.instance) spPlayerAPI = val.instance;
      if (s === "Symbol(RequestBuilder)" && val && val.instance) spRequestBuilder = val.instance;
    });
    return !!spPlayerAPI;
  }

  function fetchAudioAnalysis(trackId) {
    if (!trackId || trackId === analysisPendingId || !spRequestBuilder) return;
    analysisPendingId = trackId;
    trackAnalysis = null;

    try {
      spRequestBuilder
        .build()
        .withHost("https://spclient.wg.spotify.com")
        .withPath("/audio-attributes/v1/audio-analysis/" + trackId)
        .withEndpointIdentifier("/audio-attributes/v1/audio-analysis/")
        .send()
        .then(function (res) {
          if (currentTrackId !== trackId) return;
          var body = typeof res.body === "string" ? JSON.parse(res.body) : res.body;
          if (!body || !body.segments) return;

          var segs = body.segments;
          var nSeg = segs.length;
          var segStart = new Float32Array(nSeg);
          var segDur = new Float32Array(nSeg);
          var segLoudStart = new Float32Array(nSeg);
          var segLoudMax = new Float32Array(nSeg);
          var segLoudMaxTime = new Float32Array(nSeg);
          var segBass = new Float32Array(nSeg);
          var segSharp = new Float32Array(nSeg);
          var segPitches = new Float32Array(nSeg * 12);

          for (var i = 0; i < nSeg; i++) {
            var s = segs[i];
            segStart[i] = s.start || 0;
            segDur[i] = s.duration || 0.1;
            segLoudStart[i] = s.loudness_start != null ? s.loudness_start : -30;
            segLoudMax[i] = s.loudness_max != null ? s.loudness_max : -20;
            segLoudMaxTime[i] = s.loudness_max_time || 0.02;
            var t = s.timbre || [];
            segBass[i] = t.length > 1 ? Math.max(-1, Math.min(1, (80 - t[1]) / 120)) : 0;
            segSharp[i] = t.length > 2 ? Math.max(-1, Math.min(1, t[2] / 100)) : 0;
            var p = s.pitches || [];
            var baseP = i * 12;
            for (var k = 0; k < 12; k++) {
              segPitches[baseP + k] = p[k] != null ? p[k] : 0.2;
            }
          }

          var beats = body.beats || [];
          var nBeat = beats.length;
          var beatStart = new Float32Array(nBeat);
          var beatDur = new Float32Array(nBeat);
          var beatConf = new Float32Array(nBeat);
          for (var b = 0; b < nBeat; b++) {
            beatStart[b] = beats[b].start || 0;
            beatDur[b] = beats[b].duration || 0.5;
            beatConf[b] = beats[b].confidence != null ? beats[b].confidence : 0.6;
          }

          var bars = body.bars || [];
          var nBar = bars.length;
          var barStart = new Float32Array(nBar);
          for (var r = 0; r < nBar; r++) {
            barStart[r] = bars[r].start || 0;
          }

          trackAnalysis = {
            nSeg: nSeg,
            segStart: segStart,
            segDur: segDur,
            segLoudStart: segLoudStart,
            segLoudMax: segLoudMax,
            segLoudMaxTime: segLoudMaxTime,
            segBass: segBass,
            segSharp: segSharp,
            segPitches: segPitches,
            nBeat: nBeat,
            beatStart: beatStart,
            beatDur: beatDur,
            beatConf: beatConf,
            nBar: nBar,
            barStart: barStart
          };
          lastBarIdx = -1;
          lastBeatIdx = -1;
        })
        .catch(function () {});
    } catch (e) {}
  }

  function binarySearchTime(arr, n, t) {
    var lo = 0;
    var hi = n - 1;
    var ans = 0;
    while (lo <= hi) {
      var mid = (lo + hi) >>> 1;
      if (arr[mid] <= t) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  function triggerColorAdvance() {
    if (!settings.rgbRotation) return;
    paletteIdx = (paletteIdx + 1) % WMP_PALETTES.length;
    targetHue = WMP_PALETTES[paletteIdx];
  }

  function updateAudioTelemetry(nowMs) {
    connectSpotifyInternalAPIs();

    var dtSec = lastTelemetryMs > 0 ? Math.min(0.25, Math.max(0.005, (nowMs - lastTelemetryMs) * 0.001)) : 0.033;
    lastTelemetryMs = nowMs;

    var wallNow = Date.now();
    if (spPlayerAPI && spPlayerAPI.getState) {
      var st = spPlayerAPI.getState();
      if (st) {
        isMusicPlaying = !st.isPaused;
        var basePos = Number(st.positionAsOfTimestamp) || 0;
        var ts = Number(st.timestamp) || wallNow;
        var dur = Number(st.duration) || (st.item && Number(st.item.duration)) || 0;
        if (dur > 1000) trackDurationSec = dur * 0.001;

        var anchorKey = basePos + ":" + ts + ":" + (isMusicPlaying ? 1 : 0);
        if (anchorKey !== lastAnchorRaw) {
          lastAnchorRaw = anchorKey;
          var elapsedMs = ts > 1000000000000 ? Math.max(0, wallNow - ts) : Math.max(0, nowMs - ts);
          if (elapsedMs > 600000) elapsedMs = 0;
          localPlayPosSec = (isMusicPlaying ? basePos + elapsedMs : basePos) * 0.001;
        } else if (isMusicPlaying) {
          localPlayPosSec += dtSec;
        }

        var item = st.item;
        if (item && item.uri) {
          var parts = item.uri.split(":");
          var tid = parts.length > 2 ? parts[2] : "";
          if (tid && tid !== currentTrackId) {
            currentTrackId = tid;
            currentTrackTitle = item.name || (item.metadata && item.metadata.title) || "";
            currentTrackArtist = (item.metadata && item.metadata.artist_name) || "";
            localPlayPosSec = basePos * 0.001;
            updateHudInfo();
            fetchAudioAnalysis(tid);
          }
        }
      }
    } else {
      var playBtn = document.querySelector('[data-testid="control-button-playpause"]');
      if (playBtn) {
        var label = (playBtn.getAttribute("aria-label") || "").toLowerCase();
        isMusicPlaying = label.indexOf("pause") !== -1;
      }
      if (isMusicPlaying) localPlayPosSec += dtSec;
    }

    var posSec = localPlayPosSec;

    if (!isMusicPlaying) {
      smoothBass *= 0.84;
      smoothMid *= 0.84;
      smoothHigh *= 0.84;
      beatPulse *= 0.82;
      barShock *= 0.82;
      for (var z = 0; z < 24; z++) {
        waveHarmonics[z] *= 0.85;
      }
      return;
    }

    var activeLyricEl = document.querySelector('[data-testid="fullscreen-lyric"][aria-current="true"], .lyrics-lyricsContent-active');
    if (activeLyricEl) {
      var txt = activeLyricEl.textContent || "";
      if (txt && txt !== lastLyricText) {
        lastLyricText = txt;
        barShock = Math.max(barShock, 0.75);
        edgeAngle = Math.random() * Math.PI * 2;
        triggerColorAdvance();
      }
    }

    var hasValidSegment = false;
    if (trackAnalysis && trackAnalysis.nSeg > 0) {
      var ta = trackAnalysis;
      var lastSegEnd = ta.segStart[ta.nSeg - 1] + (ta.segDur[ta.nSeg - 1] || 1);
      if (posSec >= 0 && posSec <= lastSegEnd + 2.5) {
        hasValidSegment = true;
        var sIdx = binarySearchTime(ta.segStart, ta.nSeg, posSec);
        var sElapsed = Math.max(0, posSec - ta.segStart[sIdx]);
        var sDur = Math.max(0.04, ta.segDur[sIdx]);
        var maxT = Math.max(0.01, ta.segLoudMaxTime[sIdx]);

        var db = ta.segLoudMax[sIdx];
        if (sElapsed < maxT) {
          var rUp = sElapsed / maxT;
          db = ta.segLoudStart[sIdx] + (ta.segLoudMax[sIdx] - ta.segLoudStart[sIdx]) * rUp;
        } else {
          var nextLoud = sIdx + 1 < ta.nSeg ? ta.segLoudStart[sIdx + 1] : -35;
          var rDown = Math.min(1, (sElapsed - maxT) / Math.max(0.02, sDur - maxT));
          db = ta.segLoudMax[sIdx] + (nextLoud - ta.segLoudMax[sIdx]) * rDown;
        }

        var loudNorm = Math.max(0.12, Math.min(1, (db + 38) / 34));
        var loudDrop = Math.max(0, (ta.segLoudMax[sIdx] - ta.segLoudStart[sIdx]) / 16);
        var rawBass = Math.max(0.08, Math.min(1.35, loudNorm * (0.75 + 0.55 * Math.max(0, ta.segBass[sIdx])) + loudDrop * 0.28));
        var rawHigh = Math.max(0.06, Math.min(1.25, loudNorm * (0.65 + 0.5 * Math.abs(ta.segSharp[sIdx]))));

        if (ta.nBeat > 0) {
          var bIdx = binarySearchTime(ta.beatStart, ta.nBeat, posSec);
          var bElapsed = Math.max(0, posSec - ta.beatStart[bIdx]);
          var bConf = ta.beatConf[bIdx];
          if (bIdx !== lastBeatIdx && bElapsed < 0.14) {
            lastBeatIdx = bIdx;
            beatPulse = Math.max(beatPulse, (0.52 + 0.55 * bConf) * loudNorm);
            if (rawBass > 0.55 && bConf > 0.45) {
              throatOffsetX = (Math.random() - 0.5) * 28 * rawBass;
              throatOffsetY = (Math.random() - 0.5) * 20 * rawBass;
              edgeAngle = Math.random() * Math.PI * 2;
            }
          }
        }

        if (ta.nBar > 0) {
          var rIdx = binarySearchTime(ta.barStart, ta.nBar, posSec);
          if (rIdx !== lastBarIdx && Math.abs(posSec - ta.barStart[rIdx]) < 0.16) {
            lastBarIdx = rIdx;
            barShock = Math.max(barShock, 0.88 * loudNorm);
            triggerColorAdvance();
            if (Math.random() < 0.45) spiralDir = -spiralDir;
          }
        }

        smoothBass = smoothBass * 0.62 + rawBass * 0.38;
        smoothMid = smoothMid * 0.7 + loudNorm * 0.3;
        smoothHigh = smoothHigh * 0.66 + rawHigh * 0.34;
        beatPulse *= 0.84;
        barShock *= 0.88;

        var pBase = sIdx * 12;
        for (var p = 0; p < 12; p++) {
          var pv = ta.segPitches[pBase + p];
          var osc = Math.sin(posSec * (5.2 + p * 0.85) + p) * 0.18;
          targetHarmonics[p] = ((pv - 0.28) + osc) * (0.6 + smoothBass * 1.2 + beatPulse * 0.9);
          targetHarmonics[p + 12] = ((ta.segPitches[pBase + ((p + 5) % 12)] - 0.28) - osc) * (0.5 + smoothHigh * 1.2);
        }
        for (var h = 0; h < 24; h++) {
          waveHarmonics[h] = waveHarmonics[h] * 0.58 + targetHarmonics[h] * 0.42;
        }
      }
    }

    if (!hasValidSegment) {
      var t = nowMs * 0.001;
      var gate = 0.28 + 0.72 * Math.max(0, Math.sin(t * 2.1) * Math.cos(t * 0.73 + 0.9));
      var kick = Math.pow(Math.max(0, Math.sin(t * 6.4 + Math.sin(t * 1.3))), 5) * gate;
      if (kick > 0.48 && beatPulse < 0.3) {
        beatPulse = kick * 0.95;
        edgeAngle = Math.random() * Math.PI * 2;
        if (Math.random() < 0.25) triggerColorAdvance();
      }
      smoothBass = smoothBass * 0.72 + (gate * 0.48 + kick * 0.7) * 0.28;
      smoothMid = smoothMid * 0.78 + gate * 0.52 * 0.22;
      smoothHigh = smoothHigh * 0.72 + (0.2 + Math.abs(Math.sin(t * 4.7)) * 0.65) * gate * 0.28;
      beatPulse *= 0.85;
      barShock *= 0.88;
      for (var j = 0; j < 24; j++) {
        var v = Math.sin(t * (3.6 + j * 0.72) + j * 1.9) * (0.25 + smoothBass * 0.7 + beatPulse * 0.6);
        waveHarmonics[j] = waveHarmonics[j] * 0.62 + v * 0.38;
      }
    }
  }

  function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
    var k = function (n) {
      return (n + h / 30) % 12;
    };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) {
      return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    };
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }

  function drawColorWheelWidget() {
    if (!wheelCanvas || !wheelCtx) return;
    var size = wheelCanvas.width;
    var r = size * 0.5;
    if (!wheelImageCache) {
      var img = wheelCtx.createImageData(size, size);
      var data = img.data;
      for (var y = 0; y < size; y++) {
        for (var x = 0; x < size; x++) {
          var dx = x - r;
          var dy = y - r;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var idx = (y * size + x) * 4;
          if (dist <= r) {
            var angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
            var sat = Math.min(100, (dist / r) * 100);
            var rgb = hslToRgb(angle, sat, 52);
            data[idx] = rgb[0];
            data[idx + 1] = rgb[1];
            data[idx + 2] = rgb[2];
            data[idx + 3] = 255;
          } else {
            data[idx + 3] = 0;
          }
        }
      }
      wheelImageCache = img;
    }
    wheelCtx.putImageData(wheelImageCache, 0, 0);

    var activeH = settings.rgbRotation ? currentHue : settings.customHue;
    var activeS = settings.rgbRotation ? 92 : settings.customSat;
    var rad = (activeH * Math.PI) / 180;
    var distPx = (activeS / 100) * (r - 3);
    var px = r + Math.cos(rad) * distPx;
    var py = r + Math.sin(rad) * distPx;

    wheelCtx.beginPath();
    wheelCtx.arc(px, py, 3.5, 0, Math.PI * 2);
    wheelCtx.strokeStyle = "#000000";
    wheelCtx.lineWidth = 2.2;
    wheelCtx.stroke();
    wheelCtx.strokeStyle = "#ffffff";
    wheelCtx.lineWidth = 1.2;
    wheelCtx.stroke();
  }

  function pickColorFromWheelEvent(ev) {
    if (!wheelCanvas) return;
    var rect = wheelCanvas.getBoundingClientRect();
    var r = rect.width * 0.5;
    var dx = ev.clientX - rect.left - r;
    var dy = ev.clientY - rect.top - r;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    var sat = Math.max(25, Math.min(100, (dist / r) * 100));

    settings.customHue = Math.round(hue);
    settings.customSat = Math.round(sat);
    settings.rgbRotation = false;
    currentHue = settings.customHue;
    targetHue = settings.customHue;

    var rotCb = document.getElementById("wmp-rgb-rot-checkbox");
    if (rotCb) rotCb.checked = false;

    saveSettings();
    drawColorWheelWidget();
  }

  function ensureCanvasAndHud() {
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.id = "spotify-lyrics-visualizer";
      canvas.width = INTERNAL_W;
      canvas.height = INTERNAL_H;
      ctx = canvas.getContext("2d", { alpha: false });

      backCanvas = document.createElement("canvas");
      backCanvas.width = INTERNAL_W;
      backCanvas.height = INTERNAL_H;
      backCtx = backCanvas.getContext("2d", { alpha: false });

      ctx.fillStyle = "#010203";
      ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
      backCtx.fillStyle = "#010203";
      backCtx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
    }

      var hostContainer = fullscreenMode ? document.body : document.querySelector(".main-view-container") || document.body;
      if (hostContainer && canvas.parentElement !== hostContainer) {
        if (!fullscreenMode && hostContainer.firstChild) {
          hostContainer.insertBefore(canvas, hostContainer.firstChild);
        } else {
          hostContainer.appendChild(canvas);
        }
      }

      if (!lyricsToggleBtn && document.body) {
        lyricsToggleBtn = document.createElement("button");
        lyricsToggleBtn.id = "wmp-lyrics-viz-toggle";
        lyricsToggleBtn.type = "button";
        updateLyricsToggleUI();
        lyricsToggleBtn.addEventListener("click", function () {
          settings.lyricsVizOn = !settings.lyricsVizOn;
          saveSettings();
          updateLyricsToggleUI();
          evaluateVisibilityAndLifecycle();
        });
        document.body.appendChild(lyricsToggleBtn);
      }

      if (!hudEl && document.body) {
        hudEl = document.createElement("div");
        hudEl.id = "wmp-visualizer-surface-hud";
        hudEl.innerHTML =
          '<div class="wmp-hud-top">' +
          '<div class="wmp-studio-bar">' +
          '<div class="wmp-model-group">' +
          '<button type="button" class="wmp-model-btn" data-model="tunnel">XP Tunnel</button>' +
          '<button type="button" class="wmp-model-btn" data-model="spiral">Spiral Vortex</button>' +
          '<button type="button" class="wmp-model-btn" data-model="starburst">WMC Starburst</button>' +
          '<button type="button" class="wmp-model-btn" data-model="scope">Scope & Bars</button>' +
          '<button type="button" class="wmp-model-btn" data-model="cyber">Cyber Orb</button>' +
          "</div>" +
          '<div class="wmp-divider"></div>' +
          '<div class="wmp-color-controls">' +
          '<canvas id="wmp-color-wheel-canvas" width="32" height="32" title="Drag on RGB Color Wheel to select custom color"></canvas>' +
          '<label class="wmp-rot-label" title="Automatically rotate colors across the RGB spectrum">' +
          '<input type="checkbox" id="wmp-rgb-rot-checkbox" />' +
          "<span>RGB Rotation</span>" +
          "</label>" +
          "</div>" +
          "</div>" +
          '<div class="wmp-hud-actions">' +
          '<button class="wmp-hud-fullscreen" id="wmp-hud-fullscreen-btn" type="button" title="Toggle Fullscreen Visualizer (F11 / Esc)">' +
          '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">' +
          '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>' +
          "</svg>" +
          "<span>Fullscreen</span>" +
          "</button>" +
          '<button class="wmp-hud-close" type="button">Exit Surface</button>' +
          "</div>" +
          "</div>" +
          '<div class="wmp-hud-bottom">' +
          "<div>" +
          '<div class="wmp-hud-title" id="wmp-hud-track-title">Spotify Velvet Red</div>' +
          '<div class="wmp-hud-artist" id="wmp-hud-track-artist">Playing Audio Stream</div>' +
          "</div>" +
          "</div>";
        document.body.appendChild(hudEl);

        var modelBtns = hudEl.querySelectorAll(".wmp-model-btn");
        for (var m = 0; m < modelBtns.length; m++) {
          (function (btn) {
            var mName = btn.getAttribute("data-model");
            if (mName === settings.model) btn.classList.add("active");
            btn.addEventListener("click", function () {
              settings.model = mName;
              saveSettings();
              for (var k = 0; k < modelBtns.length; k++) {
                modelBtns[k].classList.toggle("active", modelBtns[k] === btn);
              }
              if (ctx && backCtx) {
                ctx.fillStyle = "#010203";
                ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
                backCtx.fillStyle = "#010203";
                backCtx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
              }
            });
          })(modelBtns[m]);
        }

        wheelCanvas = document.getElementById("wmp-color-wheel-canvas");
        if (wheelCanvas) {
          wheelCtx = wheelCanvas.getContext("2d");
          var draggingWheel = false;
          wheelCanvas.addEventListener("mousedown", function (e) {
            draggingWheel = true;
            pickColorFromWheelEvent(e);
          });
          window.addEventListener("mousemove", function (e) {
            if (draggingWheel) pickColorFromWheelEvent(e);
          });
          window.addEventListener("mouseup", function () {
            draggingWheel = false;
          });
          drawColorWheelWidget();
        }

        var rotCb = document.getElementById("wmp-rgb-rot-checkbox");
        if (rotCb) {
          rotCb.checked = settings.rgbRotation;
          rotCb.addEventListener("change", function () {
            settings.rgbRotation = !!rotCb.checked;
            if (!settings.rgbRotation) {
              currentHue = settings.customHue;
              targetHue = settings.customHue;
            }
            saveSettings();
            drawColorWheelWidget();
          });
        }

        var fsBtn = document.getElementById("wmp-hud-fullscreen-btn");
        if (fsBtn) {
          fsBtn.addEventListener("click", function () {
            setFullscreenMode(!fullscreenMode);
          });
        }

        var closeBtn = hudEl.querySelector(".wmp-hud-close");
        if (closeBtn) {
          closeBtn.addEventListener("click", function () {
            setFullscreenMode(false);
            setSurfaceMode(false);
          });
        }
      }
  }

  function updateLyricsToggleUI() {
    if (!lyricsToggleBtn) return;
    if (settings.lyricsVizOn) {
      lyricsToggleBtn.classList.remove("off");
      lyricsToggleBtn.innerHTML = '<span class="viz-dot"></span><span>Visualizer: ON</span>';
    } else {
      lyricsToggleBtn.classList.add("off");
      lyricsToggleBtn.innerHTML = '<span class="viz-dot"></span><span>Visualizer: OFF</span>';
    }
  }

  function updateHudInfo() {
    if (!hudEl) return;
    var tEl = document.getElementById("wmp-hud-track-title");
    var aEl = document.getElementById("wmp-hud-track-artist");
    if (tEl) tEl.textContent = currentTrackTitle || "Spotify Velvet Red";
    if (aEl) aEl.textContent = currentTrackArtist || "";
  }

  function ensurePlayerBarButton() {
    if (surfaceBtn && surfaceBtn.isConnected) return;
    var lyricsBtn = document.querySelector('[data-testid="lyrics-button"]');
    var container = lyricsBtn ? lyricsBtn.parentElement : document.querySelector(".mwpJrmCgLlVkJVtWjlI1, .main-nowPlayingBar-extraControls");
    if (!container) return;

    surfaceBtn = document.createElement("button");
    surfaceBtn.id = "wmp-visualizer-surface-btn";
    surfaceBtn.type = "button";
    surfaceBtn.title = "Open Visualizer Studio Surface";
    surfaceBtn.setAttribute("aria-label", "Open Visualizer Studio Surface");
    surfaceBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<circle cx="8" cy="8" r="6.5" stroke-opacity="0.85"/>' +
      '<ellipse cx="8" cy="8" rx="4.2" ry="3.2" transform="rotate(-24 8 8)" stroke-opacity="0.9"/>' +
      '<circle cx="8" cy="8" r="1.6" fill="currentColor"/>' +
      "</svg>";

    surfaceBtn.addEventListener("click", function () {
      setSurfaceMode(!surfaceMode);
    });

    if (lyricsBtn && !lyricsBtn.__wmpHooked) {
      lyricsBtn.__wmpHooked = true;
      lyricsBtn.addEventListener("click", function () {
        if (surfaceMode) {
          setSurfaceMode(false);
        }
      });
    }

    if (lyricsBtn && lyricsBtn.nextSibling) {
      container.insertBefore(surfaceBtn, lyricsBtn.nextSibling);
    } else {
      container.appendChild(surfaceBtn);
    }
  }

  function setSurfaceMode(enabled) {
    surfaceMode = !!enabled;
    if (!surfaceMode && fullscreenMode) {
      setFullscreenMode(false);
      return;
    }
    if (surfaceBtn) {
      if (surfaceMode) surfaceBtn.classList.add("active");
      else surfaceBtn.classList.remove("active");
    }
    rectDirty = true;
    evaluateVisibilityAndLifecycle();
  }

  function updateFullscreenBtnUI() {
    var fsBtn = document.getElementById("wmp-hud-fullscreen-btn");
    if (!fsBtn) return;
    if (fullscreenMode) {
      fsBtn.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">' +
        '<path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4"/>' +
        "</svg>" +
        "<span>Exit Fullscreen</span>";
    } else {
      fsBtn.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">' +
        '<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/>' +
        "</svg>" +
        "<span>Fullscreen</span>";
    }
  }

  function setFullscreenMode(enabled) {
    fullscreenMode = !!enabled;
    if (fullscreenMode) {
      surfaceMode = true;
      if (surfaceBtn) surfaceBtn.classList.add("active");
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function () {});
      }
    } else {
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
    }
    updateFullscreenBtnUI();
    rectDirty = true;
    evaluateVisibilityAndLifecycle();
  }

  function updateViewportBounds() {
    if (!cachedViewportEl || !cachedViewportEl.isConnected || cachedViewportEl.clientHeight < 100) {
      cachedViewportEl =
        document.querySelector(".main-view-container") ||
        document.querySelector(".Root__main-view") ||
        document.querySelector("main");
    }
    if (cachedViewportEl) {
      var r = cachedViewportEl.getBoundingClientRect();
      if (r.width > 100 && r.height > 100 && r.left >= -10 && r.left < window.innerWidth) {
        rectLeft = Math.round(r.left);
        rectTop = Math.round(r.top);
        rectWidth = Math.round(r.width);
        rectHeight = Math.round(r.height);
      }
    }
    rectDirty = false;
  }

  function isLyricsScreenOpen() {
    var el = document.querySelector('.FUYNhisXTCmbzt9IDxnT, [data-testid="lyrics-page"], .Root__lyrics-cinema');
    if (!el || !el.isConnected) return false;
    var r = el.getBoundingClientRect();
    return r.height > 80 && r.width > 80 && r.left >= -20 && r.left < window.innerWidth - 40;
  }

  function evaluateVisibilityAndLifecycle() {
    ensurePlayerBarButton();
    var lyricsOpen = isLyricsScreenOpen();
    wasLyricsOpen = lyricsOpen;

    ensureCanvasAndHud();
    updateViewportBounds();

    var showLyricsToggle = lyricsOpen && !surfaceMode && !fullscreenMode;
    if (lyricsToggleBtn) {
      if (showLyricsToggle) {
        lyricsToggleBtn.classList.add("visible");
        lyricsToggleBtn.style.top = rectTop + 18 + "px";
        lyricsToggleBtn.style.left = rectLeft + rectWidth - 155 + "px";
      } else {
        lyricsToggleBtn.classList.remove("visible");
      }
    }

    var shouldShow = surfaceMode || fullscreenMode || (lyricsOpen && settings.lyricsVizOn);

    if (!shouldShow) {
      if (isRunning) {
        isRunning = false;
        if (rafId) {
          clearTimeout(rafId);
          rafId = 0;
        }
      }
      if (canvas) {
        canvas.style.display = "none";
        canvas.classList.remove("surface-mode", "lyrics-mode", "fullscreen-mode");
      }
      if (hudEl) {
        hudEl.classList.remove("visible");
      }
      return;
    }

    canvas.style.display = "block";
    canvas.style.left = "";
    canvas.style.top = "";
    canvas.style.width = "";
    canvas.style.height = "";

    var closeBtn = hudEl ? hudEl.querySelector(".wmp-hud-close") : null;
    var bottomHud = hudEl ? hudEl.querySelector(".wmp-hud-bottom") : null;
    var actionsGroup = hudEl ? hudEl.querySelector(".wmp-hud-actions") : null;

    if (fullscreenMode) {
      canvas.classList.remove("lyrics-mode", "surface-mode");
      canvas.classList.add("fullscreen-mode");
      if (hudEl) {
        hudEl.classList.add("visible");
        hudEl.style.left = "0px";
        hudEl.style.top = "0px";
        hudEl.style.width = "100vw";
        hudEl.style.height = "100vh";
        if (closeBtn) closeBtn.style.display = "inline-flex";
        if (bottomHud) bottomHud.style.display = "flex";
        if (actionsGroup) actionsGroup.style.marginRight = "0px";
        updateHudInfo();
      }
    } else if (surfaceMode) {
      canvas.classList.remove("lyrics-mode", "fullscreen-mode");
      canvas.classList.add("surface-mode");
      if (hudEl) {
        hudEl.classList.add("visible");
        hudEl.style.left = rectLeft + "px";
        hudEl.style.top = rectTop + "px";
        hudEl.style.width = rectWidth + "px";
        hudEl.style.height = rectHeight + "px";
        if (closeBtn) closeBtn.style.display = "inline-flex";
        if (bottomHud) bottomHud.style.display = "flex";
        if (actionsGroup) actionsGroup.style.marginRight = "0px";
        updateHudInfo();
      }
    } else {
      canvas.classList.remove("surface-mode", "fullscreen-mode");
      canvas.classList.add("lyrics-mode");
      if (hudEl) {
        hudEl.classList.add("visible");
        hudEl.style.left = rectLeft + "px";
        hudEl.style.top = rectTop + "px";
        hudEl.style.width = rectWidth + "px";
        hudEl.style.height = rectHeight + "px";
        if (closeBtn) closeBtn.style.display = "none";
        if (bottomHud) bottomHud.style.display = "none";
        if (actionsGroup) actionsGroup.style.marginRight = "146px";
      }
    }

    if (!isRunning) {
      isRunning = true;
      lastFrameTime = performance.now();
      rafId = setTimeout(renderLoop, FRAME_INTERVAL_PLAYING);
    }
  }

  function renderTunnelModel(cx, cy, tx, ty, sat, totalActivity) {
    backCtx.globalCompositeOperation = "source-over";
    backCtx.globalAlpha = 1;
    backCtx.drawImage(canvas, 0, 0);

    var zoom = isMusicPlaying ? 1.036 + smoothBass * 0.052 + beatPulse * 0.048 + barShock * 0.036 : 1.008;
    var rotStep = isMusicPlaying ? spiralDir * (0.004 + smoothMid * 0.011 + beatPulse * 0.016) : 0.0012;

    var vanishX = tx + Math.sin(lastFrameTime * 0.00055) * 18;
    var vanishY = ty + Math.cos(lastFrameTime * 0.00042) * 12;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = isMusicPlaying ? 0.945 : 0.89;
    ctx.translate(vanishX, vanishY);
    ctx.scale(zoom, zoom);
    ctx.rotate(rotStep);
    ctx.translate(-vanishX, -vanishY);
    ctx.drawImage(backCanvas, 0, 0);
    ctx.restore();

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = isMusicPlaying
      ? "rgba(2, 4, 6, " + (0.048 - Math.min(0.018, smoothBass * 0.014)).toFixed(3) + ")"
      : "rgba(2, 3, 5, 0.14)";
    ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

    var baseR = Math.min(INTERNAL_W, INTERNAL_H) * (0.24 + smoothBass * 0.065 + beatPulse * 0.05);

    var coreGrad = ctx.createRadialGradient(tx, ty, baseR * 0.08, tx, ty, baseR * 1.02);
    coreGrad.addColorStop(0, "rgba(0, 0, 0, 0.98)");
    coreGrad.addColorStop(0.62, "rgba(0, 0, 0, 0.86)");
    coreGrad.addColorStop(0.86, "rgba(0, 0, 0, 0.25)");
    coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(tx, ty, baseR * 1.02, 0, Math.PI * 2);
    ctx.fill();

    var tiltAspect = 0.86 + Math.sin(lastFrameTime * 0.0007) * 0.08;
    var tiltAngle = Math.sin(lastFrameTime * 0.00045) * 0.38;
    var cosTilt = Math.cos(tiltAngle);
    var sinTilt = Math.sin(tiltAngle);

    for (var s = 0; s < STRAND_COUNT; s++) {
      var strandFrac = s / (STRAND_COUNT - 1);
      var ringR = baseR * (0.84 + strandFrac * 0.24);
      var strandHue = (currentHue + s * 5 - 12 + 360) % 360;
      var strandPhase = tunnelPhase * (1.05 + (s % 3) * 0.32) + s * 2.094;
      var strandSign = s % 2 === 0 ? 1 : -1;
      var orbitX = tx + Math.cos(s * 1.35 + tunnelPhase * 0.35) * (4.5 + smoothBass * 7);
      var orbitY = ty + Math.sin(s * 1.35 + tunnelPhase * 0.35) * (3.5 + smoothBass * 5.5);

      for (var v = 0; v < VERTEX_COUNT; v++) {
        var hIdx1 = (v + s * 7) % 24;
        var hIdx2 = (v * 5 + s * 11) % 24;
        var harmonicVal = waveHarmonics[hIdx1] * 0.78 + waveHarmonics[hIdx2] * 0.58;

        var osc1 = Math.sin(v * (0.4188 + s * 0.052) + strandPhase * strandSign);
        var osc2 = Math.cos(v * (1.1519 - (s % 2) * 0.21) - strandPhase * 1.35);
        var osc3 = Math.sin(v * 2.513 + strandPhase * 2.15 + s * 1.7);
        var waveDisp = (osc1 * 0.48 + osc2 * 0.35 + osc3 * 0.25 + harmonicVal * 1.32) * totalActivity * baseR * (0.21 + strandFrac * 0.11);

        var r = ringR + waveDisp;
        var lx = cosTable[v] * r;
        var ly = sinTable[v] * r * tiltAspect;

        vxBuf[v] = orbitX + (lx * cosTilt - ly * sinTilt);
        vyBuf[v] = orbitY + (lx * sinTilt + ly * cosTilt);
      }
      vxBuf[VERTEX_COUNT] = vxBuf[0];
      vyBuf[VERTEX_COUNT] = vyBuf[0];

      ctx.beginPath();
      var startMidX = (vxBuf[0] + vxBuf[VERTEX_COUNT - 1]) * 0.5;
      var startMidY = (vyBuf[0] + vyBuf[VERTEX_COUNT - 1]) * 0.5;
      ctx.moveTo(startMidX, startMidY);
      for (var pIdx = 0; pIdx < VERTEX_COUNT; pIdx++) {
        var nextIdx = pIdx + 1;
        var midX = (vxBuf[pIdx] + vxBuf[nextIdx]) * 0.5;
        var midY = (vyBuf[pIdx] + vyBuf[nextIdx]) * 0.5;
        ctx.quadraticCurveTo(vxBuf[pIdx], vyBuf[pIdx], midX, midY);
      }
      ctx.closePath();

      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = "hsla(" + strandHue.toFixed(0) + ", " + sat + "%, 44%, " + (0.28 + Math.min(0.32, totalActivity * 0.22)).toFixed(2) + ")";
      ctx.lineWidth = 2.6 - strandFrac * 0.5;
      ctx.stroke();

      ctx.strokeStyle = "hsla(" + strandHue.toFixed(0) + ", " + sat + "%, " + (78 + Math.min(18, beatPulse * 16)).toFixed(0) + "%, " + (0.84 - strandFrac * 0.1).toFixed(2) + ")";
      ctx.lineWidth = 1.15;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function renderSpiralVortexModel(cx, cy, tx, ty, sat, totalActivity) {
    backCtx.globalCompositeOperation = "source-over";
    backCtx.globalAlpha = 1;
    backCtx.drawImage(canvas, 0, 0);

    var zoom = isMusicPlaying ? 1.028 + smoothBass * 0.045 + beatPulse * 0.04 : 1.005;
    var rot = isMusicPlaying ? spiralDir * (0.014 + smoothBass * 0.025) : 0.003;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.9;
    ctx.translate(tx, ty);
    ctx.scale(zoom, zoom);
    ctx.rotate(rot);
    ctx.translate(-tx, -ty);
    ctx.drawImage(backCanvas, 0, 0);
    ctx.restore();

    ctx.fillStyle = "rgba(2, 3, 6, 0.12)";
    ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

    var maxR = Math.max(INTERNAL_W, INTERNAL_H) * 0.62;
    var arms = 3;
    var pointsPerArm = 110;
    ctx.globalCompositeOperation = "lighter";

    for (var a = 0; a < arms; a++) {
      var armOffset = (a * Math.PI * 2) / arms + spiralAngle * 1.8;
      var armHue = (currentHue + a * 28) % 360;

      ctx.beginPath();
      for (var i = 0; i < pointsPerArm; i++) {
        var frac = i / (pointsPerArm - 1);
        var baseRadius = 10 + Math.pow(frac, 1.35) * maxR;
        var theta = armOffset + frac * Math.PI * 5.5 - tunnelPhase * 0.55;
        var hVal = waveHarmonics[(i + a * 7) % 24];
        var wave = (Math.sin(i * 0.65 - tunnelPhase * 1.8) * 0.6 + hVal * 1.4) * totalActivity * (8 + frac * 42);
        var r = Math.max(4, baseRadius + wave);
        var px = tx + Math.cos(theta) * r;
        var py = ty + Math.sin(theta) * r * 0.88;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = "hsla(" + armHue.toFixed(0) + ", " + sat + "%, 48%, 0.42)";
      ctx.lineWidth = 3.2;
      ctx.stroke();

      ctx.strokeStyle = "hsla(" + armHue.toFixed(0) + ", " + sat + "%, 84%, 0.9)";
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function renderStarburstModel(cx, cy, tx, ty, sat, totalActivity) {
    backCtx.globalCompositeOperation = "source-over";
    backCtx.globalAlpha = 1;
    backCtx.drawImage(canvas, 0, 0);

    var zoom = isMusicPlaying ? 1.045 + smoothBass * 0.06 + beatPulse * 0.05 : 1.008;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.92;
    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.rotate(spiralDir * 0.004);
    ctx.translate(-cx, -cy);
    ctx.drawImage(backCanvas, 0, 0);
    ctx.restore();

    ctx.fillStyle = "rgba(2, 2, 5, 0.11)";
    ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

    ctx.globalCompositeOperation = "lighter";
    var rays = 72;
    var innerR = 14 + smoothBass * 16;
    for (var i = 0; i < rays; i++) {
      var angle = (i / rays) * Math.PI * 2 + spiralAngle * 0.5;
      var edgeAlign = Math.max(0, Math.cos(angle - edgeAngle));
      var palpBoost = Math.pow(edgeAlign, 3) * (beatPulse * 1.4 + barShock * 1.2);
      var hVal = Math.abs(waveHarmonics[i % 24]);
      var len = (35 + (hVal * 95 + smoothBass * 65 + palpBoost * 110) * totalActivity);
      var rayHue = (currentHue + edgeAlign * 38 + (i % 5) * 4) % 360;

      var x1 = cx + Math.cos(angle) * innerR;
      var y1 = cy + Math.sin(angle) * innerR;
      var x2 = cx + Math.cos(angle) * (innerR + len);
      var y2 = cy + Math.sin(angle) * (innerR + len);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = "hsla(" + rayHue.toFixed(0) + ", " + sat + "%, " + (68 + Math.min(24, palpBoost * 25)).toFixed(0) + "%, 0.78)";
      ctx.lineWidth = 1.4 + palpBoost * 1.5;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function renderScopeAndBarsModel(cx, cy, sat, totalActivity) {
    ctx.fillStyle = "rgba(3, 4, 8, 0.34)";
    ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

    var nBars = 48;
    var padX = 36;
    var usableW = INTERNAL_W - padX * 2;
    var slotW = usableW / nBars;
    var barW = Math.max(3, slotW - 3);
    var baselineY = INTERNAL_H - 30;
    var maxBarH = INTERNAL_H * 0.48;

    for (var b = 0; b < nBars; b++) {
      var hIdx = b % 24;
      var freqFrac = b / (nBars - 1);
      var bassWeight = Math.max(0, 1 - freqFrac * 1.55);
      var midWeight = Math.max(0, 1 - Math.abs(freqFrac - 0.48) * 2.4);
      var highWeight = Math.max(0, (freqFrac - 0.35) * 1.55);

      var oscA = Math.abs(Math.sin(b * 0.62 - tunnelPhase * 1.85 + Math.cos(b * 0.27 + tunnelPhase * 0.9)));
      var oscB = Math.abs(Math.cos(b * 1.18 + tunnelPhase * 2.45));
      var harm = Math.abs(waveHarmonics[hIdx]) * 1.65;

      var bandEnergy =
        bassWeight * (smoothBass * 0.62 + beatPulse * 0.58) +
        midWeight * (smoothMid * 0.48 + harm * 0.42) +
        highWeight * (smoothHigh * 0.52 + harm * 0.38);

      var dynamicMod = Math.pow(oscA * 0.58 + oscB * 0.42, 1.8) + harm * 0.35;
      var raw = bandEnergy * dynamicMod + beatPulse * bassWeight * 0.28 * oscA;
      var targetH = isMusicPlaying ? Math.min(maxBarH, Math.max(4, raw * maxBarH * 0.88)) : 3;

      if (targetH > barValues[b]) {
        barValues[b] = barValues[b] * 0.32 + targetH * 0.68;
      } else {
        barValues[b] = Math.max(3, barValues[b] * 0.68 + targetH * 0.32);
      }

      if (barValues[b] >= barPeaks[b]) {
        barPeaks[b] = barValues[b];
      } else {
        barPeaks[b] = Math.max(3, barPeaks[b] - 2.1);
      }

      var bx = padX + b * slotW;
      var bh = Math.max(2, barValues[b]);
      var bHue = (currentHue + freqFrac * 52) % 360;

      var grad = ctx.createLinearGradient(0, baselineY - bh, 0, baselineY);
      grad.addColorStop(0, "hsla(" + bHue.toFixed(0) + ", " + sat + "%, 74%, 0.96)");
      grad.addColorStop(0.55, "hsla(" + bHue.toFixed(0) + ", " + sat + "%, 52%, 0.88)");
      grad.addColorStop(1, "hsla(" + bHue.toFixed(0) + ", " + sat + "%, 28%, 0.75)");
      ctx.fillStyle = grad;
      ctx.fillRect(bx, baselineY - bh, barW, bh);

      ctx.fillStyle = "hsla(" + bHue.toFixed(0) + ", " + sat + "%, 90%, 0.98)";
      ctx.fillRect(bx, baselineY - barPeaks[b] - 3.5, barW, 2.2);
    }

    ctx.globalCompositeOperation = "lighter";
    var waveY = INTERNAL_H * 0.28;
    for (var ch = 0; ch < 2; ch++) {
      var chHue = (currentHue + ch * 26) % 360;
      ctx.beginPath();
      for (var i = 0; i <= VERTEX_COUNT; i++) {
        var x = (i / VERTEX_COUNT) * INTERNAL_W;
        var hVal = waveHarmonics[(i + ch * 7) % 24];
        var env = Math.sin((i / VERTEX_COUNT) * Math.PI);
        var dy =
          (Math.sin(i * 0.38 + tunnelPhase * (ch === 0 ? 1.55 : -1.35)) * 0.58 +
            Math.cos(i * 1.15 - tunnelPhase * 2.25) * 0.38 +
            hVal * 1.45) *
          totalActivity *
          env *
          72;
        var y = waveY + dy;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "hsla(" + chHue.toFixed(0) + ", " + sat + "%, 50%, 0.45)";
      ctx.lineWidth = 3.2;
      ctx.stroke();

      ctx.strokeStyle = "hsla(" + chHue.toFixed(0) + ", " + sat + "%, 86%, 0.92)";
      ctx.lineWidth = 1.25;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  function renderCyberOrbModel(cx, cy, sat, totalActivity) {
    ctx.fillStyle = "rgba(3, 3, 8, 0.28)";
    ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

    var horizonY = INTERNAL_H * 0.58;
    gridOffset = (gridOffset + (isMusicPlaying ? 0.035 + smoothBass * 0.08 : 0.005)) % 1;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = "hsla(" + currentHue.toFixed(0) + ", " + sat + "%, 48%, 0.38)";
    ctx.lineWidth = 1;

    for (var gx = -10; gx <= 10; gx++) {
      ctx.beginPath();
      ctx.moveTo(cx + gx * 12, horizonY);
      ctx.lineTo(cx + gx * 95, INTERNAL_H);
      ctx.stroke();
    }

    for (var gz = 0; gz < 10; gz++) {
      var zFrac = (gz + gridOffset) / 10;
      var py = horizonY + Math.pow(zFrac, 1.8) * (INTERNAL_H - horizonY);
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(INTERNAL_W, py);
      ctx.stroke();
    }

    var orbY = horizonY - 46 - smoothBass * 14;
    var orbR = 44 + smoothBass * 22 + beatPulse * 18;
    for (var ring = 0; ring < 4; ring++) {
      var rHue = (currentHue + ring * 15) % 360;
      ctx.beginPath();
      for (var v = 0; v <= VERTEX_COUNT; v++) {
        var idx = v % VERTEX_COUNT;
        var hVal = waveHarmonics[(idx + ring * 5) % 24];
        var spike = (Math.sin(idx * 0.52 + tunnelPhase * 1.5 + ring) * 0.5 + hVal * 1.35) * totalActivity * 26;
        var rr = orbR * (0.72 + ring * 0.12) + spike;
        var px = cx + cosTable[idx] * rr;
        var py2 = orbY + sinTable[idx] * rr;
        if (v === 0) ctx.moveTo(px, py2);
        else ctx.lineTo(px, py2);
      }
      ctx.strokeStyle = "hsla(" + rHue.toFixed(0) + ", " + sat + "%, 78%, " + (0.85 - ring * 0.14).toFixed(2) + ")";
      ctx.lineWidth = 1.4 - ring * 0.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderLoop() {
    if (!isRunning) return;
    var nowMs = performance.now();
    var dt = Math.min(0.1, Math.max(0.01, (nowMs - (lastFrameTime || nowMs)) * 0.001));
    lastFrameTime = nowMs;

    var nextDelay = isMusicPlaying ? FRAME_INTERVAL_PLAYING : FRAME_INTERVAL_PAUSED;
    rafId = setTimeout(renderLoop, nextDelay);

    if (rectDirty) {
      updateViewportBounds();
      if (hudEl && surfaceMode && !fullscreenMode) {
        hudEl.style.left = rectLeft + "px";
        hudEl.style.top = rectTop + "px";
        hudEl.style.width = rectWidth + "px";
        hudEl.style.height = rectHeight + "px";
      }
    }

    updateAudioTelemetry(nowMs);

    if (settings.rgbRotation) {
      var hueDiff = targetHue - currentHue;
      if (hueDiff > 180) hueDiff -= 360;
      if (hueDiff < -180) hueDiff += 360;
      currentHue = (currentHue + hueDiff * 0.045 + (isMusicPlaying ? dt * 14 : dt * 2) + 360) % 360;
      if (surfaceMode && Math.random() < 0.15) drawColorWheelWidget();
    } else {
      currentHue = settings.customHue;
    }

    var sat = settings.rgbRotation ? 94 : settings.customSat;
    var cx = INTERNAL_W * 0.5;
    var cy = INTERNAL_H * 0.5;

    throatOffsetX *= 0.9;
    throatOffsetY *= 0.9;
    var swayX = isMusicPlaying ? Math.sin(nowMs * 0.0011) * (10 + smoothBass * 16) + throatOffsetX : 0;
    var swayY = isMusicPlaying ? Math.cos(nowMs * 0.00085) * (7 + smoothBass * 12) + throatOffsetY : 0;
    var tx = cx + swayX;
    var ty = cy + swayY;

    var rotStep = isMusicPlaying ? spiralDir * (0.004 + smoothMid * 0.011 + beatPulse * 0.016) : 0.0012;
    spiralAngle += rotStep;
    tunnelPhase += isMusicPlaying ? dt * (4.2 + smoothBass * 10.5 + beatPulse * 9) : dt * 0.35;

    var totalActivity = isMusicPlaying ? smoothBass * 0.88 + beatPulse * 0.98 + smoothHigh * 0.48 : 0.018;

    if (settings.model === "spiral") {
      renderSpiralVortexModel(cx, cy, tx, ty, sat, totalActivity);
    } else if (settings.model === "starburst") {
      renderStarburstModel(cx, cy, tx, ty, sat, totalActivity);
    } else if (settings.model === "scope") {
      renderScopeAndBarsModel(cx, cy, sat, totalActivity);
    } else if (settings.model === "cyber") {
      renderCyberOrbModel(cx, cy, sat, totalActivity);
    } else {
      renderTunnelModel(cx, cy, tx, ty, sat, totalActivity);
    }
  }

  window.addEventListener(
    "resize",
    function () {
      rectDirty = true;
    },
    { passive: true }
  );

  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && fullscreenMode) {
      setFullscreenMode(false);
    } else if (e.key === "F11" && surfaceMode) {
      e.preventDefault();
      setFullscreenMode(!fullscreenMode);
    }
  });

  document.addEventListener("fullscreenchange", function () {
    if (!document.fullscreenElement && fullscreenMode) {
      fullscreenMode = false;
      updateFullscreenBtnUI();
      rectDirty = true;
      evaluateVisibilityAndLifecycle();
    }
  });

  setInterval(evaluateVisibilityAndLifecycle, 400);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", evaluateVisibilityAndLifecycle);
  } else {
    evaluateVisibilityAndLifecycle();
  }
})();
