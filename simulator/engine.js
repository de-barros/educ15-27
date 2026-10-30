// Simulation engine for the blueprint: one population, one sample, one statistic,
// then the distribution of that statistic across many samples.
// No drawing here, so simulator/tests/ can check it without any interface.
(function (root) {
  "use strict";
  var S = root.SimStats;

  // Seeded generator (mulberry32), so a slide's preset always looks the same
  function makeRng(seed) {
    var a = seed >>> 0, spare = null;
    function uniform() {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function normal() {
      if (spare !== null) {
        var v = spare;
        spare = null;
        return v;
      }
      var u1 = 1 - uniform(), u2 = uniform();
      var r = Math.sqrt(-2 * Math.log(u1));
      spare = r * Math.sin(2 * Math.PI * u2);
      return r * Math.cos(2 * Math.PI * u2);
    }
    return { uniform: uniform, normal: normal };
  }

  // Populations, each standardized to mean 0 and SD 1 ----

  var BIMODAL_SHIFT = 0.9, BIMODAL_SD = Math.sqrt(1 - BIMODAL_SHIFT * BIMODAL_SHIFT);

  var POPULATIONS = {
    normal: {
      label: "Normal",
      draw: function (rng) { return rng.normal(); },
      pdf: function (z) { return S.normPdf(z); }
    },
    rightskew: {
      label: "Skewed right",
      // Gamma(2, 1), which is the sum of two exponentials
      draw: function (rng) {
        return (-Math.log(1 - rng.uniform()) - Math.log(1 - rng.uniform()) - 2) / Math.SQRT2;
      },
      pdf: function (z) {
        var g = z * Math.SQRT2 + 2;
        return g <= 0 ? 0 : Math.SQRT2 * g * Math.exp(-g);
      }
    },
    leftskew: {
      label: "Skewed left",
      draw: function (rng) {
        return -(-Math.log(1 - rng.uniform()) - Math.log(1 - rng.uniform()) - 2) / Math.SQRT2;
      },
      pdf: function (z) {
        var g = -z * Math.SQRT2 + 2;
        return g <= 0 ? 0 : Math.SQRT2 * g * Math.exp(-g);
      }
    },
    bimodal: {
      label: "Two peaks",
      draw: function (rng) {
        var c = rng.uniform() < 0.5 ? -BIMODAL_SHIFT : BIMODAL_SHIFT;
        return c + BIMODAL_SD * rng.normal();
      },
      pdf: function (z) {
        return 0.5 * S.normPdf(z, -BIMODAL_SHIFT, BIMODAL_SD) + 0.5 * S.normPdf(z, BIMODAL_SHIFT, BIMODAL_SD);
      }
    },
    uniform: {
      label: "Flat",
      draw: function (rng) { return (rng.uniform() - 0.5) * 2 * Math.sqrt(3); },
      pdf: function (z) { return Math.abs(z) <= Math.sqrt(3) ? 1 / (2 * Math.sqrt(3)) : 0; }
    }
  };

  // The steps of the blueprint ----

  var STEPS = {
    "1": { n: 1, nMin: 1, nMax: 1, kind: "one", statName: "z", rawName: "X", views: ["raw", "stat"],
      title: "1. z-score for a single data point" },
    "2": { n: 10, nMin: 1, nMax: 200, kind: "one", statName: "z", rawName: "M", views: ["raw", "stat"],
      title: "2. z-score for a sample mean" },
    "3": { n: 10, nMin: 2, nMax: 200, kind: "one", statName: "t", rawName: "M", views: ["stat"],
      title: "3. t-score for a sample mean" },
    "3p": { n: 10, nMin: 2, nMax: 200, kind: "paired", statName: "t", rawName: "gain", views: ["stat"],
      title: "3. t-score for gains (paired t-test)" },
    "4": { n: 10, nMin: 2, nMax: 200, kind: "two", statName: "t", rawName: "M₁ − M₂", views: ["raw", "stat"],
      title: "4. t-score for a difference between two means" },
    "5": { n: 10, nMin: 2, nMax: 200, kind: "three", statName: "F", rawName: "F", views: ["stat"],
      title: "5. F-ratio for three group means" },
    "6": { n: 20, nMin: 4, nMax: 200, kind: "pairs", statName: "t", rawName: "r", views: ["raw", "stat"],
      title: "6. Correlation r" },
    "7": { n: 20, nMin: 4, nMax: 200, kind: "pairs", statName: "t", rawName: "b", views: ["raw", "stat"],
      title: "7. Regression slope b" },
    "7b": { n: 20, nMin: 4, nMax: 200, kind: "binary", statName: "t", rawName: "b", views: ["raw", "stat"],
      title: "7. Regression slope b for a yes/no predictor" }
  };

  var DEFAULTS = { step: "2", n: 10, d: 0, mu0: 100, sigma: 15, a0: 0, pop: "normal", alpha: 0.05, tails: "two", view: "stat" };

  function config(opts) {
    var c = {}, k;
    for (k in DEFAULTS) c[k] = DEFAULTS[k];
    for (k in opts) if (opts[k] !== undefined) c[k] = opts[k];
    var st = STEPS[c.step] || STEPS["2"];
    c.step = STEPS[c.step] ? c.step : "2";
    c.n = Math.max(st.nMin, Math.min(st.nMax, Math.round(c.n)));
    c.meta = st;
    c.mu0 = Math.max(-10000, Math.min(10000, c.mu0));
    c.sigma = Math.max(0.01, Math.min(10000, c.sigma));
    c.a0 = Math.max(-1000, Math.min(1000, c.a0));
    c.d = Math.max(-1000, Math.min(1000, c.d));
    if (st.views.indexOf(c.view) < 0) c.view = st.views[0];
    // An F test only has an upper tail
    if (st.kind === "three") c.tails = "right";
    return c;
  }

  // What the test compares against ----

  function nullDist(c) {
    var n = c.n, k = c.meta.kind, df;
    if (c.step === "1" || c.step === "2") return { family: "normal", label: "normal" };
    if (k === "one" || k === "paired") df = n - 1;
    else if (k === "two") df = 2 * n - 2;
    else if (k === "three") return { family: "f", d1: 2, d2: 3 * n - 3, label: "F(2, " + (3 * n - 3) + ")" };
    else df = n - 2;
    return { family: "t", df: df, label: "t(" + df + ")" };
  }

  function pdf(dist, x) {
    if (dist.family === "normal") return S.normPdf(x);
    if (dist.family === "t") return S.tPdf(x, dist.df);
    return S.fPdf(x, dist.d1, dist.d2);
  }

  function cdf(dist, x) {
    if (dist.family === "normal") return S.normCdf(x);
    if (dist.family === "t") return S.tCdf(x, dist.df);
    return S.fCdf(x, dist.d1, dist.d2);
  }

  function quantile(dist, p) {
    if (dist.family === "normal") return S.normQuantile(p);
    if (dist.family === "t") return S.tQuantile(p, dist.df);
    return S.fQuantile(p, dist.d1, dist.d2);
  }

  function critical(c, dist) {
    if (c.tails === "right") return { lo: -Infinity, hi: quantile(dist, 1 - c.alpha) };
    if (c.tails === "left") return { lo: quantile(dist, c.alpha), hi: Infinity };
    return { lo: quantile(dist, c.alpha / 2), hi: quantile(dist, 1 - c.alpha / 2) };
  }

  function pValue(c, dist, stat) {
    if (c.tails === "right") return 1 - cdf(dist, stat);
    if (c.tails === "left") return cdf(dist, stat);
    var lower = cdf(dist, stat);
    return 2 * Math.min(lower, 1 - lower);
  }

  // Null distribution on the raw scale, when it has a simple form
  function rawNull(c) {
    var n = c.n, s = c.sigma;
    if (c.step === "1" || c.step === "2") {
      return { mean: c.mu0, sd: s / Math.sqrt(n), scale: function (x) { return (x - c.mu0) / (s / Math.sqrt(n)); } };
    }
    if (c.step === "4") {
      var sd = s * Math.sqrt(2 / n);
      return { mean: 0, sd: sd, scale: function (x) { return x / sd; } };
    }
    return null;
  }

  // One sample ----

  function population(c) { return POPULATIONS[c.pop] || POPULATIONS.normal; }

  function drawGroup(c, rng, n, mean) {
    var p = population(c), out = new Array(n);
    for (var i = 0; i < n; i++) out[i] = mean + c.sigma * p.draw(rng);
    return out;
  }

  // The true group means under the chosen effect size d
  function truth(c) {
    var k = c.meta.kind, d = c.d * c.sigma, m = c.mu0;
    if (k === "one") return { means: [m + d] };
    if (k === "paired") return { means: [d] };
    if (k === "two") return { means: [m + d, m] };
    if (k === "three") return { means: [m - d / 2, m, m + d / 2] };
    // A slope can be any size. Only a correlation stops at 1.
    if (k === "binary" || c.step === "7") return { beta: c.d, intercept: c.a0 };
    return { rho: Math.max(-0.99, Math.min(0.99, c.d)), intercept: 0 };
  }

  function drawSample(c, rng) {
    var k = c.meta.kind, tr = truth(c), n = c.n, res, dist = nullDist(c), s = { kind: k };
    if (k === "one") {
      s.x = drawGroup(c, rng, n, tr.means[0]);
      s.M = S.mean(s.x);
      if (n > 1) {
        s.ss = S.sumSquares(s.x, s.M);
        s.sdHat = Math.sqrt(s.ss / (n - 1));
      }
      if (c.step === "3") {
        res = S.tOneSample(s.x, c.mu0);
        s.sdHat = res.sdHat; s.se = res.se; s.stat = res.t;
      } else {
        s.se = c.sigma / Math.sqrt(n);
        s.stat = (s.M - c.mu0) / s.se;
      }
      s.raw = s.M;
    } else if (k === "paired") {
      s.x = drawGroup(c, rng, n, tr.means[0]);
      res = S.tOneSample(s.x, 0);
      s.M = res.M; s.sdHat = res.sdHat; s.se = res.se; s.stat = res.t; s.raw = res.M;
      s.ss = S.sumSquares(s.x, s.M);
    } else if (k === "two") {
      s.a = drawGroup(c, rng, n, tr.means[0]);
      s.b = drawGroup(c, rng, n, tr.means[1]);
      res = S.tTwoSample(s.a, s.b);
      s.M1 = res.M1; s.M2 = res.M2; s.pooled = res.pooled; s.se = res.se; s.stat = res.t; s.raw = res.diff;
    } else if (k === "three") {
      s.groups = [drawGroup(c, rng, n, tr.means[0]), drawGroup(c, rng, n, tr.means[1]), drawGroup(c, rng, n, tr.means[2])];
      res = S.fOneWay(s.groups);
      s.means = s.groups.map(S.mean);
      s.msb = res.msb; s.msw = res.msw; s.stat = res.F; s.raw = res.F;
    } else {
      var x = new Array(n), y = new Array(n), rho = tr.rho, e = Math.sqrt(1 - rho * rho);
      for (var i = 0; i < n; i++) {
        x[i] = k === "binary" ? (i < n / 2 ? 0 : 1) : rng.normal();
        // The spread around a regression line stays at 1, whatever the slope
        y[i] = tr.beta === undefined ? rho * x[i] + e * rng.normal() : tr.intercept + tr.beta * x[i] + rng.normal();
      }
      res = S.bivariate(x, y);
      s.x = x; s.y = y; s.r = res.r; s.b = res.b; s.a = res.a; s.seB = res.seB;
      s.stat = res.t;
      s.raw = c.step === "6" ? res.r : res.b;
    }
    s.p = pValue(c, dist, s.stat);
    return s;
  }

  // Exact power for the z-steps; the t and F steps report the simulated share
  function exactPower(c) {
    if (c.step !== "1" && c.step !== "2") return null;
    var se = 1 / Math.sqrt(c.n), shift = c.d / se, cr = critical(c, { family: "normal" }), p = 0;
    if (cr.hi !== Infinity) p += 1 - S.normCdf(cr.hi - shift);
    if (cr.lo !== -Infinity) p += S.normCdf(cr.lo - shift);
    return p;
  }

  // The power view: a test of one mean against H0, with d in SD units ----

  function powerZ(d, n, alpha, tails) {
    var se = 1 / Math.sqrt(n), shift = d / se, zc, power;
    if (tails === "one") {
      zc = S.normQuantile(1 - alpha);
      power = 1 - S.normCdf(zc - shift);
    } else {
      zc = S.normQuantile(1 - alpha / 2);
      power = 1 - S.normCdf(zc - shift) + S.normCdf(-zc - shift);
    }
    return { se: se, zc: zc, power: power, beta: 1 - power, critD: zc * se };
  }

  // The confidence interval view ----

  function drawInterval(opts, rng) {
    var n = opts.n, mu = opts.mu0, sd = opts.sigma, x = new Array(n);
    for (var i = 0; i < n; i++) x[i] = mu + sd * rng.normal();
    var m = S.mean(x), half;
    if (opts.known) {
      half = S.normQuantile(1 - (1 - opts.level) / 2) * sd / Math.sqrt(n);
    } else {
      half = S.tQuantile(1 - (1 - opts.level) / 2, n - 1) * Math.sqrt(S.sumSquares(x, m) / (n - 1)) / Math.sqrt(n);
    }
    return { M: m, lo: m - half, hi: m + half, covers: m - half <= mu && mu <= m + half };
  }

  root.SimEngine = {
    makeRng: makeRng, POPULATIONS: POPULATIONS, STEPS: STEPS, config: config, truth: truth,
    nullDist: nullDist, pdf: pdf, cdf: cdf, quantile: quantile, critical: critical, pValue: pValue,
    rawNull: rawNull, population: population, drawSample: drawSample, exactPower: exactPower,
    powerZ: powerZ, drawInterval: drawInterval
  };
})(typeof window !== "undefined" ? window : this);
