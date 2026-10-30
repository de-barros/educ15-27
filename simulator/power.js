// The power view: where H0 and a real effect each put the sample mean.
(function (root) {
  "use strict";
  var E = root.SimEngine, S = root.SimStats, D = root.SimDraw, C = D.COLORS;
  var state = { d: 0.89, n: 10, alpha: 0.05, tails: "two" };

  function render() {
    var canvas = document.getElementById("c-power"), f = D.fit(canvas), ctx = f.ctx;
    var res = E.powerZ(state.d, state.n, state.alpha, state.tails), se = res.se, d = state.d;
    var pad = 18, base = f.h - 30, top = 52, height = base - top;
    var lo = -4.2 * se, hi = Math.max(d + 4.2 * se, 4.2 * se), x = D.scale(lo, hi, pad, f.w - pad);
    var peak = S.normPdf(0, 0, se) * 1.02;
    var h0 = function (v) { return S.normPdf(v, 0, se); }, h1 = function (v) { return S.normPdf(v, d, se); };
    var cut = res.critD;

    // Power, then Type II error, under the world where the effect is real
    D.shade(ctx, h1, x, base, height, peak, x(cut), x(hi), "rgba(90, 180, 229, 0.75)");
    D.shade(ctx, h1, x, base, height, peak, x(lo), x(cut), "rgba(255, 210, 0, 0.32)");
    // Type I error, under H0
    D.shade(ctx, h0, x, base, height, peak, x(cut), x(hi), "rgba(255, 138, 112, 0.9)");
    if (state.tails === "two") D.shade(ctx, h0, x, base, height, peak, x(lo), x(-cut), "rgba(255, 138, 112, 0.9)");

    D.curve(ctx, h0, x, base, height, peak, pad, f.w - pad, { color: C.text, width: 2 });
    D.curve(ctx, h1, x, base, height, peak, pad, f.w - pad, { color: C.pop, width: 2 });

    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(cut), top - 8);
    ctx.lineTo(x(cut), base);
    ctx.stroke();
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
    D.text(ctx, "sample mean, in SD units", f.w - pad, base + 25, { align: "right" });

    var rows = [
      ["Type I error (α)", D.pct(state.alpha, 0), "#ff8a70"],
      ["Type II error (β)", D.pct(res.beta, 0), "#ffd200"],
      ["Power (1 − β)", D.pct(res.power, 0), "#5ab4e5"]
    ];
    var html = "<table><tbody>" + rows.map(function (r) {
      return "<tr><th scope=\"row\"><span style=\"color:" + r[2] + "\">■</span> " + r[0] + "</th><td>" + r[1] + "</td></tr>";
    }).join("") + "<tr><th scope=\"row\">Standard error</th><td>" + D.fmt(se) + "</td></tr>" +
      "<tr><th scope=\"row\">Critical z</th><td>" + D.fmt(res.zc) + "</td></tr></tbody></table>";
    document.getElementById("p-readout").innerHTML = html;
    canvas.setAttribute("aria-label", "Two normal curves. With d = " + D.fmt(d) + ", n = " + state.n + " and alpha = " + D.fmt(state.alpha) +
      ", power is " + D.pct(res.power, 0) + " and the Type II error rate is " + D.pct(res.beta, 0) + ".");
  }

  root.SimPower = { state: state, render: render };
})(typeof window !== "undefined" ? window : this);
