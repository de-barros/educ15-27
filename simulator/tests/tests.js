// Checks stats.js and engine.js against R, and checks that the simulation
// behaves as theory says. Open tests/index.html through a local server.
(function () {
  var S = window.SimStats, E = window.SimEngine, R = window.REF;
  var pass = 0, fail = 0, lines = [];

  function near(name, got, want, tol) {
    tol = tol === undefined ? 1e-8 : tol;
    if (Math.abs(got - want) <= tol) {
      pass++;
    } else {
      fail++;
      lines.push("FAIL " + name + ": got " + got + ", want " + want + " (tol " + tol + ")");
    }
  }

  function ok(name, cond, detail) {
    if (cond) {
      pass++;
    } else {
      fail++;
      lines.push("FAIL " + name + (detail ? ": " + detail : ""));
    }
  }

  // Distribution functions against R ----

  R.norm.forEach(function (v) {
    near("pnorm " + v.q, S.normCdf(v.q), v.p, 1e-10);
    near("dnorm " + v.q, S.normPdf(v.q), v.d, 1e-12);
  });
  R.normq.forEach(function (v) { near("qnorm " + v.p, S.normQuantile(v.p), v.q, 1e-8); });
  R.t.forEach(function (v) {
    near("pt " + v.q + "," + v.df, S.tCdf(v.q, v.df), v.p, 1e-9);
    near("dt " + v.q + "," + v.df, S.tPdf(v.q, v.df), v.d, 1e-9);
  });
  R.tq.forEach(function (v) { near("qt " + v.p + "," + v.df, S.tQuantile(v.p, v.df), v.q, 1e-7); });
  R.f.forEach(function (v) {
    near("pf " + v.q, S.fCdf(v.q, v.d1, v.d2), v.p, 1e-9);
    near("df " + v.q, S.fPdf(v.q, v.d1, v.d2), v.d, 1e-9);
  });
  R.fq.forEach(function (v) { near("qf " + v.p, S.fQuantile(v.p, v.d1, v.d2), v.q, 1e-7); });

  // Test statistics against R ----

  var D = R.data, one = S.tOneSample(D.x, 10);
  near("one t", one.t, R.one.t); near("one df", one.df, R.one.df);
  near("one se", one.se, R.one.se); near("one sd", one.sdHat, R.one.sd); near("one M", one.M, R.one.M);
  var two = S.tTwoSample(D.a, D.b);
  near("two t", two.t, R.two.t); near("two df", two.df, R.two.df); near("two se", two.se, R.two.se);
  var aov = S.fOneWay(D.g);
  near("aov F", aov.F, R.aov.F); near("aov ssb", aov.ssb, R.aov.ssb); near("aov ssw", aov.ssw, R.aov.ssw);
  near("aov dfb", aov.dfb, R.aov.dfb); near("aov dfw", aov.dfw, R.aov.dfw);
  var reg = S.bivariate(D.x, D.y);
  near("reg r", reg.r, R.reg.r); near("reg a", reg.a, R.reg.a); near("reg b", reg.b, R.reg.b);
  near("reg seB", reg.seB, R.reg.seB); near("reg t", reg.t, R.reg.t);
  near("reg r2", reg.r2, R.reg.r2); near("reg df", reg.df, R.reg.df);

  R.power.forEach(function (v) {
    near("power two", E.powerZ(v.d, v.n, v.alpha, "two").power, v.two, 1e-9);
    near("power one", E.powerZ(v.d, v.n, v.alpha, "one").power, v.one, 1e-9);
  });

  // Your 2024 slides, as a sanity check on the power view
  near("04-01 power", E.powerZ(0.89, 10, 0.05, "two").power, 0.80, 0.01);
  near("04-01 alpha .10", E.powerZ(0.89, 10, 0.10, "two").power, 0.88, 0.01);
  near("04-01 one-sided", E.powerZ(0.89, 10, 0.05, "one").power, 0.88, 0.01);
  near("04-01 n = 15", E.powerZ(0.89, 15, 0.05, "two").power, 0.93, 0.01);

  // Every population must have mean 0, SD 1 and a density that integrates to 1 ----

  Object.keys(E.POPULATIONS).forEach(function (key) {
    var p = E.POPULATIONS[key], rng = E.makeRng(11), N = 400000, s = 0, s2 = 0, area = 0, m1 = 0, m2 = 0;
    for (var i = 0; i < N; i++) { var v = p.draw(rng); s += v; s2 += v * v; }
    near(key + " sample mean", s / N, 0, 0.01);
    near(key + " sample SD", Math.sqrt(s2 / N), 1, 0.01);
    for (var z = -10; z < 10; z += 0.001) {
      var f = p.pdf(z);
      area += f * 0.001; m1 += z * f * 0.001; m2 += z * z * f * 0.001;
    }
    near(key + " density area", area, 1, 0.002);
    near(key + " density mean", m1, 0, 0.002);
    near(key + " density var", m2, 1, 0.005);
  });

  // Type I error: with no effect, about alpha of samples should reject ----

  function rejectRate(opts, N) {
    var c = E.config(opts), rng = E.makeRng(2027), dist = E.nullDist(c), cr = E.critical(c, dist), hits = 0;
    for (var i = 0; i < N; i++) {
      var s = E.drawSample(c, rng);
      if (s.stat < cr.lo || s.stat > cr.hi) hits++;
    }
    return hits / N;
  }

  var N = 40000, tol = 3.5 * Math.sqrt(0.05 * 0.95 / N);
  [["2", 25], ["3", 5], ["3", 25], ["3p", 8], ["4", 6], ["4", 30], ["5", 5], ["5", 20], ["6", 8], ["6", 40], ["7", 8], ["7", 40], ["7b", 10]].forEach(function (v) {
    near("Type I step " + v[0] + " n=" + v[1], rejectRate({ step: v[0], n: v[1], d: 0 }, N), 0.05, tol);
  });
  near("Type I one-tailed", rejectRate({ step: "3", n: 12, d: 0, tails: "right" }, N), 0.05, tol);
  near("Type I alpha .01", rejectRate({ step: "4", n: 12, d: 0, alpha: 0.01 }, N), 0.01, 3.5 * Math.sqrt(0.01 * 0.99 / N));

  // The scale of the test: a new mean and SD must not change any test statistic ----

  ["1", "2", "3", "3p", "4", "5"].forEach(function (step) {
    var base = E.config({ step: step, d: 0.4 }), other = E.config({ step: step, d: 0.4, mu0: 3, sigma: 0.5 });
    var r1 = E.makeRng(11), r2 = E.makeRng(11), worst = 0;
    for (var i = 0; i < 200; i++) worst = Math.max(worst, Math.abs(E.drawSample(base, r1).stat - E.drawSample(other, r2).stat));
    near("Scale doesn't change step " + step, worst, 0, 1e-7);
  });
  near("Scale: true mean", E.truth(E.config({ step: "2", d: 0.5, mu0: 500, sigma: 100 })).means[0], 550, 1e-12);
  near("Scale: standard error", E.rawNull(E.config({ step: "2", n: 25, mu0: 500, sigma: 100 })).sd, 20, 1e-12);
  near("Scale: SD floor", E.config({ sigma: 0 }).sigma, 0.01, 1e-12);

  // The intercept: a true intercept moves a and nothing else ----

  ["7", "7b"].forEach(function (step) {
    var base = E.config({ step: step, n: 20, d: 0.5 }), other = E.config({ step: step, n: 20, d: 0.5, a0: 8.87 });
    var r1 = E.makeRng(12), r2 = E.makeRng(12), worst = 0, sumA = 0;
    for (var i = 0; i < 4000; i++) {
      var s1 = E.drawSample(base, r1), s2 = E.drawSample(other, r2);
      worst = Math.max(worst, Math.abs(s1.b - s2.b), Math.abs(s1.stat - s2.stat));
      sumA += s2.a;
    }
    near("Intercept leaves the slope alone, step " + step, worst, 0, 1e-9);
    near("Average a finds the intercept, step " + step, sumA / 4000, 8.87, 0.03);
  });
  near("Correlation ignores the intercept", E.truth(E.config({ step: "6", a0: 5 })).intercept, 0, 1e-12);

  // A slope has no limit, but a correlation does ----

  [["7", 2.5], ["7", -4], ["7b", 3]].forEach(function (v) {
    var cfg = E.config({ step: v[0], n: 30, d: v[1], a0: 1 }), r3 = E.makeRng(13), sumB = 0, sumA2 = 0, sumRes = 0;
    for (var i = 0; i < 4000; i++) {
      var sm = E.drawSample(cfg, r3), res = S.bivariate(sm.x, sm.y);
      sumB += sm.b; sumA2 += sm.a;
      sumRes += res.ssres / 28;
    }
    near("Average b finds slope " + v[1] + ", step " + v[0], sumB / 4000, v[1], 0.02);
    near("Average a with slope " + v[1] + ", step " + v[0], sumA2 / 4000, 1, 0.03);
    near("Spread around the line, slope " + v[1], sumRes / 4000, 1, 0.03);
  });
  near("Correlation stays below 1", E.truth(E.config({ step: "6", d: 3 })).rho, 0.99, 1e-12);

  // The largest samples: cutoffs from R's qt() and qf() ----

  [["3", 1.971957], ["3p", 1.971957], ["4", 1.965942], ["6", 1.972017], ["7", 1.972017], ["7b", 1.972017]].forEach(function (v) {
    var cfg = E.config({ step: v[0], n: 200 });
    near("Sample size 200 allowed, step " + v[0], cfg.n, 200, 1e-9);
    near("Cutoff at n = 200, step " + v[0], E.critical(cfg, E.nullDist(cfg)).hi, v[1], 1e-5);
  });
  var f200 = E.config({ step: "5", n: 200 });
  near("F cutoff at n = 200", E.critical(f200, E.nullDist(f200)).hi, 3.010815, 1e-5);

  // Power: the z-steps must match the exact formula ----

  var pw = E.config({ step: "2", n: 10, d: 0.89 });
  near("simulated power", rejectRate({ step: "2", n: 10, d: 0.89 }, N), E.exactPower(pw), 0.01);
  ok("power rises with n", rejectRate({ step: "4", n: 30, d: 0.5 }, N) > rejectRate({ step: "4", n: 10, d: 0.5 }, N));

  // The central limit theorem: a skewed population still gives normal-looking means ----

  var clt = E.config({ step: "2", n: 50, pop: "rightskew" }), rng = E.makeRng(5), zs = [];
  for (var i = 0; i < N; i++) zs.push(E.drawSample(clt, rng).stat);
  var m = S.mean(zs), sd = Math.sqrt(S.sumSquares(zs, m) / (N - 1));
  near("CLT mean", m, 0, 0.03);
  near("CLT SD", sd, 1, 0.03);

  // Steps 6 and 7 must give the same t for the same data ----

  // Slope ρ / √(1 − ρ²), with spread 1 around the line, is the same population as ρ
  var c6 = E.config({ step: "6", n: 20, d: 0.3 }), c7 = E.config({ step: "7", n: 20, d: 0.3 / Math.sqrt(1 - 0.09) });
  var r6 = E.makeRng(9), r7 = E.makeRng(9), same = true, sameInSample = true;
  for (var j = 0; j < 200; j++) {
    var s6 = E.drawSample(c6, r6), s7 = E.drawSample(c7, r7);
    if (Math.abs(s6.stat - s7.stat) > 1e-7) same = false;
    if (Math.abs(s7.r * Math.sqrt(18 / (1 - s7.r * s7.r)) - s7.stat) > 1e-7) sameInSample = false;
  }
  ok("r and b give the same t", same);
  ok("t from r matches t from b in one sample", sameInSample);

  // A yes/no predictor makes the slope the difference in group means ----

  var cb = E.config({ step: "7b", n: 20, d: 0.4 }), sb = E.drawSample(cb, E.makeRng(3));
  var g1 = sb.y.filter(function (v, i) { return sb.x[i] === 1; }), g0 = sb.y.filter(function (v, i) { return sb.x[i] === 0; });
  near("b equals the difference", sb.b, S.mean(g1) - S.mean(g0), 1e-9);
  near("t matches the two-sample t", sb.stat, S.tTwoSample(g1, g0).t, 1e-9);
  var cb2 = E.config({ step: "7b", n: 40, d: 0.8 }), rb2 = E.makeRng(4), sumB = 0;
  for (var q = 0; q < 8000; q++) sumB += E.drawSample(cb2, rb2).b;
  near("the slope averages to the true beta", sumB / 8000, 0.8, 0.02);

  // The F-ratio for two groups would equal t squared ----

  near("F = t squared", S.fOneWay([D.a, D.b]).F, Math.pow(S.tTwoSample(D.a, D.b).t, 2), 1e-9);

  // Confidence intervals cover at their nominal rate ----

  function coverage(opts) {
    var rg = E.makeRng(21), hit = 0;
    for (var i = 0; i < N; i++) if (E.drawInterval(opts, rg).covers) hit++;
    return hit / N;
  }
  near("CI coverage, t", coverage({ n: 8, mu0: 100, sigma: 15, level: 0.95, known: false }), 0.95, tol);
  near("CI coverage, z", coverage({ n: 8, mu0: 100, sigma: 15, level: 0.90, known: true }), 0.90, 3.5 * Math.sqrt(0.09 / N));

  // Presets must reproduce exactly ----

  var ra = E.makeRng(7), rb = E.makeRng(7), c = E.config({ step: "3", n: 10 });
  near("same seed, same sample", E.drawSample(c, ra).stat, E.drawSample(c, rb).stat, 0);

  // The config must respect each step's limits ----

  ok("step 1 forces n = 1", E.config({ step: "1", n: 50 }).n === 1);
  ok("step 5 forces the upper tail", E.config({ step: "5", tails: "two" }).tails === "right");
  ok("step 3 has no raw view", E.config({ step: "3", view: "raw" }).view === "stat");

  var summary = document.getElementById("summary");
  summary.textContent = pass + " passed, " + fail + " failed";
  summary.className = fail ? "fail" : "pass";
  document.getElementById("log").textContent = lines.join("\n");
  window.TEST_RESULT = { pass: pass, fail: fail, lines: lines };
})();
