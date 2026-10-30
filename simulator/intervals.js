// The confidence interval view: one interval per sample, around a true mean
// that stays put. The interval moves; the population mean doesn't.
(function (root) {
  "use strict";
  var E = root.SimEngine, D = root.SimDraw, C = D.COLORS;
  var state = { n: 10, level: 0.95, known: true, mu0: 100, sigma: 15, d: 0, list: [], covered: 0, rejected: 0, total: 0, rng: null, seed: 2027 };
  var SHOW = 60;

  function reset() {
    state.list = []; state.covered = 0; state.rejected = 0; state.total = 0;
    state.rng = E.makeRng(state.seed);
  }

  function draw(count) {
    for (var i = 0; i < count; i++) {
      var ci = E.drawInterval(state, state.rng);
      state.total++;
      if (ci.covers) state.covered++;
      if (ci.excludesH0) state.rejected++;
      state.list.push(ci);
      if (state.list.length > SHOW) state.list.shift();
    }
    render();
  }

  function render() {
    var canvas = document.getElementById("c-ci"), f = D.fit(canvas), ctx = f.ctx, pad = 18, base = f.h - 26, top = 22;
    // A fixed axis, so a bigger sample shows up as a narrower interval
    var s = state.sigma, h0 = state.mu0, mu = h0 + state.d * s, span = (4 + Math.abs(state.d)) * s;
    var x = D.scale(h0 - span, h0 + span, pad, f.w - pad);
    var rows = Math.max(state.list.length, 20), rowH = (base - top) / rows, apart = state.d !== 0;

    ctx.strokeStyle = C.pop;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x(mu), top - 6);
    ctx.lineTo(x(mu), base);
    ctx.stroke();
    D.text(ctx, "μ = " + D.fmt(mu, 1).replace(/\.0$/, ""), x(mu) + (apart ? (state.d > 0 ? 5 : -5) : 0), 13, { color: C.pop, align: apart ? (state.d > 0 ? "left" : "right") : "center", bold: true, size: 14 });
    if (apart) {
      ctx.strokeStyle = C.text;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(x(h0), top - 6);
      ctx.lineTo(x(h0), base);
      ctx.stroke();
      ctx.setLineDash([]);
      D.text(ctx, "H₀: μ = " + h0, x(h0) + (state.d > 0 ? -5 : 5), 13, { color: C.text, align: state.d > 0 ? "right" : "left", bold: true, size: 14 });
    }

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
    var last = state.list[state.list.length - 1], se = state.known ? "σ<sub>M</sub>" : "σ̂<sub>M</sub>", crit = state.known ? "z" : "t";
    function row(name, value) { return "<tr><th scope=\"row\">" + name + "</th><td>" + value + "</td></tr>"; }
    var html = "<table><tbody>" +
      row("Intervals drawn", state.total.toLocaleString("en-US")) +
      row("Contain μ", cov === null ? "–" : D.pct(cov)) +
      row("Confidence level", D.pct(state.level, 0)) +
      row("Miss μ (square marker)", (state.total - state.covered).toLocaleString("en-US")) +
      row("Exclude the H₀ mean: reject H₀", state.total ? D.pct(state.rejected / state.total) : "–") +
      "</tbody></table>";
    if (last) {
      html += "<h2>Latest sample</h2><table><tbody>" +
        row("M", D.fmt(last.M)) +
        row("Margin of error, " + crit + " × " + se, D.fmt(last.crit) + " × " + D.fmt(last.se) + " = " + D.fmt(last.half)) +
        row("Interval", "[" + D.fmt(last.lo) + ", " + D.fmt(last.hi) + "]") +
        "</tbody></table>";
    }
    document.getElementById("ci-readout").innerHTML = html;
    document.getElementById("cap-ci").textContent = apart ? "Solid line: the true mean. Dashed line: what H₀ claims." : "The vertical line is the true population mean.";
    canvas.setAttribute("aria-label", "Confidence intervals for " + state.total + " samples. " +
      (cov === null ? "" : D.pct(cov) + " contain the true mean of " + D.fmt(mu, 1) + ", and " + D.pct(state.rejected / state.total) + " exclude the H0 mean of " + h0 + "."));
  }

  root.SimIntervals = { state: state, reset: reset, draw: draw, render: render };
})(typeof window !== "undefined" ? window : this);
