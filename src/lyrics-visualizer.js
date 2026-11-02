(function () {
  if (window.__wmpTunnelVisualizerLoaded) return;
  window.__wmpTunnelVisualizerLoaded = true;

  var INTERNAL_W = 420;
  var INTERNAL_H = 260;
  var VERTEX_COUNT = 108;
  var STRAND_COUNT = 4;
  var FRAME_INTERVAL_PLAYING = 33;
  var FRAME_INTERVAL_PAUSED = 120;

  var WMP_PALETTES = [118, 168, 198, 232, 285, 348, 36, 86];
  var paletteIdx = 0;
  var currentHue = 118;
  var targetHue = 118;

  var canvas = null;
  var ctx = null;
  var backCanvas = null;
  var backCtx = null;
  var hudEl = null;
  var surfaceBtn = null;

  var surfaceMode = false;
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

  function updateAudioTelemetry(nowMs) {
    connectSpotifyInternalAPIs();

    var posSec = 0;
    if (spPlayerAPI && spPlayerAPI.getState) {
      var st = spPlayerAPI.getState();
      if (st) {
        isMusicPlaying = !st.isPaused;
        var basePos = Number(st.positionAsOfTimestamp) || 0;
        var ts = Number(st.timestamp) || nowMs;
        posSec = (isMusicPlaying ? basePos + Math.max(0, nowMs - ts) : basePos) / 1000;

        var item = st.item;
        if (item && item.uri) {
          var parts = item.uri.split(":");
          var tid = parts.length > 2 ? parts[2] : "";
          if (tid && tid !== currentTrackId) {
            currentTrackId = tid;
            currentTrackTitle = item.name || (item.metadata && item.metadata.title) || "";
            currentTrackArtist = (item.metadata && item.metadata.artist_name) || "";
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
    }

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
        barShock = Math.max(barShock, 0.72);
        paletteIdx = (paletteIdx + 1) % WMP_PALETTES.length;
        targetHue = WMP_PALETTES[paletteIdx];
      }
    }

    if (trackAnalysis && trackAnalysis.nSeg > 0) {
      var ta = trackAnalysis;
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

      var loudNorm = Math.max(0, Math.min(1, (db + 36) / 34));
      var loudDrop = Math.max(0, (ta.segLoudMax[sIdx] - ta.segLoudStart[sIdx]) / 18);
      var rawBass = Math.max(0, Math.min(1.3, loudNorm * (0.75 + 0.55 * Math.max(0, ta.segBass[sIdx])) + loudDrop * 0.25));
      var rawHigh = Math.max(0, Math.min(1.2, loudNorm * (0.65 + 0.5 * Math.abs(ta.segSharp[sIdx]))));

      if (ta.nBeat > 0) {
        var bIdx = binarySearchTime(ta.beatStart, ta.nBeat, posSec);
        var bElapsed = Math.max(0, posSec - ta.beatStart[bIdx]);
        var bConf = ta.beatConf[bIdx];
        if (bIdx !== lastBeatIdx && bElapsed < 0.09) {
          lastBeatIdx = bIdx;
          beatPulse = Math.max(beatPulse, (0.45 + 0.55 * bConf) * loudNorm);
          if (rawBass > 0.68 && bConf > 0.55) {
            throatOffsetX = (Math.random() - 0.5) * 26 * rawBass;
            throatOffsetY = (Math.random() - 0.5) * 18 * rawBass;
          }
        }
      }

      if (ta.nBar > 0) {
        var rIdx = binarySearchTime(ta.barStart, ta.nBar, posSec);
        if (rIdx !== lastBarIdx && Math.abs(posSec - ta.barStart[rIdx]) < 0.12) {
          lastBarIdx = rIdx;
          barShock = Math.max(barShock, 0.85 * loudNorm);
          paletteIdx = (paletteIdx + 1) % WMP_PALETTES.length;
          targetHue = WMP_PALETTES[paletteIdx];
          if (Math.random() < 0.45) spiralDir = -spiralDir;
        }
      }

      smoothBass = smoothBass * 0.65 + rawBass * 0.35;
      smoothMid = smoothMid * 0.72 + loudNorm * 0.28;
      smoothHigh = smoothHigh * 0.68 + rawHigh * 0.32;
      beatPulse *= 0.84;
      barShock *= 0.88;

      var pBase = sIdx * 12;
      for (var p = 0; p < 12; p++) {
        var pv = ta.segPitches[pBase + p];
        targetHarmonics[p] = (pv - 0.35) * (0.5 + smoothBass * 1.1 + beatPulse * 0.8);
        targetHarmonics[p + 12] = (ta.segPitches[pBase + ((p + 5) % 12)] - 0.35) * (0.4 + smoothHigh * 1.1);
      }
      for (var h = 0; h < 24; h++) {
        waveHarmonics[h] = waveHarmonics[h] * 0.62 + targetHarmonics[h] * 0.38;
      }
    } else {
      var t = nowMs * 0.001;
      var gate = Math.max(0, Math.sin(t * 2.1) * Math.cos(t * 0.73 + 0.9));
      var kick = Math.pow(Math.max(0, Math.sin(t * 6.4 + Math.sin(t * 1.3))), 6) * gate;
      if (kick > 0.55 && beatPulse < 0.3) {
        beatPulse = kick;
        if (Math.random() < 0.25) {
          paletteIdx = (paletteIdx + 1) % WMP_PALETTES.length;
          targetHue = WMP_PALETTES[paletteIdx];
        }
      }
      smoothBass = smoothBass * 0.75 + (gate * 0.45 + kick * 0.65) * 0.25;
      smoothMid = smoothMid * 0.8 + gate * 0.5 * 0.2;
      smoothHigh = smoothHigh * 0.75 + Math.abs(Math.sin(t * 4.7)) * gate * 0.25;
      beatPulse *= 0.85;
      barShock *= 0.88;
      for (var j = 0; j < 24; j++) {
        var v = Math.sin(t * (3.1 + j * 0.67) + j * 1.9) * (smoothBass * 0.6 + beatPulse * 0.5);
        waveHarmonics[j] = waveHarmonics[j] * 0.65 + v * 0.35;
      }
    }
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

      ctx.fillStyle = "#020401";
      ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
      backCtx.fillStyle = "#020401";
      backCtx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);
    }
    if (!canvas.isConnected && document.body) {
      document.body.appendChild(canvas);
    }

    if (!hudEl && document.body) {
      hudEl = document.createElement("div");
      hudEl.id = "wmp-visualizer-surface-hud";
      hudEl.style.display = "none";
      hudEl.innerHTML =
        '<div class="wmp-hud-top">' +
        '<span class="wmp-hud-badge">Windows XP Media Player \u2022 Tunnel Waveform</span>' +
        '<button class="wmp-hud-close" type="button">Exit Surface</button>' +
        "</div>" +
        '<div class="wmp-hud-bottom">' +
        '<div class="wmp-hud-title" id="wmp-hud-track-title">Spotify Velvet Red</div>' +
        '<div class="wmp-hud-artist" id="wmp-hud-track-artist">Playing Audio Stream</div>' +
        "</div>";
      document.body.appendChild(hudEl);
      var closeBtn = hudEl.querySelector(".wmp-hud-close");
      if (closeBtn) {
        closeBtn.addEventListener("click", function () {
          setSurfaceMode(false);
        });
      }
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
    surfaceBtn.title = "Toggle WMP Tunnel Visualizer Surface";
    surfaceBtn.setAttribute("aria-label", "Toggle WMP Tunnel Visualizer Surface");
    surfaceBtn.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">' +
      '<circle cx="8" cy="8" r="6.5" stroke-opacity="0.85"/>' +
      '<ellipse cx="8" cy="8" rx="4.2" ry="3.2" transform="rotate(-24 8 8)" stroke-opacity="0.9"/>' +
      '<circle cx="8" cy="8" r="1.6" fill="currentColor"/>' +
      "</svg>";

    surfaceBtn.addEventListener("click", function () {
      setSurfaceMode(!surfaceMode);
    });

    if (lyricsBtn && lyricsBtn.nextSibling) {
      container.insertBefore(surfaceBtn, lyricsBtn.nextSibling);
    } else {
      container.appendChild(surfaceBtn);
    }
  }

  function setSurfaceMode(enabled) {
    surfaceMode = !!enabled;
    if (surfaceBtn) {
      if (surfaceMode) surfaceBtn.classList.add("active");
      else surfaceBtn.classList.remove("active");
    }
    rectDirty = true;
    evaluateVisibilityAndLifecycle();
  }

  function updateViewportBounds() {
    if (
      !cachedViewportEl ||
      !cachedViewportEl.isConnected ||
      cachedViewportEl.clientHeight < 100
    ) {
      cachedViewportEl =
        document.querySelector(".main-view-container") ||
        document.querySelector(".Root__main-view") ||
        document.querySelector("main");
    }
    if (cachedViewportEl) {
      var r = cachedViewportEl.getBoundingClientRect();
      if (r.width > 100 && r.height > 100) {
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
    return el.clientHeight > 80 && el.clientWidth > 80;
  }

  function evaluateVisibilityAndLifecycle() {
    ensurePlayerBarButton();
    var lyricsOpen = isLyricsScreenOpen();
    var shouldShow = lyricsOpen || surfaceMode;

    if (!shouldShow) {
      if (isRunning) {
        isRunning = false;
        if (rafId) {
          clearTimeout(rafId);
          rafId = 0;
        }
      }
      if (canvas) canvas.style.display = "none";
      if (hudEl) hudEl.style.display = "none";
      return;
    }

    ensureCanvasAndHud();
    updateViewportBounds();

    canvas.style.display = "block";
    canvas.style.left = rectLeft + "px";
    canvas.style.top = rectTop + "px";
    canvas.style.width = rectWidth + "px";
    canvas.style.height = rectHeight + "px";

    if (surfaceMode && !lyricsOpen) {
      canvas.classList.add("surface-mode");
      if (hudEl) {
        hudEl.style.display = "flex";
        hudEl.style.left = rectLeft + "px";
        hudEl.style.top = rectTop + "px";
        hudEl.style.width = rectWidth + "px";
        hudEl.style.height = rectHeight + "px";
        updateHudInfo();
      }
    } else {
      canvas.classList.remove("surface-mode");
      if (hudEl) hudEl.style.display = "none";
    }

    if (!isRunning) {
      isRunning = true;
      lastFrameTime = performance.now();
      rafId = setTimeout(renderLoop, FRAME_INTERVAL_PLAYING);
    }
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
      canvas.style.left = rectLeft + "px";
      canvas.style.top = rectTop + "px";
      canvas.style.width = rectWidth + "px";
      canvas.style.height = rectHeight + "px";
    }

    updateAudioTelemetry(nowMs);

    var hueDiff = targetHue - currentHue;
    if (hueDiff > 180) hueDiff -= 360;
    if (hueDiff < -180) hueDiff += 360;
    currentHue = (currentHue + hueDiff * 0.045 + (isMusicPlaying ? dt * 4.5 : 0) + 360) % 360;

    var cx = INTERNAL_W * 0.5;
    var cy = INTERNAL_H * 0.5;

    throatOffsetX *= 0.9;
    throatOffsetY *= 0.9;
    var swayX = isMusicPlaying ? Math.sin(nowMs * 0.0011) * (8 + smoothBass * 14) + throatOffsetX : 0;
    var swayY = isMusicPlaying ? Math.cos(nowMs * 0.00085) * (6 + smoothBass * 11) + throatOffsetY : 0;
    var tx = cx + swayX;
    var ty = cy + swayY;

    backCtx.globalCompositeOperation = "source-over";
    backCtx.globalAlpha = 1;
    backCtx.drawImage(canvas, 0, 0);

    var zoom = isMusicPlaying ? 1.046 + smoothBass * 0.055 + beatPulse * 0.05 + barShock * 0.04 : 1.008;
    var rotStep = isMusicPlaying ? spiralDir * (0.0035 + smoothMid * 0.009 + beatPulse * 0.012) : 0.001;
    spiralAngle += rotStep;
    tunnelPhase += isMusicPlaying ? dt * (3.8 + smoothBass * 9.5 + beatPulse * 8) : dt * 0.35;

    var vanishX = tx - swayX * 0.35;
    var vanishY = ty - swayY * 0.35;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = isMusicPlaying ? 0.94 : 0.89;
    ctx.translate(vanishX, vanishY);
    ctx.scale(zoom, zoom);
    ctx.rotate(rotStep);
    ctx.translate(-vanishX, -vanishY);
    ctx.drawImage(backCanvas, 0, 0);
    ctx.restore();

    if (isMusicPlaying) {
      var streakZoom = zoom + 0.042 + smoothBass * 0.035;
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.44;
      ctx.translate(vanishX, vanishY);
      ctx.scale(streakZoom, streakZoom);
      ctx.rotate(rotStep * 0.5);
      ctx.translate(-vanishX, -vanishY);
      ctx.drawImage(backCanvas, 0, 0);
      ctx.restore();
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = isMusicPlaying
      ? "rgba(1, 5, 1, " + (0.042 - Math.min(0.015, smoothBass * 0.012)).toFixed(3) + ")"
      : "rgba(1, 3, 1, 0.14)";
    ctx.fillRect(0, 0, INTERNAL_W, INTERNAL_H);

    var baseR = Math.min(INTERNAL_W, INTERNAL_H) * (0.26 + smoothBass * 0.06 + beatPulse * 0.045);

    var coreGrad = ctx.createRadialGradient(tx, ty, baseR * 0.08, tx, ty, baseR * 1.04);
    coreGrad.addColorStop(0, "rgba(0, 0, 0, 0.97)");
    coreGrad.addColorStop(0.58, "rgba(0, 0, 0, 0.82)");
    coreGrad.addColorStop(0.85, "rgba(0, 0, 0, 0.28)");
    coreGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(tx, ty, baseR * 1.04, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(tx, ty);
    ctx.rotate(spiralAngle * 0.25 - 0.58);
    var slashGrad = ctx.createLinearGradient(0, -baseR * 0.35, 0, baseR * 0.35);
    slashGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    slashGrad.addColorStop(0.5, "rgba(0, 0, 0, 0.55)");
    slashGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = slashGrad;
    ctx.fillRect(-baseR * 0.2, -baseR * 0.35, baseR * 2.5, baseR * 0.7);
    ctx.restore();

    var totalActivity = isMusicPlaying ? Math.min(1.15, smoothBass * 0.62 + beatPulse * 0.72 + smoothHigh * 0.32) : 0.02;
    var tiltAspect = 0.85 + Math.sin(nowMs * 0.0006) * 0.08;
    var tiltAngle = Math.sin(nowMs * 0.0004) * 0.38;
    var cosTilt = Math.cos(tiltAngle);
    var sinTilt = Math.sin(tiltAngle);

    for (var s = 0; s < STRAND_COUNT; s++) {
      var strandFrac = s / (STRAND_COUNT - 1);
      var ringR = baseR * (0.82 + strandFrac * 0.28);
      var strandHue = (currentHue + s * 5 - 8 + 360) % 360;
      var strandPhase = tunnelPhase * (0.9 + (s % 2) * 0.35) + s * 1.85;
      var strandSign = s % 2 === 0 ? 1 : -1;
      var orbitX = tx + Math.cos(s * 1.57 + tunnelPhase * 0.3) * (5 + smoothBass * 6);
      var orbitY = ty + Math.sin(s * 1.57 + tunnelPhase * 0.3) * (4 + smoothBass * 5);

      for (var v = 0; v < VERTEX_COUNT; v++) {
        var hIdx1 = (v + s * 5) % 24;
        var hIdx2 = (v * 3 + s * 9) % 24;
        var harmonicVal = waveHarmonics[hIdx1] * 0.65 + waveHarmonics[hIdx2] * 0.45;

        var osc1 = Math.sin(v * (0.349 + s * 0.058) + strandPhase * strandSign);
        var osc2 = Math.cos(v * (0.989 - (s % 2) * 0.17) - strandPhase * 1.2);
        var osc3 = Math.sin(v * 2.094 + strandPhase * 1.8 + s * 1.4);
        var waveDisp = (osc1 * 0.46 + osc2 * 0.32 + osc3 * 0.22 + harmonicVal * 0.95) * totalActivity * baseR * (0.12 + strandFrac * 0.06);

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

      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "hsla(" + strandHue.toFixed(0) + ", 72%, 36%, " + (0.52 - strandFrac * 0.1).toFixed(2) + ")";
      ctx.lineWidth = 2.4 - strandFrac * 0.4;
      ctx.stroke();

      ctx.strokeStyle = "hsla(" + strandHue.toFixed(0) + ", 82%, " + (74 + Math.min(16, beatPulse * 14)).toFixed(0) + "%, " + (0.88 - strandFrac * 0.12).toFixed(2) + ")";
      ctx.lineWidth = 0.95;
      ctx.stroke();
    }
  }

  window.addEventListener(
    "resize",
    function () {
      rectDirty = true;
    },
    { passive: true }
  );

  document.addEventListener("visibilitychange", function () {
    evaluateVisibilityAndLifecycle();
  });

  setInterval(evaluateVisibilityAndLifecycle, 450);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", evaluateVisibilityAndLifecycle);
  } else {
    evaluateVisibilityAndLifecycle();
  }
})();
