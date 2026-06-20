// locate-bridge.js — alternatywny provider heading-up oparty o Leaflet.LocateControl.
// Zamiast geo-heading.js + geo-map-bridge.js: LocateControl daje marker, okrąg
// dokładności i kompas, a my wpinamy jego heading w map.setHeading().
// Wymaga globalnej `map` oraz załadowanego L.Control.Locate. Plik testowy.

class LocateBridge {
  constructor(map, options = {}) {
    this.map = map;
    this.lastH = null;
    // Sterujemy obrotem własną flagą (stan following LocateControl bywa
    // zawodny: klik przy kropce w widoku potrafi być no-op).
    this.paused = false;

    this.lc = L.control
      .locate({
        position: options.position || "bottomright",
        setView: "untilPanOrZoom",
        flyTo: false,
        keepCurrentZoomLevel: true,
        showCompass: true,
        drawCircle: true,
        strings: { title: "Moja lokalizacja / heading-up" },
      })
      .addTo(map);

    this._wire();
  }

  _wire() {
    var self = this;
    var lc = this.lc;
    var map = this.map;

    // LocateControl nie emituje heading — wpinamy się w _setCompassHeading.
    var _origSet = lc._setCompassHeading;
    lc._setCompassHeading = function (h) {
      _origSet.call(this, h);
      var cur = this._compassHeading;
      if (!Number.isFinite(cur) || self.paused) {
        map.stopHeadingUp();
        self.lastH = null;
        return;
      }
      var dh =
        self.lastH == null
          ? 999
          : Math.abs(((cur - self.lastH + 540) % 360) - 180);
      if (dh >= 1.5) {
        self.lastH = cur;
        map.setHeading(cur);
      }
    };

    // przesunięcie/zoom przez użytkownika → zamroź obrót
    map.on("dragstart zoomstart", function () {
      if (lc._active) self.paused = true;
    });

    // po przesunięciu skomituj pan (mapPanePos->0), inaczej zoom przy
    // obrocie liczy marker/treść od złego offsetu i dryfuje
    map.on("dragend", function () {
      if (map._bearing && map._commitRotatePan) map._commitRotatePan();
    });

    // klik w przycisk → wznów obrót (o ile dalej aktywny)
    var _origClick = lc._onClick;
    lc._onClick = function () {
      _origClick.apply(this, arguments);
      self.paused = !this._active;
    };

    map.on("locatedeactivate", function () {
      self.paused = false;
      self.lastH = null;
      map.stopHeadingUp();
      map.setBearing(0);
    });
  }
}

// instancja — wymaga globalnej `map` i załadowanego L.Control.Locate
if (window.map && L.control && L.control.locate) {
  window.locateBridge = new LocateBridge(window.map);
}
