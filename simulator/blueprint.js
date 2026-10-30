// The blueprint view: population, one sample, and the distribution of the
// statistic across samples. Steps 1 to 7 share this one frame.
(function (root) {
  "use strict";
  var E = root.SimEngine, S = root.SimStats, D = root.SimDraw, C = D.COLORS;
  var HAT = "σ̂", SIGMA = "σ", MU = "μ", RHO = "ρ";
  var MAX_KEPT = 5000;

  var state = {
    c: null, dist: null, crit: null, rng: null, seed: 2027, hide: false,
    samples: [], stats: [], raws: [], sumStat: 0, N: 0, selected: -1,
    range: null, dots: [], sumM: 0, sumM2: 0, sumSSn: 0, sumVarHat: 0, sumSdHat: 0, nEst: 0,
    beyondZ: 0, anim: 0
  };

  function reduced() {
    return root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function resetDraws() {
    cancelFx();
    state.samples = []; state.stats = []; state.raws = [];
    state.N = 0; state.selected = -1; state.dots = [];
    state.sumM = 0; state.sumM2 = 0; state.sumSSn = 0; state.sumVarHat = 0; state.sumSdHat = 0;
    state.nEst = 0; state.beyondZ = 0; state.sumMsw = 0; state.sumMsb = 0;
    state.rng = E.makeRng(state.seed);
  }

  // A mean in score units lives on the same axis as the scores, so a statistic
  // falls straight down and sample size shows up as a narrower distribution
  function sharesAxis(c) { return c.view === "raw" && c.meta.kind === "one"; }

  // Extra decimals for a small scale, so a GPA doesn't read 3.0 in every sample
  function extra(c) { return c.sigma >= 5 ? 0 : c.sigma >= 0.5 ? 1 : c.sigma >= 0.05 ? 2 : 3; }

  // Fix the axis of panel 3 from a pilot run, so it doesn't jump around as dots land
  function setRange() {
    var c = state.c, rng = E.makeRng(99), vals = [], i;
    if (sharesAxis(c)) {
      state.range = popAxis(c);
      return;
    }
    for (i = 0; i < 800; i++) {
      var s = E.drawSample(c, rng);
      vals.push(c.view === "raw" ? s.raw : s.stat);
    }
    vals.sort(function (a, b) { return a - b; });
    var lo = vals[Math.floor(0.004 * vals.length)], hi = vals[Math.ceil(0.996 * vals.length) - 1];
    var dist = state.dist;
    if (c.view === "raw") {
      var rn = E.rawNull(c);
      if (rn) {
        lo = Math.min(lo, rn.mean - 4 * rn.sd);
        hi = Math.max(hi, rn.mean + 4 * rn.sd);
      } else if (c.step === "6") {
        lo = -1; hi = 1;
      } else {
        var pad = (hi - lo) * 0.12;
        lo -= pad; hi += pad;
      }
    } else if (dist.family === "f") {
      lo = 0;
      hi = Math.max(hi, E.quantile(dist, 0.997)) * 1.05;
    } else {
      var q = Math.min(6.5, Math.max(4, E.quantile(dist, 0.9985)));
      lo = Math.min(lo, -q);
      hi = Math.max(hi, q);
      lo = Math.max(lo, -9);
      hi = Math.min(hi, 12);
    }
    state.range = [lo, hi];
  }

  function configure(opts) {
    var old = state.c || {};
    var c = E.config(Object.assign({}, old.step ? { step: old.step, n: old.n, d: old.d, pop: old.pop, mu0: old.mu0, sigma: old.sigma, alpha: old.alpha, tails: old.tails, view: old.view } : {}, opts));
    state.c = c;
    // Scatter plots need height, so their two panels share a row
    document.querySelector("#view-blueprint .stage").classList.toggle("pairs", c.meta.kind === "pairs" || c.meta.kind === "binary");
    state.dist = E.nullDist(c);
    state.crit = E.critical(c, state.dist);
    setRange();
    resetDraws();
  }

  // A sample only counts once its statistic has landed in panel 3
  function land(s) {
    var c = state.c;
    state.stats.push(s.stat);
    state.raws.push(s.raw);
    state.N++;
    if (Math.abs(s.stat) > 1.96) state.beyondZ++;
    state.sumM += s.raw;
    state.sumM2 += s.raw * s.raw;
    if (s.sdHat !== undefined) {
      state.nEst++;
      state.sumSSn += s.ss / c.n;
      state.sumVarHat += s.sdHat * s.sdHat;
      state.sumSdHat += s.sdHat;
    }
    if (s.msw !== undefined) {
      state.sumMsw += s.msw;
      state.sumMsb += s.msb;
    }
    state.samples.push(s);
    if (state.samples.length > MAX_KEPT) state.samples.shift();
    state.selected = state.N - 1;
  }

  function draw(count, quiet) {
    var c = state.c, i, list = [];
    for (i = 0; i < count; i++) list.push(E.drawSample(c, state.rng));
    if (quiet || reduced()) {
      list.forEach(land);
      render();
    } else {
      launch(list);
    }
  }

  // The animation ----
  //
  // One beat at a time, on a canvas that lies over all three panels: the
  // observations fall out of the population, slide together into the statistic,
  // and that one statistic drops into panel 3. The timing follows Magnusson's
  // p-value visualization. Bigger batches run faster, and +500 is just a shower.

  var FALL = 0.55, COLLAPSE = 0.5, DROP = 0.6;
  var fx = { items: [], raf: 0 };

  function bounce(t) {
    var n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
    if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
    t -= 2.625 / d;
    return n * t * t + 0.984375;
  }

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function clamp01(t) { return Math.max(0, Math.min(1, t)); }

  function fxCanvas() { return document.getElementById("c-fx"); }

  function cancelFx() {
    fx.items = [];
    state.pendingSample = null;
    state.sampleHidden = false;
    if (fx.raf) root.cancelAnimationFrame(fx.raf);
    fx.raf = 0;
    var el = fxCanvas();
    if (el) D.fit(el);
  }

  // Land everything still in the air, for example when the window is resized
  function flushFx() {
    if (!fx.items.length) return;
    fx.items.slice().sort(function (a, b) { return a.start - b.start; }).forEach(function (it) { land(it.s); });
    cancelFx();
  }

  function offset(id, stage) {
    var r = document.getElementById(id).getBoundingClientRect();
    return { x: r.left - stage.left, y: r.top - stage.top, w: r.width, h: r.height };
  }

  // Where each observation starts, where it lands, and where it collapses to
  function planDots(c, s, g) {
    var k = c.meta.kind, dots = [], p = g.pop, q = g.sample;
    if (k === "pairs" || k === "binary") {
      var sc = scatterScales(c, q.w, q.h), binary = k === "binary";
      s.x.forEach(function (v, i) {
        var u = (p.h - 12) / 7;
        var x0 = binary ? p.x + p.w * (v ? 0.62 : 0.38) : p.x + p.w / 2 + v * u * 1.6;
        var y0 = binary ? p.y + p.h * 0.55 : p.y + p.h / 2 - s.y[i] * u;
        dots.push({ x0: x0, y0: y0, x1: q.x + sc.x(v), y1: q.y + sc.y(s.y[i]), lag: (i % 8) * 0.018, color: C.dot });
      });
      var xm = binary ? 0.5 : 0, ym = S.mean(s.y) + s.b * (xm - S.mean(s.x)) ;
      return { dots: dots, line: true, sc: sc, sx: q.x + sc.x(xm), sy: q.y + sc.y(ym), q: q, ymean: S.mean(s.y), xbar: S.mean(s.x) };
    }
    var dom = popAxis(c), x = D.scale(dom[0], dom[1], 14, q.w - 14);
    var groups = k === "two" ? [s.a, s.b] : k === "three" ? s.groups : [s.x];
    var colors = [C.pop, C.pop2, C.pop3], rows = groups.length, rowH = (q.h - 30) / rows, centers = [];
    groups.forEach(function (list, gi) {
      var m = q.x + x(S.mean(list)), y = q.y + 6 + rowH * (gi + 0.5);
      centers.push(m);
      list.forEach(function (v, i) {
        dots.push({
          x0: p.x + x(v), y0: p.y + (p.h - 24) * (0.45 + 0.4 * ((i * 7) % 11) / 11), x1: q.x + x(v), y1: y,
          cx: m, lag: (i % 9) * 0.02, color: rows === 1 ? C.dot : colors[gi]
        });
      });
    });
    var sx = centers.reduce(function (a, b) { return a + b; }, 0) / rows;
    return { dots: dots, line: false, merge: rows > 1, sx: sx, sy: q.y + 6 + rowH * rows / 2, q: q };
  }

  function launch(list) {
    var c = state.c, now = root.performance.now(), stageEl = document.querySelector("#view-blueprint .stage");
    var stage = stageEl.getBoundingClientRect();
    var g = { pop: offset("c-pop", stage), sample: offset("c-sample", stage), dist: offset("c-dist", stage) };
    var count = list.length, shower = count > 60;
    var speed = count === 1 ? 1 : 0.5, gap = shower ? 3 : 30;
    var base = fx.items.length ? Math.max(now, fx.items[fx.items.length - 1].start + 0.15 * 1000) : now;
    list.forEach(function (s, i) {
      var it = { s: s, start: base + i * gap, speed: speed, shower: shower, g: g, stage: false };
      it.plan = shower ? null : planDots(c, s, g);
      fx.items.push(it);
    });
    if (!fx.raf) fx.raf = root.requestAnimationFrame(tick);
  }

  function landingSpot(s, g) {
    var c = state.c, L = state.layout, v = c.view === "raw" ? s.raw : s.stat;
    var px = Math.max(L.left, Math.min(L.right, L.x(v)));
    var h = L.heights[Math.floor(px / L.bin)] || 0;
    return { x: g.dist.x + px, y: g.dist.y + L.base - (h + 0.5) * L.step };
  }

  function ball(ctx, x, y, color, r) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Draw one sample at this moment. Returns true once it has landed.
  function drawItem(ctx, it, sec) {
    var T = it.speed, fall = FALL * T, col = COLLAPSE * T, drop = DROP * T, g = it.g, p = it.plan;
    var target = landingSpot(it.s, g), beyond = isBeyond(it.s.stat);
    if (it.shower) {
      var ts = sec / 0.5;
      if (ts >= 1) return true;
      var y0 = g.dist.y + 6;
      ball(ctx, target.x, y0 + (target.y - y0) * bounce(clamp01(ts)), beyond ? C.crit : C.dot, 3);
      return false;
    }
    if (sec < fall + col) {
      state.sampleHidden = true;
      p.dots.forEach(function (d) {
        var t = clamp01((sec - d.lag * T) / (fall - 0.16 * T)), x, y;
        if (p.line) {
          var e = 1 - Math.pow(1 - t, 3);
          x = d.x0 + (d.x1 - d.x0) * e;
          y = d.y0 + (d.y1 - d.y0) * e;
        } else {
          x = d.x1;
          y = d.y0 + (d.y1 - d.y0) * bounce(t);
          if (sec > fall) {
            var u = (sec - fall) / col;
            var slide = easeInOut(clamp01(p.merge ? u / 0.65 : u));
            x = d.x1 + (d.cx - d.x1) * slide;
            if (p.merge && u > 0.65) {
              var m = easeInOut((u - 0.65) / 0.35);
              x += (p.sx - x) * m;
              y += (p.sy - y) * m;
            }
          }
        }
        ball(ctx, x, y, d.color, it.speed < 1 ? 3.2 : 4.5);
      });
      if (p.line && sec > fall) {
        // The fitted line swings up from the flat line at the mean of Y
        var w = easeInOut((sec - fall) / col), sc = p.sc, q = p.q, x0 = sc.xlo, x1 = sc.xhi, s = it.s;
        var yAt = function (v) { return p.ymean + (s.a + s.b * v - p.ymean) * w; };
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(q.x + sc.x(x0), q.y + sc.y(yAt(x0)));
        ctx.lineTo(q.x + sc.x(x1), q.y + sc.y(yAt(x1)));
        ctx.stroke();
      }
      return false;
    }
    if (!it.stage) {
      // The statistic exists now, so panel 2 can show it
      it.stage = true;
      state.pendingSample = it.s;
      state.sampleHidden = false;
      renderSample();
    }
    var t = clamp01((sec - fall - col) / drop);
    if (t >= 1) return true;
    var bx = p.sx + (target.x - p.sx) * easeInOut(clamp01(t * 1.4));
    var by = p.sy + (target.y - p.sy) * bounce(t);
    ball(ctx, bx, by, C.accent, 6 - 1.5 * t);
    return false;
  }

  function step(now) {
    var f = D.fit(fxCanvas()), ctx = f.ctx, landed = false, keep = [];
    state.sampleHidden = false;
    fx.items.forEach(function (it) {
      var sec = (now - it.start) / 1000;
      if (sec < 0) { keep.push(it); return; }
      if (drawItem(ctx, it, sec)) {
        land(it.s);
        landed = true;
        if (state.pendingSample === it.s) state.pendingSample = null;
      } else {
        keep.push(it);
      }
    });
    fx.items = keep;
    if (landed) {
      renderDist();
      readout();
    }
    if (!keep.length) {
      state.sampleHidden = false;
      render();
      f.ctx.clearRect(0, 0, f.w, f.h);
    } else if (state.sampleHidden !== state.wasHidden) {
      renderSample();
    }
    state.wasHidden = state.sampleHidden;
    return keep.length > 0;
  }

  function tick(now) {
    fx.raf = step(now) ? root.requestAnimationFrame(tick) : 0;
  }

  function shownSample() {
    if (state.pendingSample) return state.pendingSample;
    if (state.selected < 0) return null;
    var offset = state.N - state.samples.length;
    return state.samples[state.selected - offset] || null;
  }

  function isBeyond(stat) { return stat < state.crit.lo || stat > state.crit.hi; }

  // Panel 1: the population ----

  function popAxis(c) {
    var k = c.meta.kind, center = k === "paired" ? 0 : c.mu0, s = c.sigma, extra = Math.abs(c.d) * s;
    return [center - 4 * s - extra, center + 4 * s + extra];
  }

  function renderPop() {
    var f = D.fit(document.getElementById("c-pop")), ctx = f.ctx, c = state.c, k = c.meta.kind;
    var cap = document.getElementById("cap-pop"), truth = E.truth(c), p = E.population(c);
    var pad = 14, base = f.h - 24, top = 6, dashed = "#d8dde3";

    if (k === "pairs" || k === "binary") {
      renderPopPairs(ctx, f, c, truth);
    } else {
      var dom = popAxis(c), x = D.scale(dom[0], dom[1], pad, f.w - pad), colors = [C.pop, C.pop2, C.pop3];
      var center = k === "paired" ? 0 : c.mu0;
      var peak = 0, i;
      for (i = -4; i <= 4; i += 0.02) peak = Math.max(peak, p.pdf(i));
      var nullFn = function (v) { return p.pdf((v - center) / c.sigma); };
      truth.means.forEach(function (m, g) {
        var fn = function (v) { return p.pdf((v - m) / c.sigma); };
        D.curve(ctx, fn, x, base, base - top, peak * 1.06, pad, f.w - pad, { fill: colors[g] + "33" });
        D.curve(ctx, fn, x, base, base - top, peak * 1.06, pad, f.w - pad, { color: colors[g], width: 2.2 });
      });
      if (c.d !== 0) D.curve(ctx, nullFn, x, base, base - top, peak * 1.06, pad, f.w - pad, { color: dashed, dash: [5, 4], width: 1.5 });
      D.xAxis(ctx, x, base, pad, f.w - pad, 9);
      if (state.hide) {
        ctx.fillStyle = "rgba(27, 31, 36, 0.86)";
        ctx.fillRect(0, 0, f.w, f.h);
        D.text(ctx, "?", f.w / 2, f.h / 2 + 4, { size: 44, bold: true, color: C.text, align: "center", base: "middle" });
      }
    }

    var bits, dec = 1 + extra(c);
    if (state.hide) bits = "We don't get to see this. We only have the sample.";
    else if (k === "one") bits = MU + " = " + D.fmt(truth.means[0], dec) + ", " + SIGMA + " = " + c.sigma + (c.d !== 0 ? ". Dashed: what H₀ claims (" + MU + " = " + c.mu0 + ")" : "");
    else if (k === "paired") bits = "Gains: " + MU + " = " + D.fmt(truth.means[0], dec) + ", " + SIGMA + " = " + c.sigma + (c.d !== 0 ? ". Dashed: H₀ (no gain)" : "");
    else if (k === "two") bits = MU + "₁ = " + D.fmt(truth.means[0], dec) + ", " + MU + "₂ = " + D.fmt(truth.means[1], dec) + ", " + SIGMA + " = " + c.sigma;
    else if (k === "three") bits = "Group means " + truth.means.map(function (m) { return D.fmt(m, dec); }).join(", ") + ", " + SIGMA + " = " + c.sigma;
    else if (k === "binary") bits = "β = " + D.fmt(truth.beta, 2) + ": the gap between the two groups, in SD units";
    else bits = RHO + " = " + D.fmt(truth.rho, 2);
    cap.textContent = bits;
    document.getElementById("c-pop").setAttribute("aria-label", "Population. " + bits);
  }

  function renderPopPairs(ctx, f, c, truth) {
    var rho = truth.rho, side = f.h - 12, cx = f.w / 2, cy = f.h / 2, u = side / 7;
    var binary = c.meta.kind === "binary";
    if (binary) rho = 0;
    if (binary) {
      var dom = [-4.5, 4.5 + Math.max(0, truth.beta)], x = D.scale(dom[0] + Math.min(0, truth.beta), dom[1], 14, f.w - 14), base = f.h - 24;
      [[0, C.pop], [truth.beta, C.pop2]].forEach(function (g) {
        var fn = function (v) { return S.normPdf(v, g[0]); };
        D.curve(ctx, fn, x, base, base - 6, 0.42, 14, f.w - 14, { fill: g[1] + "33" });
        D.curve(ctx, fn, x, base, base - 6, 0.42, 14, f.w - 14, { color: g[1], width: 2.2 });
      });
      D.xAxis(ctx, x, base, 14, f.w - 14, 9);
      return;
    }
    // Ellipses holding 50%, 80% and 95% of the population
    [1.177, 1.794, 2.448].forEach(function (rad, i) {
      ctx.beginPath();
      for (var t = 0; t <= 64; t++) {
        var a = t / 64 * 2 * Math.PI;
        var vx = rad * Math.cos(a);
        var vy = rad * (rho * Math.cos(a) + Math.sqrt(1 - rho * rho) * Math.sin(a));
        var px = cx + vx * u * 1.6, py = cy - vy * u;
        if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = C.pop + (i === 0 ? "44" : "22");
      ctx.fill();
      ctx.strokeStyle = C.pop;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    });
    if (state.hide) {
      ctx.fillStyle = "rgba(27, 31, 36, 0.86)";
      ctx.fillRect(0, 0, f.w, f.h);
      D.text(ctx, "?", f.w / 2, f.h / 2 + 4, { size: 44, bold: true, color: C.text, align: "center", base: "middle" });
    }
  }

  // Panel 2: one sample ----

  function renderSample() {
    var f = D.fit(document.getElementById("c-sample")), ctx = f.ctx, c = state.c, k = c.meta.kind;
    var s = shownSample(), cap = document.getElementById("cap-sample"), canvas = document.getElementById("c-sample");
    var pad = 14, base = f.h - 24;
    if (state.sampleHidden) {
      // The observations are in the air, so show only the empty axes
      if (k === "pairs" || k === "binary") {
        renderScatterAxes(ctx, f, c);
      } else {
        var dom0 = popAxis(c);
        D.xAxis(ctx, D.scale(dom0[0], dom0[1], pad, f.w - pad), base, pad, f.w - pad, 9);
      }
      cap.textContent = "";
      return;
    }
    if (!s) {
      D.text(ctx, "Press +1 to draw a sample", f.w / 2, f.h / 2, { size: 16, align: "center", base: "middle", color: C.text });
      cap.textContent = "";
      canvas.setAttribute("aria-label", "No sample drawn yet.");
      return;
    }

    if (k === "pairs" || k === "binary") {
      renderScatter(ctx, f, c, s);
    } else {
      var dom = popAxis(c), x = D.scale(dom[0], dom[1], pad, f.w - pad), groups, colors = [C.pop, C.pop2, C.pop3];
      if (k === "two") groups = [s.a, s.b];
      else if (k === "three") groups = s.groups;
      else groups = [s.x];
      var rows = groups.length, rowH = (base - 6) / rows;
      groups.forEach(function (g, i) {
        var y = 6 + rowH * (i + 0.5), color = rows === 1 ? C.dot : colors[i], m = S.mean(g);
        if (rows > 1) D.text(ctx, "Group " + (i + 1), pad, y, { color: color, base: "middle" });
        ctx.fillStyle = color;
        g.forEach(function (v) {
          ctx.beginPath();
          ctx.arc(x(v), y, c.n > 60 ? 3 : 4.5, 0, 2 * Math.PI);
          ctx.fill();
        });
        if (c.n > 1) {
          ctx.strokeStyle = C.accent;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x(m), y - rowH * 0.42);
          ctx.lineTo(x(m), y + rowH * 0.42);
          ctx.stroke();
        }
      });
      D.xAxis(ctx, x, base, pad, f.w - pad, 9);
    }

    var html = sampleText(c, s);
    cap.innerHTML = html;
    canvas.setAttribute("aria-label", "Sample " + (state.selected + 1) + ". " + cap.textContent);
  }

  function scatterScales(c, w, h) {
    var left = 40, right = w - 10, top = 6, base = h - 22, binary = c.meta.kind === "binary";
    return {
      left: left, right: right, top: top, base: base, binary: binary,
      xlo: binary ? 0 : -3.2, xhi: binary ? 1 : 3.2,
      x: binary ? D.scale(-0.5, 1.5, left, right) : D.scale(-3.2, 3.2, left, right),
      y: binary ? D.scale(-3.6 + Math.min(0, c.d), 3.6 + Math.max(0, c.d), base, top) : D.scale(-3.6, 3.6, base, top)
    };
  }

  function renderScatterAxes(ctx, f, c) {
    var sc = scatterScales(c, f.w, f.h);
    D.yAxis(ctx, sc.y, sc.left, sc.base, sc.top, 4);
    if (sc.binary) {
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(sc.left, sc.base + 0.5);
      ctx.lineTo(sc.right, sc.base + 0.5);
      ctx.stroke();
      D.text(ctx, "X = 0", sc.x(0), sc.base + 15, { align: "center" });
      D.text(ctx, "X = 1", sc.x(1), sc.base + 15, { align: "center" });
    } else {
      D.xAxis(ctx, sc.x, sc.base, sc.left, sc.right, 8);
    }
  }

  function renderScatter(ctx, f, c, s) {
    var sc = scatterScales(c, f.w, f.h), x = sc.x, y = sc.y;
    ctx.fillStyle = C.dot;
    s.x.forEach(function (v, i) {
      ctx.beginPath();
      ctx.arc(x(v), y(s.y[i]), 4, 0, 2 * Math.PI);
      ctx.fill();
    });
    ctx.strokeStyle = C.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x(sc.xlo), y(s.a + s.b * sc.xlo));
    ctx.lineTo(x(sc.xhi), y(s.a + s.b * sc.xhi));
    ctx.stroke();
    renderScatterAxes(ctx, f, c);
  }

  function sampleText(c, s) {
    var f = D.fmt, k = c.meta.kind, out = [], e = extra(c), one = 1 + e, two = 2 + e, sq = 2 * e;
    function hatM() { return "σ̂<sub>M</sub>"; }
    if (c.step === "1") {
      out.push("X = " + f(s.M, one), "z = (X − " + MU + ") / " + SIGMA + " = <b>" + f(s.stat) + "</b>");
    } else if (c.step === "2") {
      out.push("M = " + f(s.M, one));
      if (s.sdHat !== undefined) out.push(HAT + " = " + f(s.sdHat, one));
      out.push(SIGMA + "<sub>M</sub> = " + f(s.se, two), "z = <b>" + f(s.stat) + "</b>");
    } else if (k === "one" || k === "paired") {
      out.push("M = " + f(s.M, one), HAT + " = " + f(s.sdHat, one), hatM() + " = " + f(s.se, two), "t(" + (c.n - 1) + ") = <b>" + f(s.stat) + "</b>");
    } else if (k === "two") {
      out.push("M₁ = " + f(s.M1, one), "M₂ = " + f(s.M2, one), "M₁ − M₂ = " + f(s.raw, one),
        "σ̂<sub>M₁−M₂</sub> = " + f(s.se, two), "t(" + (2 * c.n - 2) + ") = <b>" + f(s.stat) + "</b>");
    } else if (k === "three") {
      out.push("Means " + s.means.map(function (m) { return f(m, one); }).join(", "), "MS<sub>between</sub> = " + f(s.msb, sq),
        "MS<sub>within</sub> = " + f(s.msw, sq), "F(2, " + (3 * c.n - 3) + ") = <b>" + f(s.stat) + "</b>");
    } else if (c.step === "6") {
      out.push("r = " + f(s.r), "t(" + (c.n - 2) + ") = <b>" + f(s.stat) + "</b>");
    } else {
      out.push("Ŷ = " + f(s.a) + " + " + f(s.b) + " X", "b = " + f(s.b), "SE = " + f(s.seB), "t(" + (c.n - 2) + ") = <b>" + f(s.stat) + "</b>");
    }
    var p = s.p < 0.001 ? "p &lt; .001" : "p = " + s.p.toFixed(3).replace(/^0/, "");
    out.push(p);
    return out.join(" &nbsp;·&nbsp; ");
  }

  // Panel 3: the distribution of the statistic ----

  function renderDist() {
    var canvas = document.getElementById("c-dist"), f = D.fit(canvas), ctx = f.ctx, c = state.c;
    var pad = 14, base = f.h - 24, top = 10, height = base - top, dist = state.dist;
    var dom = state.range, x = D.scale(dom[0], dom[1], pad, f.w - pad);
    var useRaw = c.view === "raw", rn = useRaw ? E.rawNull(c) : null;
    var fn = null, cutLo, cutHi, shared = sharesAxis(c);

    if (!useRaw) {
      fn = function (v) { return E.pdf(dist, v); };
      cutLo = state.crit.lo; cutHi = state.crit.hi;
    } else if (rn) {
      fn = function (v) { return S.normPdf(v, rn.mean, rn.sd); };
      cutLo = state.crit.lo === -Infinity ? -Infinity : rn.mean + state.crit.lo * rn.sd;
      cutHi = state.crit.hi === Infinity ? Infinity : rn.mean + state.crit.hi * rn.sd;
    } else if (c.step === "6") {
      var df = c.n - 2;
      fn = function (r) {
        if (Math.abs(r) >= 1) return 0;
        var t = r * Math.sqrt(df / (1 - r * r));
        return S.tPdf(t, df) * Math.sqrt(df) * Math.pow(1 - r * r, -1.5);
      };
      var toR = function (t) { return t / Math.sqrt(df + t * t); };
      cutLo = state.crit.lo === -Infinity ? -Infinity : toR(state.crit.lo);
      cutHi = state.crit.hi === Infinity ? Infinity : toR(state.crit.hi);
    }

    var peak = 0, i;
    if (fn) {
      for (i = 0; i <= 200; i++) peak = Math.max(peak, fn(dom[0] + (dom[1] - dom[0]) * i / 200));
      // The F density runs off to infinity at zero for small df, so cap the display peak
      if (dist.family === "f" && !useRaw) peak = Math.min(peak, 1.1);
    }

    // Critical regions under the curve
    if (fn) {
      if (cutLo !== undefined && cutLo !== -Infinity) D.shade(ctx, fn, x, base, height * 0.9, peak, x(dom[0]), x(cutLo), "rgba(255, 138, 112, 0.28)");
      if (cutHi !== undefined && cutHi !== Infinity) D.shade(ctx, fn, x, base, height * 0.9, peak, x(cutHi), x(dom[1]), "rgba(255, 138, 112, 0.28)");
    }

    // Stacked dots: fill the curve's height once enough samples have landed
    var vals = useRaw ? state.raws : state.stats, N = vals.length, r = 5;
    if (N) {
      var ppu = (f.w - 2 * pad) / (dom[1] - dom[0]);
      var refPeak = fn ? peak : 0.4 / ((dom[1] - dom[0]) / 8);
      var capacity = Math.max(N, 1);
      r = Math.sqrt(0.9 * height * ppu / (4 * capacity * refPeak));
      r = Math.max(0.6, Math.min(5, r));
      var bin = 2 * r, heights = {}, statsArr = state.stats, dots = [];
      var maxH = 0;
      for (i = 0; i < N; i++) {
        var px = x(vals[i]);
        if (px < pad || px > f.w - pad) continue;
        var b = Math.floor(px / bin), h = heights[b] = (heights[b] || 0) + 1;
        if (h > maxH) maxH = h;
        dots.push({ i: i, b: b, h: h });
      }
      // Rare spikes (from discrete or capped values) must not leave the panel
      var step = Math.min(bin, height / maxH);
      state.layout = { x: x, bin: bin, step: step, heights: heights, base: base, left: pad, right: f.w - pad };
      ctx.fillStyle = C.dot;
      var hot = [];
      dots.forEach(function (d) {
        d.x = d.b * bin + r;
        d.y = base - (d.h - 0.5) * step;
        if (d.i === state.selected) return;
        if (isBeyond(statsArr[d.i])) { hot.push(d); return; }
        if (r > 1.2) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, r * 0.86, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.fillRect(d.x - r, d.y - step / 2, bin, Math.max(step, 0.7));
        }
      });
      ctx.fillStyle = C.crit;
      hot.forEach(function (d) {
        if (r > 1.2) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, r * 0.86, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.fillRect(d.x - r, d.y - step / 2, bin, Math.max(step, 0.7));
        }
      });
      state.dots = dots;
    } else {
      state.dots = [];
      state.layout = { x: x, bin: 10, step: 10, heights: {}, base: base, left: pad, right: f.w - pad };
    }

    // The curve and the cutoffs sit on top of the dots
    if (fn) D.curve(ctx, fn, x, base, height * 0.9, peak, pad, f.w - pad, { color: C.text, width: 1.8, dash: [6, 4] });
    ctx.strokeStyle = C.crit;
    ctx.lineWidth = 1.5;
    [cutLo, cutHi].forEach(function (v) {
      if (v === undefined || v === -Infinity || v === Infinity) return;
      ctx.beginPath();
      ctx.moveTo(x(v), top);
      ctx.lineTo(x(v), base);
      ctx.stroke();
      // Each label sits outside its cutoff, because a large n brings them close together
      var outward = shared ? v < rn.mean : v < 0 && dist.family !== "f";
      D.text(ctx, D.fmt(v, (Math.abs(v) >= 20 ? 1 : 2) + (rn ? extra(c) : 0)), x(v) + (outward ? -4 : 4), top + 11, { color: C.crit, align: outward ? "right" : "left" });
    });

    // The current sample
    if (state.selected >= 0) {
      var cur = vals[state.selected], cx = x(Math.max(dom[0], Math.min(dom[1], cur)));
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx, top);
      ctx.lineTo(cx, base);
      ctx.stroke();
      ctx.fillStyle = C.accent;
      ctx.beginPath();
      ctx.arc(cx, base - 5, 6, 0, 2 * Math.PI);
      ctx.fill();
    }

    D.xAxis(ctx, x, base, pad, f.w - pad, shared ? 9 : 10);
    D.text(ctx, axisName(c), f.w - pad, top + 3, { align: "right", color: C.text, size: 14, bold: true });
    var capDist = document.getElementById("cap-dist"), beyond = countBeyond();
    capDist.textContent = N ? N.toLocaleString("en-US") + (N === 1 ? " sample" : " samples") + ", " + D.pct(beyond / N) + " beyond the cutoffs" : "No samples yet";
    canvas.setAttribute("aria-label", "Distribution of " + axisName(c) + " across " + N + " samples. Null distribution: " + dist.label + ". " +
      (N ? D.pct(beyond / N) + " of samples fall beyond the cutoffs." : ""));
  }

  function axisName(c) {
    return c.view === "raw" ? c.meta.rawName : c.meta.statName;
  }

  function countBeyond() {
    var n = 0, s = state.stats;
    for (var i = 0; i < s.length; i++) if (isBeyond(s[i])) n++;
    return n;
  }

  // The readout ----

  function row(name, value) { return "<tr><th scope=\"row\">" + name + "</th><td>" + value + "</td></tr>"; }

  // The value the raw statistic estimates, and its true standard error
  function truthOf(c) {
    var k = c.meta.kind, tr = E.truth(c), s = c.sigma, n = c.n;
    if (k === "one") return { value: tr.means[0], se: s / Math.sqrt(n), name: c.step === "1" ? "X" : "M" };
    if (k === "paired") return { value: tr.means[0], se: s / Math.sqrt(n), name: "Gain" };
    if (k === "two") return { value: tr.means[0] - tr.means[1], se: s * Math.sqrt(2 / n), name: "M₁ − M₂" };
    if (k === "pairs") return { value: tr.rho, se: null, name: c.step === "6" ? "r" : "b" };
    if (k === "binary") return { value: tr.beta, se: null, name: "b" };
    return null;
  }

  function row3(name, avg, truthValue) {
    return "<tr><th scope=\"row\">" + name + "</th><td>" + avg + "</td><td>" + truthValue + "</td></tr>";
  }

  function estimates(c, N) {
    var f = D.fmt, t = truthOf(c), rows = "", e = extra(c), dec = t && t.se !== null ? 2 + e : 2, sq = 2 * e;
    if (N < 2) return "";
    if (t) {
      var avg = state.sumM / N, sd = Math.sqrt(Math.max(0, (state.sumM2 - N * avg * avg) / (N - 1)));
      rows += row3(t.name, f(avg, dec), f(t.value, dec));
      rows += row3("SD of " + t.name, f(sd, dec), t.se === null ? "–" : f(t.se, dec));
    }
    if (state.nEst > 1 && c.n > 1) {
      var true2 = f(c.sigma * c.sigma, sq);
      rows += row3(HAT + "² = SS / (n − 1)", f(state.sumVarHat / state.nEst, 1 + sq), true2);
      rows += row3("SS / n", f(state.sumSSn / state.nEst, 1 + sq), true2);
      rows += row3(HAT, f(state.sumSdHat / state.nEst, 2 + e), f(c.sigma, e));
    }
    if (c.meta.kind === "three") {
      var within = c.sigma * c.sigma, tr = E.truth(c), mean3 = S.mean(tr.means);
      var between = within + c.n * S.sumSquares(tr.means, mean3) / 2;
      rows += row3("MS<sub>within</sub>", f(state.sumMsw / N, sq), f(within, sq));
      rows += row3("MS<sub>between</sub>", f(state.sumMsb / N, sq), f(between, sq));
    }
    if (!rows) return "";
    return "<div class=\"extra\"><h2>Estimates and the truth</h2><table class=\"three\"><thead><tr>" +
      "<th scope=\"col\"><span class=\"sr-only\">Quantity</span></th><th scope=\"col\">Average</th><th scope=\"col\">True</th></tr></thead><tbody>" +
      rows + "</tbody></table></div>";
  }

  function readout() {
    var c = state.c, N = state.N, h = "", beyond = countBeyond(), rows = "";
    rows += row("Samples drawn", N.toLocaleString("en-US"));
    rows += row("Beyond the cutoffs", N ? D.pct(beyond / N) : "–");
    if (c.d === 0) rows += row("Expected if H₀ is true", D.pct(c.alpha, 0));
    else if (E.exactPower(c) !== null) rows += row("True power", D.pct(E.exactPower(c)));
    if (N && c.meta.statName === "t" && c.d === 0 && c.meta.kind !== "pairs" && c.meta.kind !== "binary") {
      rows += row("Beyond ±1.96, the normal cutoffs", D.pct(state.beyondZ / N));
    }
    h += "<h2>Across all samples</h2><table><tbody>" + rows + "</tbody></table>";
    h += estimates(c, N);
    document.getElementById("readout").innerHTML = h;
  }

  function render() {
    flushOnResize();
    renderPop();
    renderSample();
    renderDist();
    readout();
  }

  // Positions planned before a resize would be wrong, so land what's in the air
  function flushOnResize() {
    var el = document.getElementById("c-dist"), w = el.clientWidth, h = el.clientHeight;
    if (fx.items.length && state.size && (state.size[0] !== w || state.size[1] !== h)) flushFx();
    state.size = [w, h];
  }

  // Click a dot to see that sample
  function pick(px, py) {
    var best = -1, bestD = Infinity;
    state.dots.forEach(function (d) {
      var dd = (d.x - px) * (d.x - px) + (d.y - py) * (d.y - py);
      if (dd < bestD) { bestD = dd; best = d.i; }
    });
    var offset = state.N - state.samples.length;
    if (best >= offset) {
      state.selected = best;
      render();
    }
  }

  function browse(delta) {
    var offset = state.N - state.samples.length, v = state.selected + delta;
    if (state.N && v >= offset && v < state.N) {
      state.selected = v;
      render();
    }
  }

  root.SimBlueprint = {
    state: state, configure: configure, draw: draw, render: render, pick: pick, browse: browse,
    clear: function () { resetDraws(); render(); },
    // For tests: run one animation frame at a chosen time
    fxStep: step, fxItems: function () { return fx.items; }, fxCancelLoop: function () {
      if (fx.raf) root.cancelAnimationFrame(fx.raf);
      fx.raf = 0;
    }
  };
})(typeof window !== "undefined" ? window : this);
