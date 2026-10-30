// Wires the interface to the views, and reads and writes the URL, so that a
// slide can open any view in a preset state.
//
// Parameters: tab, ui=slide, theme=light (for printing), step, n, d, pop, alpha,
// tails, view, hide, draws, seed. Example: index.html?ui=slide&step=2&n=10&draws=551
(function (root) {
  "use strict";
  var E = root.SimEngine, B = root.SimBlueprint, P = root.SimPower, I = root.SimIntervals, R = root.SimCorrelation;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(root.location.search);
  var TABS = ["blueprint", "power", "intervals", "correlation"];

  function num(key, fallback) {
    var v = parseFloat(params.get(key));
    return isFinite(v) ? v : fallback;
  }

  // Blueprint ----

  function fillSelects() {
    Object.keys(E.STEPS).forEach(function (key) {
      var o = document.createElement("option");
      o.value = key;
      o.textContent = E.STEPS[key].title;
      $("step").appendChild(o);
    });
    Object.keys(E.POPULATIONS).forEach(function (key) {
      var o = document.createElement("option");
      o.value = key;
      o.textContent = E.POPULATIONS[key].label;
      $("pop").appendChild(o);
    });
  }

  function syncControls() {
    var c = B.state.c, m = c.meta, pairs = m.kind === "pairs" || m.kind === "binary";
    $("step").value = c.step;
    $("pop").value = c.pop;
    $("pop-field").style.display = pairs ? "none" : "";
    $("n").min = m.nMin;
    $("n").max = m.nMax;
    $("n").value = c.n;
    $("n").disabled = m.nMin === m.nMax;
    $("n-out").textContent = c.n;
    $("d").value = c.d;
    $("d").min = m.kind === "pairs" ? -0.9 : -1.5;
    $("d").max = m.kind === "pairs" ? 0.9 : 1.5;
    $("d-label").textContent = m.kind === "pairs" ? "True correlation ρ" : m.kind === "binary" ? "True slope β" : "True effect d";
    $("d-out").textContent = root.SimDraw.fmt(c.d);
    $("alpha").value = String(c.alpha);
    $("tails").value = c.tails;
    $("tails").disabled = m.kind === "three";
    $("hide").checked = B.state.hide;
    var scale = $("scale");
    scale.innerHTML = "";
    m.views.slice().sort().reverse().forEach(function (v) {
      var o = document.createElement("option");
      o.value = v;
      o.textContent = (v === "stat" ? m.statName : m.rawName) + (v === "raw" && c.step !== "6" && c.step !== "7" && c.step !== "7b" ? ", in score units" : "");
      scale.appendChild(o);
    });
    scale.value = c.view;
    $("view-field").style.display = m.views.length > 1 ? "" : "none";
  }

  function update(opts) {
    B.configure(opts);
    syncControls();
    B.render();
  }

  function bindBlueprint() {
    $("draw-1").onclick = function () { B.draw(1); };
    $("draw-50").onclick = function () { B.draw(50); };
    $("draw-500").onclick = function () { B.draw(500); };
    $("clear").onclick = function () { B.clear(); };
    $("prev").onclick = function () { B.browse(-1); };
    $("next").onclick = function () { B.browse(1); };
    $("step").onchange = function () {
      var st = E.STEPS[this.value];
      update({ step: this.value, n: st.n, d: 0, tails: "two", view: st.views[st.views.length - 1] });
    };
    $("pop").onchange = function () { update({ pop: this.value }); };
    $("n").oninput = function () { update({ n: parseInt(this.value, 10) }); };
    $("d").oninput = function () { update({ d: parseFloat(this.value) }); };
    $("alpha").onchange = function () { update({ alpha: parseFloat(this.value) }); };
    $("tails").onchange = function () { update({ tails: this.value }); };
    $("scale").onchange = function () { update({ view: this.value }); };
    $("hide").onchange = function () { B.state.hide = this.checked; B.render(); };
    var dist = $("c-dist");
    dist.addEventListener("click", function (evt) {
      var box = dist.getBoundingClientRect();
      B.pick(evt.clientX - box.left, evt.clientY - box.top);
    });
    dist.addEventListener("keydown", function (evt) {
      if (evt.key === "ArrowLeft") { B.browse(-1); evt.preventDefault(); }
      if (evt.key === "ArrowRight") { B.browse(1); evt.preventDefault(); }
    });
  }

  // Power ----

  function syncPower() {
    var s = P.state;
    $("p-d").value = s.d; $("p-n").value = s.n; $("p-alpha").value = s.alpha; $("p-tails").value = s.tails;
    $("p-d-out").textContent = s.d.toFixed(2);
    $("p-n-out").textContent = s.n;
    $("p-alpha-out").textContent = s.alpha.toFixed(2);
    P.render();
  }

  function bindPower() {
    $("p-d").oninput = function () { P.state.d = parseFloat(this.value); syncPower(); };
    $("p-n").oninput = function () { P.state.n = parseInt(this.value, 10); syncPower(); };
    $("p-alpha").oninput = function () { P.state.alpha = parseFloat(this.value); syncPower(); };
    $("p-tails").onchange = function () { P.state.tails = this.value; syncPower(); };
  }

  // Confidence intervals ----

  function syncIntervals() {
    var s = I.state;
    $("ci-n").value = s.n; $("ci-level").value = String(s.level); $("ci-known").value = s.known ? "1" : "0";
    $("ci-n-out").textContent = s.n;
  }

  function bindIntervals() {
    $("ci-1").onclick = function () { I.draw(1); };
    $("ci-50").onclick = function () { I.draw(50); };
    $("ci-500").onclick = function () { I.draw(500); };
    $("ci-clear").onclick = function () { I.reset(); I.render(); };
    function changed() { I.reset(); syncIntervals(); I.render(); }
    $("ci-n").oninput = function () { I.state.n = parseInt(this.value, 10); changed(); };
    $("ci-level").onchange = function () { I.state.level = parseFloat(this.value); changed(); };
    $("ci-known").onchange = function () { I.state.known = this.value === "1"; changed(); };
  }

  // Correlation ----

  function syncCorrelation() {
    var s = R.state;
    $("r-target").value = s.target; $("r-n").value = s.n;
    $("r-target-out").textContent = s.target.toFixed(2);
    $("r-n-out").textContent = s.n;
    $("r-line").checked = s.line; $("r-resid").checked = s.resid;
    $("r-squares").checked = s.squares; $("r-means").checked = s.means;
    $("r-delete").setAttribute("aria-pressed", s.deleting ? "true" : "false");
  }

  function bindCorrelation() {
    var s = R.state;
    R.bind();
    $("r-new").onclick = function () { R.generate(); R.render(); };
    $("r-outlier").onclick = function () { R.addOutlier(); };
    $("r-delete").onclick = function () { s.deleting = !s.deleting; syncCorrelation(); };
    $("r-target").oninput = function () { s.target = parseFloat(this.value); syncCorrelation(); R.generate(); R.render(); };
    $("r-n").oninput = function () { s.n = parseInt(this.value, 10); syncCorrelation(); R.generate(); R.render(); };
    ["line", "resid", "squares", "means"].forEach(function (k) {
      $("r-" + k).onchange = function () { s[k] = this.checked; R.render(); };
    });
    $("r-file").onchange = function () {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () { R.loadCsv(String(reader.result)); };
      reader.readAsText(file);
    };
  }

  // Tabs and the URL ----

  function currentTab() {
    return TABS.filter(function (t) { return $("tab-" + t).getAttribute("aria-selected") === "true"; })[0];
  }

  function renderTab(name) {
    if (name === "blueprint") B.render();
    if (name === "power") P.render();
    if (name === "intervals") I.render();
    if (name === "correlation") R.render();
  }

  function showTab(name, focus) {
    TABS.forEach(function (t) {
      var on = t === name, tab = $("tab-" + t);
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      $("view-" + t).hidden = !on;
    });
    if (focus) $("tab-" + name).focus();
    renderTab(name);
  }

  function bindTabs() {
    TABS.forEach(function (t, i) {
      var tab = $("tab-" + t);
      tab.onclick = function () { showTab(t); };
      tab.onkeydown = function (evt) {
        var d = evt.key === "ArrowRight" ? 1 : evt.key === "ArrowLeft" ? -1 : 0;
        if (d) {
          showTab(TABS[(i + d + TABS.length) % TABS.length], true);
          evt.preventDefault();
        }
      };
    });
  }

  function linkFor(tab) {
    var q = new URLSearchParams();
    if (tab !== "blueprint") q.set("tab", tab);
    if (tab === "blueprint") {
      var c = B.state.c;
      q.set("step", c.step); q.set("n", c.n);
      if (c.d) q.set("d", c.d);
      if (c.pop !== "normal") q.set("pop", c.pop);
      if (c.alpha !== 0.05) q.set("alpha", c.alpha);
      if (c.tails !== "two") q.set("tails", c.tails);
      if (c.view !== "stat") q.set("view", c.view);
      if (B.state.hide) q.set("hide", "1");
      if (B.state.N) q.set("draws", B.state.N);
    }
    if (tab === "power") {
      q.set("d", P.state.d); q.set("n", P.state.n); q.set("alpha", P.state.alpha); q.set("tails", P.state.tails);
    }
    if (tab === "intervals") {
      q.set("n", I.state.n); q.set("level", I.state.level); q.set("known", I.state.known ? 1 : 0);
      if (I.state.total) q.set("draws", I.state.total);
    }
    if (tab === "correlation") {
      q.set("r", R.state.target); q.set("n", R.state.n);
      if (R.state.resid) q.set("resid", 1);
      if (R.state.squares) q.set("squares", 1);
    }
    return root.location.origin + root.location.pathname + "?" + q.toString();
  }

  function bindCopy() {
    ["copy", "p-copy", "ci-copy", "r-copy"].forEach(function (id) {
      var btn = $(id);
      btn.onclick = function () {
        var url = linkFor(currentTab()), label = btn.textContent;
        var done = function (msg) {
          btn.textContent = msg;
          root.setTimeout(function () { btn.textContent = label; }, 1500);
        };
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { done("Link copied"); }, function () { root.prompt("Copy this link:", url); });
        else root.prompt("Copy this link:", url);
      };
    });
  }

  // Inside a slide, a mouse click must not trap the keyboard in the frame, or
  // the arrow keys would stop moving through the deck. Tabbing in still works.
  function releaseFocus() {
    document.addEventListener("click", function (evt) {
      if (evt.detail === 0 || root.parent === root) return;
      var tag = evt.target.tagName;
      if (tag !== "BUTTON" && tag !== "CANVAS") return;
      root.setTimeout(function () {
        if (document.activeElement) document.activeElement.blur();
        root.parent.focus();
      }, 0);
    });
  }

  function start() {
    if (params.get("ui") === "slide") {
      document.body.classList.add("ui-slide");
      releaseFocus();
    }
    if (params.get("theme") === "light") root.SimDraw.useLight();
    if (params.get("print") === "1") document.body.classList.add("ui-print");
    fillSelects();
    bindBlueprint(); bindPower(); bindIntervals(); bindCorrelation(); bindTabs(); bindCopy();

    var tab = params.get("tab");
    tab = TABS.indexOf(tab) >= 0 ? tab : "blueprint";
    var seed = Math.round(num("seed", 2027));
    B.state.seed = seed; I.state.seed = seed; R.state.seed = seed;

    var step = params.get("step") || "2", meta = E.STEPS[step] || E.STEPS["2"];
    B.state.hide = params.get("hide") === "1";
    B.configure({
      step: step, n: num("n", meta.n), d: tab === "blueprint" ? num("d", 0) : 0, pop: params.get("pop") || "normal",
      alpha: tab === "blueprint" ? num("alpha", 0.05) : 0.05, tails: params.get("tails") || "two",
      view: params.get("view") || meta.views[meta.views.length - 1]
    });
    syncControls();

    if (tab === "power") {
      P.state.d = num("d", P.state.d); P.state.n = Math.round(num("n", P.state.n));
      P.state.alpha = num("alpha", P.state.alpha); P.state.tails = params.get("tails") === "one" ? "one" : "two";
    }
    if (tab === "intervals") {
      I.state.n = Math.round(num("n", I.state.n)); I.state.level = num("level", I.state.level);
      I.state.known = params.get("known") !== "0";
    }
    if (tab === "correlation") {
      R.state.target = num("r", R.state.target); R.state.n = Math.round(num("n", R.state.n));
      R.state.resid = params.get("resid") === "1"; R.state.squares = params.get("squares") === "1";
    }
    syncPower(); I.reset(); syncIntervals(); R.reset(); syncCorrelation();

    showTab(tab);

    // A slide can open with samples already drawn
    var draws = Math.max(0, Math.min(20000, Math.round(num("draws", 0))));
    if (tab === "blueprint" && draws) B.draw(draws, true);
    if (tab === "intervals" && draws) I.draw(draws);

    var pending = false;
    new ResizeObserver(function () {
      if (pending) return;
      pending = true;
      root.requestAnimationFrame(function () {
        pending = false;
        renderTab(currentTab());
      });
    }).observe(document.querySelector("main"));
    // Canvas text waits for the web font, so draw again once it arrives
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { renderTab(currentTab()); });
  }

  start();
})(window);
