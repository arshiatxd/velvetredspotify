(function() {
  'use strict';

  var canvas = null;
  var ctx = null;
  var fbCanvas = null;
  var fbCtx = null;
  var animId = null;
  var width = 0;
  var height = 0;
  var dpr = 1;
  var phase = 0;
  var spinAngle = 0;
  var viewportEl = null;
  var resizeObserver = null;
  var rectDirty = true;
  var cachedRect = { top: 0, left: 0, width: 0, height: 0 };

  var smoothBass = 0.08;
  var smoothMid = 0.06;
  var smoothHigh = 0.05;
  var beatPulse = 0.0;
  var prevSignal = 0.0;
  var lastBeatTime = 0;
  var lastActiveLyricText = '';
  var lastLyricCheckTime = 0;
  var vortexRings = [];

  var currentHue = 348;
  var targetHue = 348;
  var wmcPalettes = [348, 322, 285, 215, 185, 142, 38, 14];
  var paletteIndex = 0;

  var palpitations = [];
  var lastPalpitationTime = 0;

  var NUM_BANDS = 48;
  var bandValues = new Float32Array(NUM_BANDS);
  var peakValues = new Float32Array(NUM_BANDS);

  var sparks = [];
  var SPARK_COUNT = 52;

  function initSparks() {
    sparks = [];
    for (var i = 0; i < SPARK_COUNT; i++) {
      sparks.push(createSpark(true));
    }
  }

  function createSpark(randomDist) {
    var maxR = Math.max(width || 800, height || 600) * 0.72;
    return {
      angle: Math.random() * Math.PI * 2,
      dist: randomDist ? (Math.random() * maxR) : (6 + Math.random() * 20),
      speed: 2.5 + Math.random() * 5.0,
      length: 16 + Math.random() * 42,
      thickness: 1.0 + Math.random() * 2.2,
      alpha: 0.4 + Math.random() * 0.6,
      hueOffset: (Math.random() - 0.5) * 60
    };
  }

  function spawnEdgePalpitation(intensity, forcedAngle) {
    var angle = (typeof forcedAngle === 'number') ? forcedAngle : (Math.random() * Math.PI * 2);
    paletteIndex = (paletteIndex + 1 + Math.floor(Math.random() * (wmcPalettes.length - 2))) % wmcPalettes.length;
    targetHue = wmcPalettes[paletteIndex] + (Math.random() - 0.5) * 18;

    if (palpitations.length > 8) palpitations.shift();
    palpitations.push({
      angle: angle,
      speed: (Math.random() - 0.5) * 0.035,
      power: Math.min(1.4, 0.7 + intensity * 0.8),
      decay: 0.935,
      arc: 0.7 + Math.random() * 0.6,
      hue: targetHue
    });

    if (Math.random() > 0.45 && intensity > 0.6) {
      var secAngle = (angle + Math.PI * (0.6 + Math.random() * 0.8)) % (Math.PI * 2);
      var secHue = (targetHue + 60 + Math.random() * 40) % 360;
      palpitations.push({
        angle: secAngle,
        speed: (Math.random() - 0.5) * 0.035,
        power: Math.min(1.2, 0.5 + intensity * 0.6),
        decay: 0.94,
        arc: 0.6 + Math.random() * 0.5,
        hue: secHue
      });
    }

    for (var s = 0; s < 4; s++) {
      var sparkAngle = angle + (Math.random() - 0.5) * 0.8;
      sparks.push({
        angle: sparkAngle,
        dist: 12 + Math.random() * 30,
        speed: 5.5 + Math.random() * 6.5,
        length: 30 + Math.random() * 50,
        thickness: 1.6 + Math.random() * 2.0,
        alpha: 0.85,
        hueOffset: (Math.random() - 0.5) * 30
      });
      if (sparks.length > SPARK_COUNT + 12) sparks.shift();
    }
  }

  function shortestHueDelta(fromH, toH) {
    return ((toH - fromH + 540) % 360) - 180;
  }

  function hslColor(h, s, l, a) {
    var wrapH = ((h % 360) + 360) % 360;
    return 'hsla(' + Math.round(wrapH) + ',' + Math.round(s) + '%,' + Math.round(l) + '%,' + a.toFixed(3) + ')';
  }

  function ensureAncestorsTransparent(lyricsEl, panelEl) {
    var node = lyricsEl;
    var guard = 0;
    while (node && node !== document.body && guard++ < 15) {
      if (node.style) {
        if (node.style.backgroundColor !== 'transparent') {
          node.style.setProperty('background-color', 'transparent', 'important');
        }
        if (node.style.backgroundImage !== 'none') {
          node.style.setProperty('background-image', 'none', 'important');
        }
      }
      if (node === panelEl) break;
      node = node.parentElement;
    }
  }

  function markRectDirty() {
    rectDirty = true;
  }

  function syncViewportRect() {
    if (!canvas || !viewportEl) return false;
    if (rectDirty || width === 0 || height === 0) {
      var rect = viewportEl.getBoundingClientRect();
      if (rect.width < 50 || rect.height < 50) return false;
      cachedRect.top = Math.round(rect.top);
      cachedRect.left = Math.round(rect.left);
      cachedRect.width = Math.round(rect.width);
      cachedRect.height = Math.round(rect.height);
      rectDirty = false;

      canvas.style.setProperty('position', 'fixed', 'important');
      canvas.style.setProperty('top', cachedRect.top + 'px', 'important');
      canvas.style.setProperty('left', cachedRect.left + 'px', 'important');
      canvas.style.setProperty('width', cachedRect.width + 'px', 'important');
      canvas.style.setProperty('height', cachedRect.height + 'px', 'important');

      var nextDpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (cachedRect.width !== width || cachedRect.height !== height || nextDpr !== dpr) {
        width = cachedRect.width;
        height = cachedRect.height;
        dpr = nextDpr;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        if (!fbCanvas) {
          fbCanvas = document.createElement('canvas');
          fbCtx = fbCanvas.getContext('2d', { alpha: false });
        }
        fbCanvas.width = Math.round(width * dpr);
        fbCanvas.height = Math.round(height * dpr);
        fbCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = '#070103';
        ctx.fillRect(0, 0, width, height);
        fbCtx.fillStyle = '#070103';
        fbCtx.fillRect(0, 0, width, height);
      }
    }
    return width >= 50 && height >= 50;
  }

  function ensureCanvas(panelEl, lyricsEl) {
    if (viewportEl !== panelEl) {
      if (resizeObserver && viewportEl) {
        try { resizeObserver.unobserve(viewportEl); } catch (e) {}
      }
      viewportEl = panelEl;
      rectDirty = true;
      if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(markRectDirty);
      }
      if (resizeObserver && viewportEl) {
        try { resizeObserver.observe(viewportEl); } catch (e) {}
      }
    }

    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'spotify-lyrics-visualizer';
      canvas.style.cssText = 'position:fixed !important;top:0px;left:0px;width:0px;height:0px;z-index:0 !important;pointer-events:none !important;border-radius:10px;overflow:hidden;';
      ctx = canvas.getContext('2d', { alpha: false });
      initSparks();
    }

    if (canvas.parentElement !== panelEl) {
      panelEl.insertBefore(canvas, panelEl.firstChild);
      rectDirty = true;
    }
    ensureAncestorsTransparent(lyricsEl, panelEl);
    syncViewportRect();
  }

  function hashTrackUri(uri) {
    var h = 2166136261;
    for (var i = 0; i < uri.length; i++) {
      h ^= uri.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function spawnVortexRing(intensity, cx, cy, hue) {
    if (vortexRings.length > 5) vortexRings.shift();
    vortexRings.push({
      x: cx,
      y: cy,
      hue: hue,
      radius: 16 + intensity * 14,
      maxRadius: Math.max(width, height) * (0.55 + intensity * 0.25),
      alpha: Math.min(0.88, 0.42 + intensity * 0.45),
      speed: 3.8 + intensity * 7.2,
      lineWidth: 1.8 + intensity * 2.8,
      twist: (Math.random() - 0.5) * 1.2,
      lobes: 5 + (Math.floor(intensity * 13) % 5) * 2
    });
  }

  function sampleMusicRhythm(now, cx, cy) {
    var player = window.__spPlayer ? window.__spPlayer() : null;
    var state = (player && player.getState) ? player.getState() : null;

    var isPlaying = false;
    var livePosMs = 0;
    var trackUri = 'spotify:track:default';

    if (state && typeof state.isPaused === 'boolean') {
      isPlaying = !state.isPaused && !state.isBuffering;
      var basePos = Number(state.positionAsOfTimestamp || 0);
      var ts = Number(state.timestamp || Date.now());
      var spd = Number(state.speed || 1);
      livePosMs = isPlaying ? (basePos + Math.max(0, Date.now() - ts) * spd) : basePos;
      if (state.item && state.item.uri) trackUri = state.item.uri;
    } else {
      var playBtn = document.querySelector('button[data-testid="control-button-playpause"]');
      if (playBtn) {
        var label = (playBtn.getAttribute('aria-label') || '').toLowerCase();
        isPlaying = label.indexOf('pause') !== -1;
      }
      livePosMs = isPlaying ? now : 0;
    }

    if (viewportEl && now - lastLyricCheckTime > 160) {
      lastLyricCheckTime = now;
      var activeLyricEl = document.querySelector('.FUYNhisXTCmbzt9IDxnT [aria-current="true"], .lyrics-lyricsContent-active');
      var txt = activeLyricEl ? (activeLyricEl.textContent || '').trim() : '';
      if (txt && txt !== lastActiveLyricText) {
        lastActiveLyricText = txt;
        if (isPlaying) {
          beatPulse = Math.max(beatPulse, 0.95);
          spawnEdgePalpitation(0.95);
          spawnVortexRing(0.9, cx, cy, targetHue);
        }
      }
    }

    if (!isPlaying) {
      var idleSec = now * 0.001;
      smoothBass = 0.14 + 0.05 * Math.sin(idleSec * 1.4);
      smoothMid  = 0.12 + 0.04 * Math.cos(idleSec * 1.9);
      smoothHigh = 0.10 + 0.04 * Math.sin(idleSec * 2.7);
      beatPulse *= 0.88;
      for (var b = 0; b < NUM_BANDS; b++) {
        var idleWave = 0.14 + 0.08 * Math.sin(b * 0.38 + idleSec * 2.2);
        bandValues[b] += (idleWave - bandValues[b]) * 0.15;
        peakValues[b] = Math.max(bandValues[b], peakValues[b] * 0.96);
      }
      if (now - lastPalpitationTime > 1800) {
        lastPalpitationTime = now;
        spawnEdgePalpitation(0.5);
      }
      return { isPlaying: false, posSec: idleSec };
    }

    var posSec = livePosMs * 0.001;

    var nativeLoudness = null;
    if (state && state.playbackId && window.__spLoudness && window.__spLoudness.G) {
      var val = window.__spLoudness.G(state.playbackId, livePosMs);
      if (typeof val === 'number' && !isNaN(val)) {
        nativeLoudness = val;
      }
    }
    if (nativeLoudness === null && typeof window.__spLiveLoudness === 'number') {
      nativeLoudness = window.__spLiveLoudness;
    }

    var trackHash = hashTrackUri(trackUri);
    var bpm = 110 + (trackHash % 26);
    var beatPeriodSec = 60.0 / bpm;
    var beatPos = posSec / beatPeriodSec;
    var beatFrac = beatPos - Math.floor(beatPos);
    var barBeat = Math.floor(beatPos) % 4;

    var kickEnv = Math.pow(Math.max(0, 1.0 - beatFrac * 3.1), 2.3) * ((barBeat === 0 || barBeat === 2) ? 1.0 : 0.68);
    var snareEnv = (barBeat === 1 || barBeat === 3) ? Math.pow(Math.max(0, 1.0 - beatFrac * 2.7), 2.0) * 0.95 : 0.18;
    var subGroove = 0.5 + 0.5 * Math.sin(beatPos * Math.PI * 2);
    var sixteenthEnv = Math.pow(0.5 + 0.5 * Math.sin(beatPos * Math.PI * 4), 2.0);

    var baseEnergy = (nativeLoudness !== null && nativeLoudness > 0.01)
      ? Math.min(1.0, nativeLoudness * 1.28)
      : (0.52 + 0.24 * Math.sin(posSec * 0.8) + 0.16 * Math.cos(posSec * 2.1));

    var targetBass = Math.min(1.0, baseEnergy * (0.46 + 0.66 * kickEnv + 0.25 * subGroove));
    var targetMid  = Math.min(1.0, baseEnergy * (0.42 + 0.56 * snareEnv + 0.30 * Math.sin(posSec * 3.6 + 1.1)));
    var targetHigh = Math.min(1.0, baseEnergy * (0.38 + 0.52 * sixteenthEnv + 0.26 * Math.cos(posSec * 7.2)));

    var currentSignal = targetBass * 0.62 + targetMid * 0.38;
    var delta = currentSignal - prevSignal;
    prevSignal = currentSignal;

    if ((delta > 0.12 || (beatFrac < 0.09 && baseEnergy > 0.32)) && (now - lastBeatTime > 240)) {
      lastBeatTime = now;
      var hitStrength = Math.min(1.0, 0.58 + delta * 1.9);
      beatPulse = Math.max(beatPulse, hitStrength);
      lastPalpitationTime = now;
      spawnEdgePalpitation(hitStrength);
      if (hitStrength > 0.6) {
        spawnVortexRing(hitStrength, cx, cy, targetHue);
      }
    } else if (now - lastPalpitationTime > 750) {
      lastPalpitationTime = now;
      spawnEdgePalpitation(0.65);
    }

    smoothBass += (targetBass - smoothBass) * 0.34;
    smoothMid  += (targetMid  - smoothMid)  * 0.28;
    smoothHigh += (targetHigh - smoothHigh) * 0.36;
    beatPulse  *= 0.88;

    var liveBands = window.__spLiveBands;
    for (var i = 0; i < NUM_BANDS; i++) {
      var angleNorm = i / NUM_BANDS;
      var starHarmonic = Math.cos(angleNorm * Math.PI * 12 + beatPos * Math.PI * 2) * 0.5 + 0.5;
      var fastRipple = Math.sin(angleNorm * Math.PI * 24 - posSec * 7.5) * 0.5 + 0.5;

      var bandEnergy;
      if (i % 3 === 0) {
        bandEnergy = smoothBass * (0.68 + 0.42 * starHarmonic) + beatPulse * 0.38;
      } else if (i % 3 === 1) {
        bandEnergy = smoothMid * (0.62 + 0.45 * fastRipple) + smoothBass * 0.25;
      } else {
        bandEnergy = smoothHigh * (0.58 + 0.48 * starHarmonic * fastRipple) + smoothMid * 0.22;
      }

      if (Array.isArray(liveBands) && liveBands.length > 1) {
        var bIdx = i % liveBands.length;
        var rawBand = liveBands[bIdx] || 0;
        var normBand = Math.min(1, Math.max(0, (rawBand < 0 ? rawBand + 80 : rawBand) / 80));
        bandEnergy = bandEnergy * 0.65 + normBand * 0.35;
      }

      bandEnergy = Math.min(1.0, Math.max(0.05, bandEnergy));
      if (bandEnergy > bandValues[i]) {
        bandValues[i] += (bandEnergy - bandValues[i]) * 0.58;
      } else {
        bandValues[i] += (bandEnergy - bandValues[i]) * 0.22;
      }
      peakValues[i] = Math.max(bandValues[i], peakValues[i] * 0.95);
    }

    return { isPlaying: true, posSec: posSec };
  }

  function draw(now) {
    if (!canvas || !ctx || !viewportEl || !document.contains(viewportEl)) {
      stop();
      return;
    }

    if (document.hidden) {
      animId = requestAnimationFrame(draw);
      return;
    }

    if (!syncViewportRect()) {
      animId = requestAnimationFrame(draw);
      return;
    }

    var ts = now || performance.now();

    var cx = width * 0.5;
    var cy = height * 0.5;
    var minDim = Math.min(width, height);

    var state = sampleMusicRhythm(ts, cx, cy);

    for (var p = palpitations.length - 1; p >= 0; p--) {
      var palp = palpitations[p];
      palp.angle += palp.speed;
      palp.power *= palp.decay;
      if (palp.power < 0.02) {
        palpitations.splice(p, 1);
      }
    }

    currentHue = (currentHue + shortestHueDelta(currentHue, targetHue) * 0.075 + (state.isPlaying ? 0.35 : 0.08) + 360) % 360;
    var secHue = (currentHue + 48 + Math.sin(phase * 0.7) * 25) % 360;
    var accentHue = (currentHue + 310) % 360;

    phase += state.isPlaying ? (0.024 + smoothBass * 0.048 + beatPulse * 0.042) : 0.007;
    spinAngle += (state.isPlaying ? 0.007 : 0.002) * (1.0 + smoothMid * 0.95);

    if (fbCanvas && fbCtx) {
      fbCtx.drawImage(canvas, 0, 0, width, height);

      ctx.fillStyle = 'rgba(6, 1, 4, 0.22)';
      ctx.fillRect(0, 0, width, height);

      ctx.save();
      var zoomScale = 1.02 + smoothBass * 0.034 + beatPulse * 0.038;
      var feedbackTwist = Math.sin(phase * 0.42) * (0.0055 + beatPulse * 0.006);
      ctx.translate(cx, cy);
      ctx.scale(zoomScale, zoomScale);
      ctx.rotate(feedbackTwist);
      ctx.globalAlpha = 0.86;
      ctx.drawImage(fbCanvas, -cx, -cy, width, height);
      ctx.restore();
    } else {
      ctx.fillStyle = 'rgba(8, 1, 3, 0.3)';
      ctx.fillRect(0, 0, width, height);
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (var v = vortexRings.length - 1; v >= 0; v--) {
      var vr = vortexRings[v];
      vr.radius += vr.speed * (1.0 + smoothBass * 0.75);
      vr.alpha *= 0.945;
      if (vr.alpha <= 0.02 || vr.radius >= vr.maxRadius) {
        vortexRings.splice(v, 1);
        continue;
      }

      ctx.beginPath();
      var ringSteps = 72;
      for (var s = 0; s <= ringSteps; s++) {
        var theta = (s / ringSteps) * Math.PI * 2;
        var bIdx = s % NUM_BANDS;
        var waveMod = Math.sin(theta * vr.lobes + phase * 2.4 + vr.twist) * (8 + bandValues[bIdx] * 28);
        var rr = vr.radius + waveMod;
        var rx = vr.x + Math.cos(theta) * rr;
        var ry = vr.y + Math.sin(theta) * rr;
        if (s === 0) ctx.moveTo(rx, ry);
        else ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.strokeStyle = hslColor(vr.hue, 95, 62, vr.alpha);
      ctx.lineWidth = vr.lineWidth;
      ctx.stroke();
    }

    ctx.translate(cx, cy);

    var rayCount = NUM_BANDS;
    var innerBaseR = minDim * (0.06 + smoothBass * 0.035 + beatPulse * 0.025);
    var maxRayReach = minDim * (0.48 + smoothBass * 0.24 + beatPulse * 0.18);

    for (var r = 0; r < rayCount; r++) {
      var bandVal = bandValues[r];
      var peakVal = peakValues[r];
      var rayAngle = (r / rayCount) * Math.PI * 2 + spinAngle * (r % 2 === 0 ? 1 : -0.75);

      var edgePalpBoost = 0;
      var dominantPalpHue = currentHue;
      for (var k = 0; k < palpitations.length; k++) {
        var palp = palpitations[k];
        var angleDiff = Math.cos(rayAngle - palp.angle);
        if (angleDiff > 0) {
          var weight = Math.pow(angleDiff, 3.2) * palp.power;
          edgePalpBoost += weight;
          if (weight > 0.25) {
            dominantPalpHue = palp.hue;
          }
        }
      }

      var effectiveBand = Math.min(1.4, bandVal * (1.0 + edgePalpBoost * 0.85) + edgePalpBoost * 0.35);
      var rayLen = innerBaseR + Math.pow(effectiveBand, 1.22) * maxRayReach;

      var x0 = Math.cos(rayAngle) * (innerBaseR * 0.5);
      var y0 = Math.sin(rayAngle) * (innerBaseR * 0.5);
      var x1 = Math.cos(rayAngle) * rayLen;
      var y1 = Math.sin(rayAngle) * rayLen;

      var rayHue = (dominantPalpHue + (r / rayCount) * 50 + (r % 3) * 20) % 360;
      var rayAlpha = Math.min(1.0, 0.18 + effectiveBand * 0.52 + beatPulse * 0.18 + edgePalpBoost * 0.25);

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = hslColor(rayHue, 96, 62, rayAlpha);
      ctx.lineWidth = 1.5 + effectiveBand * 3.8 + (r % 4 === 0 ? 1.1 : 0);
      ctx.lineCap = 'round';
      ctx.stroke();

      if ((peakVal > 0.42 || edgePalpBoost > 0.4) && r % 2 === 0) {
        var tipR = innerBaseR + Math.pow(Math.max(peakVal, effectiveBand), 1.22) * maxRayReach;
        var tx = Math.cos(rayAngle) * tipR;
        var ty = Math.sin(rayAngle) * tipR;
        ctx.beginPath();
        ctx.arc(tx, ty, 1.4 + effectiveBand * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = hslColor((rayHue + 35) % 360, 100, 84, Math.min(1.0, peakVal * 0.78 + edgePalpBoost * 0.4));
        ctx.fill();
      }
    }

    for (var layer = 0; layer < 3; layer++) {
      ctx.beginPath();
      var basePolyR = minDim * (0.075 + layer * 0.046) * (0.85 + smoothBass * 0.45 + beatPulse * 0.25);
      var dir = layer % 2 === 0 ? 1 : -1;
      var rot = spinAngle * 1.9 * dir + layer * 0.55;
      var vertices = NUM_BANDS;
      var lobes = 5 + layer * 2;

      for (var k = 0; k <= vertices; k++) {
        var idx = k % vertices;
        var a = (idx / vertices) * Math.PI * 2 + rot;
        var symFactor = 1.0 + 0.26 * Math.cos(a * lobes - phase * dir);

        var layerPalp = 0;
        for (var pi = 0; pi < palpitations.length; pi++) {
          var ad = Math.cos(a - palpitations[pi].angle);
          if (ad > 0) layerPalp += Math.pow(ad, 3.0) * palpitations[pi].power;
        }

        var freqSpike = (bandValues[idx] * (1.0 + layerPalp * 0.7) + layerPalp * 0.3) * minDim * (0.085 + layer * 0.025);
        var rad = basePolyR * symFactor + freqSpike;
        var px = Math.cos(a) * rad;
        var py = Math.sin(a) * rad;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();

      if (layer === 0) {
        ctx.strokeStyle = hslColor(currentHue, 100, 88, 0.78 + beatPulse * 0.22);
        ctx.lineWidth = 2.2 + beatPulse * 1.6;
      } else if (layer === 1) {
        ctx.strokeStyle = hslColor(secHue, 96, 62, 0.68 + smoothMid * 0.28);
        ctx.lineWidth = 1.8 + smoothBass * 1.4;
      } else {
        ctx.strokeStyle = hslColor(accentHue, 92, 58, 0.50 + smoothHigh * 0.38);
        ctx.lineWidth = 1.4;
      }
      ctx.stroke();
    }

    var coreGlowR = minDim * (0.12 + smoothBass * 0.08 + beatPulse * 0.06);
    var coreGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, coreGlowR);
    coreGrad.addColorStop(0, hslColor(currentHue, 100, 94, 0.68 + beatPulse * 0.28));
    coreGrad.addColorStop(0.35, hslColor(currentHue, 95, 62, 0.46 + smoothBass * 0.28));
    coreGrad.addColorStop(0.75, hslColor(secHue, 90, 45, 0.16));
    coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, coreGlowR, 0, Math.PI * 2);
    ctx.fill();

    var maxSparkR = Math.max(width, height) * 0.68;
    var sparkSpeedMult = state.isPlaying ? (1.0 + smoothBass * 2.4 + beatPulse * 3.0) : 0.35;

    for (var pIdx = 0; pIdx < sparks.length; pIdx++) {
      var sp = sparks[pIdx];
      sp.dist += sp.speed * sparkSpeedMult * (0.6 + (sp.dist / maxSparkR) * 1.5);

      if (sp.dist > maxSparkR) {
        sparks[pIdx] = createSpark(false);
        sp = sparks[pIdx];
      }

      var tailLen = sp.length * (0.6 + smoothBass * 0.9 + beatPulse * 0.8);
      var sx0 = Math.cos(sp.angle) * sp.dist;
      var sy0 = Math.sin(sp.angle) * sp.dist;
      var sx1 = Math.cos(sp.angle) * (sp.dist + tailLen);
      var sy1 = Math.sin(sp.angle) * (sp.dist + tailLen);

      var distRatio = Math.min(1, sp.dist / maxSparkR);
      var spAlpha = sp.alpha * Math.sin(distRatio * Math.PI) * (0.65 + smoothHigh * 0.55);

      ctx.beginPath();
      ctx.moveTo(sx0, sy0);
      ctx.lineTo(sx1, sy1);
      ctx.strokeStyle = hslColor(currentHue + sp.hueOffset, 96, 68, spAlpha);
      ctx.lineWidth = sp.thickness * (0.8 + distRatio * 0.9);
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.restore();

    var vigGrad = ctx.createRadialGradient(cx, cy, minDim * 0.22, cx, cy, Math.max(width, height) * 0.72);
    vigGrad.addColorStop(0, 'rgba(14, 2, 6, 0.12)');
    vigGrad.addColorStop(0.7, 'rgba(10, 1, 4, 0.32)');
    vigGrad.addColorStop(1, 'rgba(4, 0, 2, 0.74)');
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, width, height);

    animId = requestAnimationFrame(draw);
  }

  function start() {
    if (!animId) {
      animId = requestAnimationFrame(draw);
    }
  }

  function stop() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    if (resizeObserver && viewportEl) {
      try { resizeObserver.unobserve(viewportEl); } catch (e) {}
    }
    if (canvas && canvas.parentElement) {
      canvas.remove();
    }
    viewportEl = null;
  }

  function check() {
    var lyricsEl = document.querySelector('.FUYNhisXTCmbzt9IDxnT') ||
                   document.querySelector('.Root__lyrics-cinema') ||
                   document.querySelector('[data-testid="lyrics-view"]') ||
                   document.querySelector('[data-testid="lyrics-container"]');

    if (lyricsEl) {
      var cinemaEl = lyricsEl.closest('.QdB2YtfEq0ks5O4QbtwX') || lyricsEl.closest('.Root__lyrics-cinema');
      var mainViewEl = document.querySelector('.jEMA2gVoLgPQqAFrPhFw') || document.querySelector('.main-view-container');
      var targetPanel = (cinemaEl && cinemaEl.offsetHeight > 100) ? cinemaEl : (mainViewEl || lyricsEl);

      ensureCanvas(targetPanel, lyricsEl);
      start();
    } else if (viewportEl) {
      stop();
    }
  }

  window.addEventListener('resize', markRectDirty, { passive: true });
  setInterval(check, 600);

  var observer = new MutationObserver(function() {
    check();
  });
  observer.observe(document.body || document.documentElement, { childList: true, subtree: false });
  setTimeout(check, 150);
})();
