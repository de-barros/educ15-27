// The power view: where H0 and a real effect each put the estimate.
// The two designs that compare groups, and the MDE, come from the EDUC 265
// version of this view. They go beyond EDUC 15, so slides show only the first.
(function (root) {
  "use strict";
  var S = root.SimStats, D = root.SimDraw, C = D.COLORS;
  var state = {
    design: "one", d: 0.89, n: 10, alpha: 0.05, tails: "two",
    N: 400, P: 0.5, r2: 0, J: 100, m: 40, rho: 0.16
  };

  // The standard error of the estimate, in SDs of the outcome
  function seOf(s) {
    if (s.design === "two") return Math.sqrt(1 / (s.P * (1 - s.P))) * Math.sqrt((1 - s.r2) / s.N);
    if (s.design === "cluster") {
      return Math.sqrt(1 / (s.P * (1 - s.P))) * Math.sqrt((1 - s.r2) * (s.rho + (1 - s.rho) / s.m) / s.J);
    }
    return 1 / Math.sqrt(s.n);
  }

  function compute(s) {
    var se = seOf(s), shift = s.d / se, zc, power;
    if (s.tails === "one") {
      zc = S.normQuantile(1 - s.alpha);
      power = 1 - S.normCdf(zc - shift);
    } else {
      zc = S.normQuantile(1 - s.alpha / 2);
      power = 1 - S.normCdf(zc - shift) + S.normCdf(-zc - shift);
    }
    // The smallest true effect detected with 80% power
    var mde = (zc + S.normQuantile(0.8)) * se;
    return { se: se, zc: zc, power: power, beta: 1 - power, critD: zc * se, mde: mde };
  }

  function render() {
    var canvas = document.getElementById("c-power"), f = D.fit(canvas), ctx = f.ctx;
    var res = compute(state), se = res.se, d = state.d, groups = state.design !== "one";
    var pad = 18, base = f.h - 30, top = 52, height = base - top;
    var lo = -4.2 * se, hi = Math.max(d + 4.2 * se, 4.2 * se), x = D.scale(lo, hi, pad, f.w - pad);
    var peak = S.normPdf(0, 0, se) * 1.02;
    var h0 = function (v) { return S.normPdf(v, 0, se); }, h1 = function (v) { return S.normPdf(v, d, se); };
    var cut = res.critD, real = d > 0;

    // Power, then Type II error, under the world where the effect is real.
    // With no effect, H0 is true, so neither one exists.
    if (real) {
      D.shade(ctx, h1, x, base, height, peak, x(cut), x(hi), "rgba(90, 180, 229, 0.75)");
      D.shade(ctx, h1, x, base, height, peak, x(lo), x(cut), "rgba(255, 210, 0, 0.32)");
    }
    // Type I error, under H0
    D.shade(ctx, h0, x, base, height, peak, x(cut), x(hi), "rgba(255, 138, 112, 0.9)");
    if (state.tails === "two") D.shade(ctx, h0, x, base, height, peak, x(lo), x(-cut), "rgba(255, 138, 112, 0.9)");

    D.curve(ctx, h0, x, base, height, peak, pad, f.w - pad, { color: C.text, width: 2 });
    D.curve(ctx, h1, x, base, height, peak, pad, f.w - pad, { color: C.pop, width: 2 });

    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    (state.tails === "two" ? [cut, -cut] : [cut]).forEach(function (v) {
      ctx.beginPath();
      ctx.moveTo(x(v), top - 8);
      ctx.lineTo(x(v), base);
      ctx.stroke();
    });
    D.text(ctx, "critical value", x(cut) - 6, top + 8, { color: C.text, align: "right" });
    D.text(ctx, "H₀", x(0), top - 6, { color: C.text, align: "center", bold: true, size: 16 });
    if (d > 0.02) {
      D.text(ctx, "H₁", x(d), top - 6, { color: C.pop, align: "center", bold: true, size: 16 });
      ctx.strokeStyle = C.accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x(0), 26);
      ctx.lineTo(x(d), 26);
      ctx.stroke();
      D.text(ctx, "d = " + D.fmt(d), (x(0) + x(d)) / 2, 21, { color: C.accent, align: "center", size: 14, bold: true });
    }
    D.xAxis(ctx, x, base, pad, f.w - pad, 10);
    D.text(ctx, groups ? "group difference, in SD units" : "sample mean, in SD units", f.w - pad, base + 25, { align: "right" });

    var rows = [
      ["Type I error (α)", D.pct(state.alpha, 0), "#ff8a70"],
      ["Type II error (β)", real ? D.pct(res.beta, 0) : "–", "#ffd200"],
      ["Power (1 − β)", real ? D.pct(res.power, 0) : "–", "#5ab4e5"]
    ];
    var html = "<table><tbody>" + rows.map(function (r) {
      return "<tr><th scope=\"row\"><span style=\"color:" + r[2] + "\">■</span> " + r[0] + "</th><td>" + r[1] + "</td></tr>";
    }).join("") + "<tr><th scope=\"row\">Standard error</th><td>" + D.fmt(se) + "</td></tr>" +
      "<tr><th scope=\"row\">Critical z</th><td>" + D.fmt(res.zc) + "</td></tr>" +
      "<tr class=\"slide-hide\"><th scope=\"row\">MDE at 80% power</th><td>" + D.fmt(res.mde) + "</td></tr></tbody></table>";
    if (state.design === "cluster") {
      html += "<p class=\"note\">Design effect √(1 + (n − 1)ρ) = " + D.fmt(Math.sqrt(1 + (state.m - 1) * state.rho)) +
        "; " + Math.round(state.J * state.m).toLocaleString("en-US") + " students in all.</p>";
    }
    document.getElementById("p-readout").innerHTML = html;
    var what = state.design === "one" ? "n = " + state.n :
      state.design === "two" ? "N = " + state.N + ", " + D.pct(state.P, 0) + " treated" :
      state.J + " schools of " + state.m + " students, rho = " + D.fmt(state.rho);
    canvas.setAttribute("aria-label", real ? "Two normal curves. With d = " + D.fmt(d) + ", " + what + " and alpha = " + D.fmt(state.alpha) +
      ", power is " + D.pct(res.power, 0) + " and the Type II error rate is " + D.pct(res.beta, 0) + "." :
      "One normal curve. With d = 0, H0 is true, so the only possible error is a Type I error, at a rate of " + D.pct(state.alpha, 0) + ".");
  }

  root.SimPower = { state: state, render: render, compute: compute };
})(typeof window !== "undefined" ? window : this);
