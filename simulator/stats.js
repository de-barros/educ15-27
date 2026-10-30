// Distribution functions and test statistics for the EDUC 15 simulator.
// No dependencies, so the tool runs anywhere a browser does.
// simulator/tests/ checks all of this against R.
(function (root) {
  "use strict";

  // Normal ----

  function normPdf(x, mu, sd) {
    mu = mu === undefined ? 0 : mu;
    sd = sd === undefined ? 1 : sd;
    var z = (x - mu) / sd;
    return Math.exp(-0.5 * z * z) / (sd * Math.sqrt(2 * Math.PI));
  }

  // West (2009), "Better approximations to cumulative normal functions"
  function normCdf(x) {
    var a = Math.abs(x), c;
    if (a > 37) {
      c = 0;
    } else {
      var e = Math.exp(-a * a / 2), b;
      if (a < 7.07106781186547) {
        b = 3.52624965998911e-02 * a + 0.700383064443688;
        b = b * a + 6.37396220353165;
        b = b * a + 33.912866078383;
        b = b * a + 112.079291497871;
        b = b * a + 221.213596169931;
        b = b * a + 220.206867912376;
        c = e * b;
        b = 8.83883476483184e-02 * a + 1.75566716318264;
        b = b * a + 16.064177579207;
        b = b * a + 86.7807322029461;
        b = b * a + 296.564248779674;
        b = b * a + 637.333633378831;
        b = b * a + 793.826512519948;
        b = b * a + 440.413735824752;
        c = c / b;
      } else {
        b = a + 0.65;
        b = a + 4 / b;
        b = a + 3 / b;
        b = a + 2 / b;
        b = a + 1 / b;
        c = e / b / 2.506628274631;
      }
    }
    return x > 0 ? 1 - c : c;
  }

  // Acklam's rational approximation, refined with one Halley step
  function normQuantile(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
      1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
      6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
      -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
      3.754408661907416e+00];
    var pl = 0.02425, q, r, x;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= 1 - pl) {
      q = p - 0.5;
      r = q * q;
      x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    var e = normCdf(x) - p;
    var u = e * Math.sqrt(2 * Math.PI) * Math.exp(x * x / 2);
    return x - u / (1 + x * u / 2);
  }

  // Gamma and beta ----

  function logGamma(x) {
    var g = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    var y = x, tmp = x + 5.5, ser = 1.000000000190015;
    tmp -= (x + 0.5) * Math.log(tmp);
    for (var j = 0; j < 6; j++) ser += g[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }

  // Continued fraction for the incomplete beta function
  function betaCf(a, b, x) {
    var fpmin = 1e-300, qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < fpmin) d = fpmin;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= 500; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < fpmin) d = fpmin;
      c = 1 + aa / c;
      if (Math.abs(c) < fpmin) c = fpmin;
      d = 1 / d;
      h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < fpmin) d = fpmin;
      c = 1 + aa / c;
      if (Math.abs(c) < fpmin) c = fpmin;
      d = 1 / d;
      var del = d * c;
      h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    return h;
  }

  // Regularized incomplete beta function, I_x(a, b)
  function betaInc(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var lbeta = logGamma(a + b) - logGamma(a) - logGamma(b) +
      a * Math.log(x) + b * Math.log(1 - x);
    var front = Math.exp(lbeta);
    if (x < (a + 1) / (a + b + 2)) return front * betaCf(a, b, x) / a;
    return 1 - front * betaCf(b, a, 1 - x) / b;
  }

  // t ----

  function tPdf(x, df) {
    var lc = logGamma((df + 1) / 2) - logGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
    return Math.exp(lc - (df + 1) / 2 * Math.log(1 + x * x / df));
  }

  function tCdf(x, df) {
    var ib = betaInc(df / (df + x * x), df / 2, 0.5);
    return x > 0 ? 1 - ib / 2 : ib / 2;
  }

  // Quantiles of t and F come from bracketing and bisection: slow to write
  // out by hand but simple to trust, and the app only needs a few per change.
  function bisect(fn, lo, hi) {
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (fn(mid) > 0) hi = mid; else lo = mid;
      if (hi - lo < 1e-11 * (1 + Math.abs(mid))) break;
    }
    return (lo + hi) / 2;
  }

  function tQuantile(p, df) {
    if (p === 0.5) return 0;
    if (p < 0.5) return -tQuantile(1 - p, df);
    var hi = 2;
    while (tCdf(hi, df) < p) hi *= 2;
    return bisect(function (x) { return tCdf(x, df) - p; }, 0, hi);
  }

  // F ----

  function fPdf(x, d1, d2) {
    if (x <= 0) return 0;
    var lc = logGamma((d1 + d2) / 2) - logGamma(d1 / 2) - logGamma(d2 / 2) +
      d1 / 2 * Math.log(d1 / d2);
    return Math.exp(lc + (d1 / 2 - 1) * Math.log(x) -
      (d1 + d2) / 2 * Math.log(1 + d1 * x / d2));
  }

  function fCdf(x, d1, d2) {
    if (x <= 0) return 0;
    return betaInc(d1 * x / (d1 * x + d2), d1 / 2, d2 / 2);
  }

  function fQuantile(p, d1, d2) {
    var hi = 2;
    while (fCdf(hi, d1, d2) < p) hi *= 2;
    return bisect(function (x) { return fCdf(x, d1, d2) - p; }, 0, hi);
  }

  // Summaries ----

  function mean(x) {
    var s = 0;
    for (var i = 0; i < x.length; i++) s += x[i];
    return s / x.length;
  }

  function sumSquares(x, m) {
    m = m === undefined ? mean(x) : m;
    var s = 0;
    for (var i = 0; i < x.length; i++) s += (x[i] - m) * (x[i] - m);
    return s;
  }

  // Test statistics ----

  function tOneSample(x, mu0) {
    var n = x.length, m = mean(x);
    var sdHat = Math.sqrt(sumSquares(x, m) / (n - 1));
    var se = sdHat / Math.sqrt(n);
    return { n: n, M: m, sdHat: sdHat, se: se, t: (m - mu0) / se, df: n - 1 };
  }

  function tTwoSample(a, b) {
    var n1 = a.length, n2 = b.length, m1 = mean(a), m2 = mean(b);
    var pooled = (sumSquares(a, m1) + sumSquares(b, m2)) / (n1 + n2 - 2);
    var se = Math.sqrt(pooled / n1 + pooled / n2);
    return { M1: m1, M2: m2, diff: m1 - m2, pooled: pooled, se: se, t: (m1 - m2) / se, df: n1 + n2 - 2 };
  }

  function fOneWay(groups) {
    var all = [], i, ssw = 0;
    for (i = 0; i < groups.length; i++) {
      all = all.concat(groups[i]);
      ssw += sumSquares(groups[i]);
    }
    var sst = sumSquares(all), ssb = sst - ssw;
    var dfb = groups.length - 1, dfw = all.length - groups.length;
    var msb = ssb / dfb, msw = ssw / dfw;
    return { sst: sst, ssb: ssb, ssw: ssw, dfb: dfb, dfw: dfw, msb: msb, msw: msw, F: msb / msw };
  }

  function bivariate(x, y) {
    var n = x.length, mx = mean(x), my = mean(y), sp = 0;
    for (var i = 0; i < n; i++) sp += (x[i] - mx) * (y[i] - my);
    var ssx = sumSquares(x, mx), ssy = sumSquares(y, my);
    var r = sp / Math.sqrt(ssx * ssy), b = sp / ssx, a = my - b * mx;
    var ssres = ssy - b * sp;
    var seB = Math.sqrt(ssres / (n - 2) / ssx);
    return { n: n, mx: mx, my: my, sp: sp, ssx: ssx, ssy: ssy, ssres: ssres, r: r, r2: r * r,
      a: a, b: b, seB: seB, t: b / seB, df: n - 2 };
  }

  var api = {
    normPdf: normPdf, normCdf: normCdf, normQuantile: normQuantile,
    tPdf: tPdf, tCdf: tCdf, tQuantile: tQuantile,
    fPdf: fPdf, fCdf: fCdf, fQuantile: fQuantile,
    mean: mean, sumSquares: sumSquares,
    tOneSample: tOneSample, tTwoSample: tTwoSample, fOneWay: fOneWay, bivariate: bivariate
  };
  root.SimStats = api;
})(typeof window !== "undefined" ? window : this);
