// geo-debug.js — panel testowy czujników (lewy górny róg mapy).
// Pokazuje dane z geo-heading.js: GPS (lat/lng/accuracy), kompas (heading),
// źródło, status uprawnień i błędy. Przycisk Start/Stop (gest dla iOS).
// Niezależny od mapy i bridge — wpina się tylko w zdarzenia window.
(function () {
  "use strict";

  var css = document.createElement("style");
  css.textContent = [
    "#geo-debug{position:absolute;top:10px;left:10px;z-index:1000;",
    "font:12px/1.5 monospace;background:rgba(255,255,255,.92);",
    "border:1px solid #ccc;border-radius:6px;padding:8px 10px;min-width:180px;",
    "box-shadow:0 1px 4px rgba(0,0,0,.3);color:#222}",
    "#geo-debug h4{margin:0 0 6px;font-size:12px}",
    "#geo-debug .row{display:flex;justify-content:space-between;gap:10px}",
    "#geo-debug .row span:last-child{font-weight:bold}",
    "#geo-debug .ok{color:#1a7f37}",
    "#geo-debug .err{color:#cf222e}",
    "#geo-debug button{margin-top:6px;width:100%;cursor:pointer;",
    "padding:4px;border:1px solid #888;border-radius:4px;background:#f4f4f4}",
  ].join("");
  document.head.appendChild(css);

  var box = document.createElement("div");
  box.id = "geo-debug";
  box.innerHTML = [
    "<h4>Geo debug</h4>",
    row("Status", "status", "—"),
    row("Lat", "lat", "—"),
    row("Lng", "lng", "—"),
    row("Dokładność", "acc", "—"),
    row("Heading", "heading", "—"),
    row("Źródło", "source", "—"),
    row("Błąd", "error", "—"),
    '<button id="geo-debug-btn">Start</button>',
  ].join("");
  (document.getElementById("map") || document.body).appendChild(box);

  function row(label, id, val) {
    return (
      '<div class="row"><span>' +
      label +
      ':</span><span id="gd-' +
      id +
      '">' +
      val +
      "</span></div>"
    );
  }
  function set(id, val, cls) {
    var el = document.getElementById("gd-" + id);
    el.textContent = val;
    el.className = cls || "";
  }

  window.addEventListener("geo:update", function (e) {
    var d = e.detail;
    if (d.lat != null) {
      set("lat", d.lat.toFixed(6));
      set("lng", d.lng.toFixed(6));
      set("acc", d.accuracy != null ? Math.round(d.accuracy) + " m" : "—");
    }
    set("heading", d.heading != null ? d.heading.toFixed(1) + "°" : "—");
    set("source", d.source || "—");
  });

  window.addEventListener("geo:status", function (e) {
    var s = e.detail;
    var ok = s.sensors.geolocation && s.sensors.orientation;
    set(
      "status",
      "GPS:" +
        (s.sensors.geolocation ? "✓" : "✗") +
        " kompas:" +
        (s.sensors.orientation ? "✓" : "✗"),
      ok ? "ok" : "err",
    );
  });

  window.addEventListener("geo:error", function (e) {
    set("error", e.detail.message || e.detail.code, "err");
  });

  var btn = document.getElementById("geo-debug-btn");
  btn.addEventListener("click", function () {
    if (!window.GeoHeading) return;
    if (window.GeoHeading.isRunning()) {
      window.GeoHeading.stop();
      btn.textContent = "Start";
      set("status", "zatrzymany");
    } else {
      window.GeoHeading.start();
      btn.textContent = "Stop";
    }
  });
})();
