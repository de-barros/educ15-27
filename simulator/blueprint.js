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
    state.samples = []; state.stats = []; state.raws = [];
    state.N = 0; state.selected = -1; state.dots = [];
    state.sumM = 0; state.sumM2 = 0; state.sumSSn = 0; state.sumVarHat = 0; state.sumSdHat = 0;
    state.nEst = 0; state.beyondZ = 0; state.sumMsw = 0; state.sumMsb = 0;
    state.rng = E.makeRng(state.seed);
  }

  // Fix the axis of panel 3 from a pilot run, so it doesn't jump around as dots land
  function setRange() {
    var c = state.c, rng = E.makeRng(99), vals = [], i;
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
    var c = E.config(Object.assign({}, old.step ? { step: old.step, n: old.n, d: old.d, pop: old.pop, alpha: old.alpha, tails: old.tails, view: old.view } : {}, opts));
    state.c = c;
    // Scatter plots need height, so their two panels share a row
    document.querySelector("#view-blueprint .stage").classList.toggle("pairs", c.meta.kind === "pairs" || c.meta.kind === "binary");
    state.dist = E.nullDist(c);
    state.crit = E.critical(c, state.dist);
    setRange();
    resetDraws();
  }

  function draw(count, quiet) {
    var c = state.c, i, s, zCut = 1.96;
    for (i = 0; i < count; i++) {
      s = E.drawSample(c, state.rng);
      state.stats.push(s.stat);
      state.raws.push(s.raw);
      state.N++;
      if (Math.abs(s.stat) > zCut) state.beyondZ++;
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
    }
    state.selected = state.N - 1;
    if (count === 1 && !quiet && !reduced()) animate(); else render();
  }

  function animate() {
    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      state.anim = Math.min(1, (ts - start) / 450);
      renderSample();
      if (state.anim < 1) {
        root.requestAnimationFrame(frame);
      } else {
        state.anim = 0;
        render();
      }
    }
    state.anim = 0.001;
    renderDist();
    readout();
    root.requestAnimationFrame(frame);
  }

  function shownSample() {
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

    var bits;
    if (state.hide) bits = "We don't get to see this. We only have the sample.";
    else if (k === "one") bits = MU + " = " + D.fmt(truth.means[0], 1) + ", " + SIGMA + " = " + c.sigma + (c.d !== 0 ? ". Dashed: what H₀ claims (" + MU + " = " + c.mu0 + ")" : "");
    else if (k === "paired") bits = "Gains: " + MU + " = " + D.fmt(truth.means[0], 1) + ", " + SIGMA + " = " + c.sigma + (c.d !== 0 ? ". Dashed: H₀ (no gain)" : "");
    else if (k === "two") bits = MU + "₁ = " + D.fmt(truth.means[0], 1) + ", " + MU + "₂ = " + D.fmt(truth.means[1], 1) + ", " + SIGMA + " = " + c.sigma;
    else if (k === "three") bits = "Group means " + truth.means.map(function (m) { return D.fmt(m, 1); }).join(", ") + ", " + SIGMA + " = " + c.sigma;
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
    if (!s) {
      D.text(ctx, "Press +1 to draw a sample", f.w / 2, f.h / 2, { size: 16, align: "center", base: "middle", color: C.text });
      cap.textContent = "";
      canvas.setAttribute("aria-label", "No sample drawn yet.");
      return;
    }
    var drop = state.anim ? 1 - Math.pow(1 - state.anim, 3) : 1;

    if (k === "pairs" || k === "binary") {
      renderScatter(ctx, f, c, s, drop);
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
        g.forEach(function (v, j) {
          var fall = (1 - drop) * (y + 10) * (1 - (j % 7) / 14);
          ctx.beginPath();
          ctx.arc(x(v), y - fall, c.n > 60 ? 3 : 4.5, 0, 2 * Math.PI);
          ctx.fill();
        });
        if (drop === 1 && c.n > 1) {
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

  function renderScatter(ctx, f, c, s, drop) {
    var left = 40, right = f.w - 10, top = 6, base = f.h - 22, binary = c.meta.kind === "binary";
    var xs = s.x, ys = s.y;
    var x = binary ? D.scale(-0.5, 1.5, left, right) : D.scale(-3.2, 3.2, left, right);
    var y = binary ? D.scale(-3.6 + Math.min(0, c.d), 3.6 + Math.max(0, c.d), base, top) : D.scale(-3.6, 3.6, base, top);
    ctx.fillStyle = C.dot;
    xs.forEach(function (v, i) {
      ctx.beginPath();
      ctx.arc(x(v), y(ys[i]) - (1 - drop) * 30, 4, 0, 2 * Math.PI);
      ctx.fill();
    });
    if (drop === 1) {
      var x0 = binary ? 0 : -3.2, x1 = binary ? 1 : 3.2;
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x(x0), y(s.a + s.b * x0));
      ctx.lineTo(x(x1), y(s.a + s.b * x1));
      ctx.stroke();
    }
    D.yAxis(ctx, y, left, base, top, 4);
    if (binary) {
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.moveTo(left, base + 0.5);
      ctx.lineTo(right, base + 0.5);
      ctx.stroke();
      D.text(ctx, "X = 0", x(0), base + 15, { align: "center" });
      D.text(ctx, "X = 1", x(1), base + 15, { align: "center" });
    } else {
      D.xAxis(ctx, x, base, left, right, 8);
    }
  }

  function sampleText(c, s) {
    var f = D.fmt, k = c.meta.kind, out = [];
    function hatM() { return "σ̂<sub>M</sub>"; }
    if (c.step === "1") {
      out.push("X = " + f(s.M, 1), "z = (X − " + MU + ") / " + SIGMA + " = <b>" + f(s.stat) + "</b>");
    } else if (c.step === "2") {
      out.push("M = " + f(s.M, 1));
      if (s.sdHat !== undefined) out.push(HAT + " = " + f(s.sdHat, 1));
      out.push(SIGMA + "<sub>M</sub> = " + f(s.se), "z = <b>" + f(s.stat) + "</b>");
    } else if (k === "one" || k === "paired") {
      out.push("M = " + f(s.M, 1), HAT + " = " + f(s.sdHat, 1), hatM() + " = " + f(s.se), "t(" + (c.n - 1) + ") = <b>" + f(s.stat) + "</b>");
    } else if (k === "two") {
      out.push("M₁ = " + f(s.M1, 1), "M₂ = " + f(s.M2, 1), "M₁ − M₂ = " + f(s.raw, 1),
        "σ̂<sub>M₁−M₂</sub> = " + f(s.se), "t(" + (2 * c.n - 2) + ") = <b>" + f(s.stat) + "</b>");
    } else if (k === "three") {
      out.push("Means " + s.means.map(function (m) { return f(m, 1); }).join(", "), "MS<sub>between</sub> = " + f(s.msb, 0),
        "MS<sub>within</sub> = " + f(s.msw, 0), "F(2, " + (3 * c.n - 3) + ") = <b>" + f(s.stat) + "</b>");
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
    var fn = null, cutLo, cutHi;

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
      D.text(ctx, D.fmt(v, Math.abs(v) >= 20 ? 1 : 2), x(v) + (v < 0 && dist.family !== "f" ? -4 : 4), top + 11, { color: C.crit, align: v < 0 && dist.family !== "f" ? "right" : "left" });
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

    D.xAxis(ctx, x, base, pad, f.w - pad, 10);
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
    var f = D.fmt, t = truthOf(c), rows = "";
    if (N < 2) return "";
    if (t) {
      var avg = state.sumM / N, sd = Math.sqrt(Math.max(0, (state.sumM2 - N * avg * avg) / (N - 1)));
      rows += row3(t.name, f(avg), f(t.value));
      rows += row3("SD of " + t.name, f(sd), t.se === null ? "–" : f(t.se));
    }
    if (state.nEst > 1 && c.n > 1) {
      var true2 = f(c.sigma * c.sigma, 0);
      rows += row3(HAT + "² = SS / (n − 1)", f(state.sumVarHat / state.nEst, 1), true2);
      rows += row3("SS / n", f(state.sumSSn / state.nEst, 1), true2);
      rows += row3(HAT, f(state.sumSdHat / state.nEst), f(c.sigma, 0));
    }
    if (c.meta.kind === "three") {
      var within = c.sigma * c.sigma, tr = E.truth(c), mean3 = S.mean(tr.means);
      var between = within + c.n * S.sumSquares(tr.means, mean3) / 2;
      rows += row3("MS<sub>within</sub>", f(state.sumMsw / N, 0), f(within, 0));
      rows += row3("MS<sub>between</sub>", f(state.sumMsb / N, 0), f(between, 0));
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
    renderPop();
    renderSample();
    renderDist();
    readout();
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
    clear: function () { resetDraws(); render(); }
  };
})(typeof window !== "undefined" ? window : this);
