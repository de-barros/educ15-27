// Correlation and regression: drag points and watch r, the line and the residuals.
(function (root) {
  "use strict";
  var E = root.SimEngine, S = root.SimStats, D = root.SimDraw, C = D.COLORS;
  var state = {
    points: [], target: 0.5, n: 30, line: true, resid: false, squares: false, means: false,
    selected: -1, deleting: false, drag: -1, seed: 2027, rng: null, dom: null,
    source: "random", swapped: false, xName: "X", yName: "Y"
  };
  var view = {};

  // Where the points came from: random, mindspark or file
  function setSource(source, xName, yName) {
    state.source = source;
    state.xName = xName;
    state.yName = yName;
    state.swapped = false;
    state.selected = -1;
    setDomain();
  }

  // Data with exactly the requested correlation: the residual part is made
  // orthogonal to X before mixing, so a small n doesn't wander from the target
  function generate() {
    var n = state.n, rng = state.rng, x = [], e = [], i;
    for (i = 0; i < n; i++) { x.push(rng.normal()); e.push(rng.normal()); }
    var fit = S.bivariate(x, e), sx = Math.sqrt(fit.ssx / (n - 1));
    var res = e.map(function (v, j) { return v - fit.a - fit.b * x[j]; });
    var sr = Math.sqrt(S.sumSquares(res) / (n - 1)) || 1, r = state.target, pts = [];
    for (i = 0; i < n; i++) {
      var zx = (x[i] - fit.mx) / sx, zr = res[i] / sr;
      pts.push({ x: 50 + 15 * zx, y: 50 + 15 * (r * zx + Math.sqrt(1 - r * r) * zr) });
    }
    state.points = pts;
    setSource("random", "X", "Y");
  }

  function setDomain() {
    var xs = state.points.map(function (p) { return p.x; }), ys = state.points.map(function (p) { return p.y; });
    if (!xs.length) { state.dom = { x: [0, 100], y: [0, 100] }; return; }
    function range(v) {
      var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), pad = Math.max((hi - lo) * 0.15, 1);
      return [lo - pad, hi + pad];
    }
    state.dom = { x: range(xs), y: range(ys) };
  }

  function stats() {
    var p = state.points;
    if (p.length < 3) return null;
    var st = S.bivariate(p.map(function (q) { return q.x; }), p.map(function (q) { return q.y; }));
    return isFinite(st.b) ? st : null;
  }

  function render() {
    var canvas = document.getElementById("c-corr"), f = D.fit(canvas), ctx = f.ctx;
    var left = 46, right = f.w - 14, top = 10, base = f.h - 26;
    var dom = state.dom, x = D.scale(dom.x[0], dom.x[1], left, right), y = D.scale(dom.y[0], dom.y[1], base, top);
    view = { x: x, y: y, left: left, right: right, top: top, base: base };
    var st = stats(), pts = state.points;

    if (st && state.means) {
      ctx.strokeStyle = C.pop2;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x(st.mx), top);
      ctx.lineTo(x(st.mx), base);
      ctx.moveTo(left, y(st.my));
      ctx.lineTo(right, y(st.my));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (st && (state.resid || state.squares)) {
      pts.forEach(function (p) {
        var fit = st.a + st.b * p.x, h = y(p.y) - y(fit);
        if (state.squares) {
          // A true square in plot units, drawn beside the point
          var side = Math.abs(h), dir = p.x <= st.mx ? 1 : -1;
          ctx.fillStyle = "rgba(255, 138, 196, 0.2)";
          ctx.fillRect(dir > 0 ? x(p.x) : x(p.x) - side, Math.min(y(p.y), y(fit)), side, side);
        }
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x(p.x), y(p.y));
        ctx.lineTo(x(p.x), y(fit));
        ctx.stroke();
      });
    }

    if (st && state.line) {
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x(dom.x[0]), y(st.a + st.b * dom.x[0]));
      ctx.lineTo(x(dom.x[1]), y(st.a + st.b * dom.x[1]));
      ctx.save();
      ctx.rect(left, top, right - left, base - top);
      ctx.clip();
      ctx.stroke();
      ctx.restore();
    }

    var dotR = pts.length > 150 ? 3 : pts.length > 60 ? 4 : 5.5;
    pts.forEach(function (p, i) {
      ctx.fillStyle = i === state.selected ? C.accent : C.pop;
      ctx.beginPath();
      ctx.arc(x(p.x), y(p.y), i === state.selected ? dotR + 2 : dotR, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Random data has no names, so its axes stay unlabeled, as on the slides
    var named = state.source !== "random";
    D.xAxis(ctx, x, base, left, right, 8, named ? state.xName : undefined);
    D.yAxis(ctx, y, left, base, top, 6, named ? state.yName : undefined);

    var f2 = D.fmt, html;
    if (st) {
      var p = 2 * (1 - S.tCdf(Math.abs(st.t), st.df));
      html = "<table><tbody>" +
        "<tr><th scope=\"row\">Points</th><td>" + st.n + "</td></tr>" +
        "<tr><th scope=\"row\">Correlation r</th><td>" + f2(st.r) + "</td></tr>" +
        "<tr><th scope=\"row\">R², variance shared</th><td>" + D.pct(st.r2, 0) + "</td></tr>" +
        "<tr><th scope=\"row\">Intercept a</th><td>" + f2(st.a) + "</td></tr>" +
        "<tr><th scope=\"row\">Slope b</th><td>" + f2(st.b) + "</td></tr>" +
        "<tr class=\"slide-hide\"><th scope=\"row\">SE of the slope</th><td>" + f2(st.seB) + "</td></tr>" +
        "<tr><th scope=\"row\">Sum of squared residuals</th><td>" + f2(st.ssres, 0) + "</td></tr>" +
        "<tr><th scope=\"row\">t(" + st.df + ")</th><td>" + f2(st.t) + "</td></tr>" +
        "<tr><th scope=\"row\">p</th><td>" + (!isFinite(p) ? "–" : p < 0.001 ? "&lt; .001" : p.toFixed(3).replace(/^0/, "")) + "</td></tr></tbody></table>";
      canvas.setAttribute("aria-label", "Scatter plot of " + st.n + " points. r = " + f2(st.r) + ", slope b = " + f2(st.b) + ", intercept a = " + f2(st.a) + ".");
    } else {
      html = "Add at least three points, with different values of X.";
      canvas.setAttribute("aria-label", "Scatter plot with too few points.");
    }
    document.getElementById("r-readout").innerHTML = html;
  }

  function nearest(px, py) {
    var best = -1, bestD = 196;
    state.points.forEach(function (p, i) {
      var dx = view.x(p.x) - px, dy = view.y(p.y) - py, dd = dx * dx + dy * dy;
      if (dd < bestD) { bestD = dd; best = i; }
    });
    return best;
  }

  function coords(evt) {
    var box = document.getElementById("c-corr").getBoundingClientRect();
    return { x: evt.clientX - box.left, y: evt.clientY - box.top };
  }

  function bind() {
    var canvas = document.getElementById("c-corr");
    canvas.addEventListener("pointerdown", function (evt) {
      var c = coords(evt), hit = nearest(c.x, c.y);
      if (state.deleting) {
        if (hit >= 0) {
          state.points.splice(hit, 1);
          state.selected = -1;
          render();
        }
        return;
      }
      if (hit >= 0) {
        state.drag = hit;
        state.selected = hit;
        canvas.setPointerCapture(evt.pointerId);
      } else if (c.x > view.left && c.x < view.right && c.y > view.top && c.y < view.base) {
        state.points.push({ x: view.x.invert(c.x), y: view.y.invert(c.y) });
        state.selected = state.points.length - 1;
      }
      render();
    });
    canvas.addEventListener("pointermove", function (evt) {
      if (state.drag < 0) return;
      var c = coords(evt), p = state.points[state.drag];
      p.x = view.x.invert(Math.max(view.left, Math.min(view.right, c.x)));
      p.y = view.y.invert(Math.max(view.top, Math.min(view.base, c.y)));
      render();
    });
    function stop() { state.drag = -1; }
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener("keydown", function (evt) {
      var n = state.points.length, dom = state.dom, key = evt.key;
      if (key === "n" || key === "N") {
        state.selected = n ? (state.selected + 1) % n : -1;
      } else if (key === "Delete" || key === "Backspace") {
        if (state.selected >= 0) {
          state.points.splice(state.selected, 1);
          state.selected = -1;
        }
      } else if (key.indexOf("Arrow") === 0 && state.selected >= 0) {
        var p = state.points[state.selected], sx = (dom.x[1] - dom.x[0]) / 50, sy = (dom.y[1] - dom.y[0]) / 50;
        if (key === "ArrowLeft") p.x -= sx;
        if (key === "ArrowRight") p.x += sx;
        if (key === "ArrowUp") p.y += sy;
        if (key === "ArrowDown") p.y -= sy;
      } else {
        return;
      }
      evt.preventDefault();
      render();
    });
  }

  function addOutlier() {
    var dom = state.dom, st = stats();
    var high = !st || st.r >= 0;
    state.points.push({ x: dom.x[0] + (dom.x[1] - dom.x[0]) * 0.93, y: dom.y[0] + (dom.y[1] - dom.y[0]) * (high ? 0.08 : 0.92) });
    state.selected = state.points.length - 1;
    render();
  }

  // Flip the two variables. r and t stay put, and the slope doesn't
  function swap() {
    state.points.forEach(function (p) { var v = p.x; p.x = p.y; p.y = v; });
    var name = state.xName;
    state.xName = state.yName;
    state.yName = name;
    state.swapped = !state.swapped;
    setDomain();
    render();
  }

  // The class data, as decks 11 to 13 use it: each student's raw math score at
  // baseline and at endline, for everyone who took both tests
  function loadMindspark(baselineText, endlineText) {
    function rows(textData) {
      var lines = textData.split(/\r?\n/), head = lines[0].split(",");
      var id = head.indexOf("st_id"), math = head.indexOf("tot_math");
      return lines.slice(1).map(function (l) {
        var parts = l.split(",");
        return { id: parts[id], math: parseFloat(parts[math]) };
      });
    }
    var before = {}, pts = [];
    rows(baselineText).forEach(function (r) { if (r.id && isFinite(r.math)) before[r.id] = r.math; });
    rows(endlineText).forEach(function (r) {
      if (r.id && isFinite(r.math) && before.hasOwnProperty(r.id)) pts.push({ x: before[r.id], y: r.math });
    });
    if (pts.length < 3) return false;
    state.points = pts;
    setSource("mindspark", "Math score at baseline", "Math score at endline");
    render();
    return true;
  }

  // Read x and y from the first two columns, and their names from a header row
  // if there is one. Nothing leaves the browser.
  function loadCsv(textData) {
    var lines = textData.split(/\r?\n/).filter(function (l) { return l.trim().length; }), pts = [];
    if (!lines.length) return false;
    var first = lines[0].split(/[,;\t]/), named = !isFinite(parseFloat(first[0])) && first.length > 1;
    lines.forEach(function (l) {
      var parts = l.split(/[,;\t]/), a = parseFloat(parts[0]), b = parseFloat(parts[1]);
      if (isFinite(a) && isFinite(b)) pts.push({ x: a, y: b });
    });
    if (pts.length < 3) return false;
    state.points = pts;
    setSource("file", named ? first[0].trim() : "X", named ? first[1].trim() : "Y");
    render();
    return true;
  }

  function reset() {
    state.rng = E.makeRng(state.seed);
    generate();
  }

  root.SimCorrelation = {
    state: state, reset: reset, generate: generate, render: render, bind: bind,
    addOutlier: addOutlier, swap: swap, loadMindspark: loadMindspark, loadCsv: loadCsv
  };
})(typeof window !== "undefined" ? window : this);
