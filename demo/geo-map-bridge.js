// geo-map-bridge.js — łączy dane z geo-heading.js z mapą (nasze potrzeby/demo).
// Słucha 'geo:update', rysuje niebieską kropkę + okrąg dokładności + stożek,
// auto-centruje i woła map.setHeading(). Wymaga mapy i window.GeoHeading.
// Dla cudzej biblioteki (np. LocateControl) pomijasz ten plik i sam wołasz
// map.setHeading(h) z jej zdarzeń.

class GeoMapBridge {
  constructor(map, options = {}) {
    this.map = map;
    this.geo = options.geo || window.GeoHeading;
    this.position = options.position || "bottomright";

    this.posMarker = null;
    this.accCircle = null;
    this.active = false;
    this.following = false;
    this.lastLat = null;
    this.lastLng = null;
    this.interacting = false; // palec/mysz na mapie — nie ruszamy mapą z czujników
    this.btn = null;

    this.posIcon = L.divIcon({
      className: "",
      html: '<div class="geo-pos"><div class="geo-cone"></div><div class="geo-dot"></div></div>',
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    // bind — żeby removeEventListener / map.off trafiły w tę samą referencję
    this._onUpdate = this._onUpdate.bind(this);
    this._onError = this._onError.bind(this);
    this._onUserMove = this._onUserMove.bind(this);
    this._onSettle = this._onSettle.bind(this);
    this._onPress = this._onPress.bind(this);
    this._onRelease = this._onRelease.bind(this);

    this._injectStyles();
    this._addControl();
  }

  _injectStyles() {
    if (document.getElementById("geo-bridge-css")) return;
    var css = document.createElement("style");
    css.id = "geo-bridge-css";
    css.textContent = [
      ".geo-pos{position:relative;width:0;height:0}",
      ".geo-dot{position:absolute;left:-10px;top:-10px;width:20px;height:20px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.4)}",
      // stożek (latarka) wskazuje GÓRĘ ekranu (mapa obraca się heading-up):
      // wierzchołek przy kropce (dół), rozszerza się ku górze, mocniejszy przy kropce
      ".geo-cone{position:absolute;left:-55px;top:-56px;width:110px;height:56px;",
      "background:linear-gradient(to top, rgba(26,115,232,.65), rgba(26,115,232,.18) 55%, rgba(26,115,232,0));",
      "-webkit-clip-path:polygon(43% 100%, 57% 100%, 82% 0, 18% 0);clip-path:polygon(43% 100%, 57% 100%, 82% 0, 18% 0)}",
      ".leaflet-bar a.geo-locate-btn{background:#fff;width:30px;height:30px;line-height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer}",
      ".geo-locate-btn.active{color:#1a73e8}",
      ".geo-locate-btn.paused{color:#9aa0a6}",
      ".geo-locate-btn svg{display:block}",
    ].join("");
    document.head.appendChild(css);
  }

  _onUpdate(e) {
    if (!this.active || this.interacting) return;
    var d = e.detail;
    if (this.following && d.heading != null) this.map.setHeading(d.heading);

    if (d.lat == null) return;
    var ll = [d.lat, d.lng];
    var moved = d.lat !== this.lastLat || d.lng !== this.lastLng;

    if (!this.posMarker) {
      this.accCircle = L.circle(ll, {
        radius: d.accuracy || 0,
        color: "#1a73e8",
        weight: 1,
        fillColor: "#1a73e8",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(this.map);
      this.posMarker = L.marker(ll, {
        icon: this.posIcon,
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(this.map);
    } else if (moved) {
      this.posMarker.setLatLng(ll);
      this.accCircle.setLatLng(ll).setRadius(d.accuracy || 0);
    }

    this.lastLat = d.lat;
    this.lastLng = d.lng;

    // recenter tylko gdy pozycja realnie się zmieniła (nie co klatkę kompasu).
    // panTo zostawia mapPanePos != 0 (panBy), co pod obrotem rozjeżdża zoom —
    // commitujemy offset do 0 od razu (no-op gdy mapa nieobrócona).
    if (this.following && moved) {
      this.map.panTo(ll, { animate: false });
      this.map._commitRotatePan();
    }
  }

  _onUserMove() {
    if (this.active && this.following) {
      this.following = false;
      this._updateBtn();
      this.map.stopHeadingUp();
    }
  }

  recenter() {
    this.following = true;
    this._updateBtn();
    if (this.posMarker) {
      this.map.panTo(this.posMarker.getLatLng(), { animate: false });
      this.map._commitRotatePan();
    }
  }

  _updateBtn() {
    this.btn.classList.toggle("active", this.active && this.following);
    this.btn.classList.toggle("paused", this.active && !this.following);
  }

  _onError(e) {
    console.warn("geo:error", e.detail);
  }

  _onPress() {
    this.interacting = true;
  }
  _onRelease(e) {
    if (e && e.touches && e.touches.length > 0) return; // jeszcze palce na ekranie
    this.interacting = false;
  }
  _bindInteract() {
    var c = this.map._container;
    c.addEventListener("touchstart", this._onPress, { passive: true });
    c.addEventListener("touchend", this._onRelease, { passive: true });
    c.addEventListener("touchcancel", this._onRelease, { passive: true });
    c.addEventListener("mousedown", this._onPress);
    window.addEventListener("mouseup", this._onRelease);
  }
  _unbindInteract() {
    var c = this.map._container;
    c.removeEventListener("touchstart", this._onPress);
    c.removeEventListener("touchend", this._onRelease);
    c.removeEventListener("touchcancel", this._onRelease);
    c.removeEventListener("mousedown", this._onPress);
    window.removeEventListener("mouseup", this._onRelease);
    this.interacting = false;
  }

  enable() {
    if (this.active) return;
    this.active = true;
    this.following = true;
    this._updateBtn();
    window.addEventListener("geo:update", this._onUpdate);
    window.addEventListener("geo:error", this._onError);
    this.map.on("dragstart zoomstart rotatestart", this._onUserMove);
    this.map.on("dragend zoomend", this._onSettle);
    this._bindInteract();
    this.geo.start();
  }

  // Po przesunięciu/zoomie skomituj offset pana (mapPanePos->0). Pod obrotem
  // niewyzerowany offset rozjeżdża kolejny zoom/obrót (drift markerów).
  _onSettle() {
    if (this.map._bearing && this.map._commitRotatePan) {
      this.map._commitRotatePan();
    }
  }

  disable() {
    this.active = false;
    this.following = false;
    this._updateBtn();
    window.removeEventListener("geo:update", this._onUpdate);
    window.removeEventListener("geo:error", this._onError);
    this.map.off("dragstart zoomstart rotatestart", this._onUserMove);
    this.map.off("dragend zoomend", this._onSettle);
    this._unbindInteract();
    if (this.geo.isRunning()) this.geo.stop();
    this.map.stopHeadingUp();
    this.map.setBearing(0);
    if (this.posMarker) {
      this.map.removeLayer(this.posMarker);
      this.map.removeLayer(this.accCircle);
      this.posMarker = this.accCircle = null;
    }
    this.lastLat = this.lastLng = null;
  }

  // --- przycisk toggle (gest dla zgody iOS) ---
  _addControl() {
    var self = this;
    var Ctrl = L.Control.extend({
      options: { position: self.position },
      onAdd: function () {
        var c = L.DomUtil.create("div", "leaflet-bar");
        self.btn = L.DomUtil.create("a", "geo-locate-btn", c);
        self.btn.href = "#";
        self.btn.title = "Moja lokalizacja / heading-up";
        self.btn.innerHTML =
          '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 8a4 4 0 100 8 4 4 0 000-8zm9 3h-2.06A7 7 0 0013 5.06V3h-2v2.06A7 7 0 005.06 11H3v2h2.06A7 7 0 0011 18.94V21h2v-2.06A7 7 0 0018.94 13H21v-2zM12 17a5 5 0 110-10 5 5 0 010 10z"/></svg>';
        L.DomEvent.disableClickPropagation(c);
        L.DomEvent.on(self.btn, "click", function (ev) {
          L.DomEvent.stop(ev);
          if (!self.active) self.enable();
          else if (!self.following) self.recenter();
          else self.disable();
        });
        return c;
      },
    });
    this.map.addControl(new Ctrl());
  }
}

// instancja — wymaga globalnej `map` (z map-config.js)
if (window.map) {
  window.geoBridge = new GeoMapBridge(window.map);
}
