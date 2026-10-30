// The confidence interval view: one interval per sample, around a true mean
// that stays put. The interval moves; the population mean doesn't.
(function (root) {
  "use strict";
  var E = root.SimEngine, D = root.SimDraw, C = D.COLORS;
  var state = { n: 10, level: 0.95, known: true, mu0: 100, sigma: 15, list: [], covered: 0, total: 0, rng: null, seed: 2027 };
  var SHOW = 60;

  function reset() {
    state.list = []; state.covered = 0; state.total = 0;
    state.rng = E.makeRng(state.seed);
  }

  function draw(count) {
    for (var i = 0; i < count; i++) {
      var ci = E.drawInterval(state, state.rng);
      state.total++;
      if (ci.covers) state.covered++;
      state.list.push(ci);
      if (state.list.length > SHOW) state.list.shift();
    }
    render();
  }

  function render() {
    var canvas = document.getElementById("c-ci"), f = D.fit(canvas), ctx = f.ctx, pad = 18, base = f.h - 26, top = 22;
    var s = state.sigma, span = 4.6 * s / Math.sqrt(Math.max(2, Math.min(state.n, 12)));
    var x = D.scale(state.mu0 - span, state.mu0 + span, pad, f.w - pad);
    var rows = Math.max(state.list.length, 20), rowH = (base - top) / rows;

    ctx.strokeStyle = C.pop;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(state.mu0), top - 6);
    ctx.lineTo(x(state.mu0), base);
    ctx.stroke();
    D.text(ctx, "μ = " + state.mu0, x(state.mu0), 13, { color: C.pop, align: "center", bold: true, size: 14 });

    state.list.forEach(function (ci, i) {
      var y = base - rowH * (state.list.length - i - 0.5);
      var color = ci.covers ? C.dot : C.crit;
      ctx.strokeStyle = color;
      ctx.lineWidth = ci.covers ? 1.6 : 2.6;
      ctx.beginPath();
      ctx.moveTo(Math.max(pad, x(ci.lo)), y);
      ctx.lineTo(Math.min(f.w - pad, x(ci.hi)), y);
      ctx.stroke();
      ctx.fillStyle = color;
      if (ci.covers) {
        ctx.beginPath();
        ctx.arc(x(ci.M), y, Math.max(0.8, Math.min(3, rowH * 0.4)), 0, 2 * Math.PI);
        ctx.fill();
      } else {
        // A square, so a miss doesn't depend on color alone
        var side = Math.min(7, rowH * 0.8);
        ctx.fillRect(x(ci.M) - side / 2, y - side / 2, side, side);
      }
    });
    if (!state.list.length) D.text(ctx, "Press +1 to draw a sample", f.w / 2, f.h / 2, { size: 16, align: "center", color: C.text });
    D.xAxis(ctx, x, base, pad, f.w - pad, 10);

    var cov = state.total ? state.covered / state.total : null;
    document.getElementById("ci-readout").innerHTML = "<table><tbody>" +
      "<tr><th scope=\"row\">Intervals drawn</th><td>" + state.total.toLocaleString("en-US") + "</td></tr>" +
      "<tr><th scope=\"row\">Contain μ</th><td>" + (cov === null ? "–" : D.pct(cov)) + "</td></tr>" +
      "<tr><th scope=\"row\">Confidence level</th><td>" + D.pct(state.level, 0) + "</td></tr>" +
      "<tr><th scope=\"row\">Miss μ (square marker)</th><td>" + (state.total - state.covered).toLocaleString("en-US") + "</td></tr></tbody></table>";
    canvas.setAttribute("aria-label", "Confidence intervals for " + state.total + " samples. " +
      (cov === null ? "" : D.pct(cov) + " contain the true mean of " + state.mu0 + "."));
  }

  root.SimIntervals = { state: state, reset: reset, draw: draw, render: render };
})(typeof window !== "undefined" ? window : this);
