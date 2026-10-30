// Small canvas helpers shared by the simulator's views.
(function (root) {
  "use strict";

  var COLORS = {
    panel: "#1b1f24", text: "#f2f4f6", muted: "#bcc4cc", line: "#5b6570", pop: "#5ab4e5",
    pop2: "#ffd200", pop3: "#5fd6a0", accent: "#ff8ac4", crit: "#ff8a70", dot: "#e6e9ec"
  };
  var FONT = '"Fira Sans Condensed", "Segoe UI", system-ui, sans-serif';

  // Printed slides use the same tool with less ink
  function useLight() {
    Object.assign(COLORS, {
      panel: "#ffffff", text: "#14181d", muted: "#47505a", line: "#7d8894", pop: "#0064a4",
      pop2: "#8a6100", pop3: "#00695c", accent: "#b0126b", crit: "#b23a1e", dot: "#3a424c"
    });
    document.documentElement.classList.add("light");
  }

  // Match the canvas to its box and the screen's pixel density
  function fit(canvas) {
    var box = canvas.parentElement.getBoundingClientRect();
    var w = Math.max(10, box.width), h = Math.max(10, box.height);
    var ratio = root.devicePixelRatio || 1;
    var pw = Math.round(w * ratio), ph = Math.round(h * ratio);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    var ctx = canvas.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }

  function scale(d0, d1, r0, r1) {
    var f = function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); };
    f.invert = function (p) { return d0 + (p - r0) / (r1 - r0) * (d1 - d0); };
    return f;
  }

  function niceStep(span, count) {
    var raw = span / count, mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), r = raw / mag;
    return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  }

  function ticks(d0, d1, count) {
    var step = niceStep(d1 - d0, count), out = [];
    for (var v = Math.ceil(d0 / step) * step; v <= d1 + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }

  function label(ctx, value, step) {
    var dec = step >= 1 ? 0 : Math.ceil(-Math.log(step) / Math.LN10 - 1e-9);
    return value.toFixed(dec).replace("-", "−");
  }

  function text(ctx, str, x, y, opts) {
    opts = opts || {};
    ctx.font = (opts.bold ? "700 " : "") + (opts.size || 13) + "px " + FONT;
    ctx.fillStyle = opts.color || COLORS.muted;
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.base || "alphabetic";
    ctx.fillText(str, x, y);
  }

  function xAxis(ctx, x, y0, x0, x1, count, title) {
    var d = [x.invert(x0), x.invert(x1)], t = ticks(d[0], d[1], count || 8);
    var step = t.length > 1 ? t[1] - t[0] : 1;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0 + 0.5);
    ctx.lineTo(x1, y0 + 0.5);
    ctx.stroke();
    t.forEach(function (v) {
      var px = x(v);
      ctx.beginPath();
      ctx.moveTo(px, y0);
      ctx.lineTo(px, y0 + 4);
      ctx.stroke();
      text(ctx, label(ctx, v, step), px, y0 + 16, { align: "center" });
    });
    if (title) text(ctx, title, x1, y0 - 5, { align: "right" });
  }

  function yAxis(ctx, y, x0, y0, y1, count, title) {
    var d = [y.invert(y0), y.invert(y1)], t = ticks(d[0], d[1], count || 5);
    var step = t.length > 1 ? t[1] - t[0] : 1;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, y0);
    ctx.lineTo(x0 + 0.5, y1);
    ctx.stroke();
    t.forEach(function (v) {
      var py = y(v);
      ctx.beginPath();
      ctx.moveTo(x0, py);
      ctx.lineTo(x0 - 4, py);
      ctx.stroke();
      text(ctx, label(ctx, v, step), x0 - 7, py, { align: "right", base: "middle" });
    });
    if (title) text(ctx, title, x0 + 6, y1 + 12);
  }

  // A filled or dashed density curve
  function curve(ctx, fn, x, base, height, peak, x0, x1, opts) {
    opts = opts || {};
    var i, n = 240;
    ctx.beginPath();
    for (i = 0; i <= n; i++) {
      var px = x0 + (x1 - x0) * i / n;
      var py = base - fn(x.invert(px)) / peak * height;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    if (opts.fill) {
      ctx.lineTo(x1, base);
      ctx.lineTo(x0, base);
      ctx.closePath();
      ctx.fillStyle = opts.fill;
      ctx.fill();
      return;
    }
    ctx.strokeStyle = opts.color || COLORS.text;
    ctx.lineWidth = opts.width || 2;
    ctx.setLineDash(opts.dash || []);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Shade under a curve between two values
  function shade(ctx, fn, x, base, height, peak, from, to, color) {
    var i, n = 120, a = x.invert(from), b = x.invert(to);
    ctx.beginPath();
    ctx.moveTo(from, base);
    for (i = 0; i <= n; i++) {
      var v = a + (b - a) * i / n;
      ctx.lineTo(x(v), base - fn(v) / peak * height);
    }
    ctx.lineTo(to, base);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function fmt(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return "–";
    return v.toFixed(digits === undefined ? 2 : digits).replace("-", "−");
  }

  function pct(v, digits) {
    return (v * 100).toFixed(digits === undefined ? 1 : digits) + "%";
  }

  root.SimDraw = {
    COLORS: COLORS, useLight: useLight, fit: fit, scale: scale, ticks: ticks, text: text, xAxis: xAxis, yAxis: yAxis,
    curve: curve, shade: shade, fmt: fmt, pct: pct
  };
})(typeof window !== "undefined" ? window : this);
