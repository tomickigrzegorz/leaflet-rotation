import L from "leaflet";
import { DEG_TO_RAD, RAD_TO_DEG } from "./constants.js";

  // =====================================================================
  // 9. Touch Gestures Handler — pinch zoom + rotate (Google Maps style)
  //    - Rotation has a deadzone threshold (~10°) so pinch-zoom works
  //      without accidental rotation
  //    - Anchor point: the geographic point under the midpoint between
  //      fingers stays under that midpoint throughout the gesture
  // =====================================================================
  L.Map.TouchGestures = L.Handler.extend({
    _ROTATION_THRESHOLD: 30 * DEG_TO_RAD,
    _SCALE_THRESHOLD: 0.015,
    _MOVE_THRESHOLD: 4,

    addHooks: function () {
      L.DomEvent.on(
        this._map._container,
        "touchstart",
        this._onTouchStart,
        this,
      );
      L.DomEvent.on(this._map._container, "touchmove", this._onTouchMove, this);
      L.DomEvent.on(
        this._map._container,
        "touchend touchcancel",
        this._onTouchEnd,
        this,
      );
    },

    removeHooks: function () {
      L.DomEvent.off(
        this._map._container,
        "touchstart",
        this._onTouchStart,
        this,
      );
      L.DomEvent.off(
        this._map._container,
        "touchmove",
        this._onTouchMove,
        this,
      );
      L.DomEvent.off(
        this._map._container,
        "touchend touchcancel",
        this._onTouchEnd,
        this,
      );
    },

    _onTouchStart: function (e) {
      if (!e.touches || e.touches.length !== 2) {
        this._active = false;
        return;
      }
      var map = this._map;
      if (map.dragging && map.dragging.enabled()) {
        this._draggingWasEnabled = true;
        map.dragging.disable();
      } else {
        this._draggingWasEnabled = false;
      }
      if (map._stop) map._stop();
      // Absorb any pan offset (mapPanePos -> 0) before the pinch so the anchor
      // math and _move don't double-apply it (otherwise content drifts).
      map._commitRotatePan();
      var p1 = map.mouseEventToContainerPoint(e.touches[0]);
      var p2 = map.mouseEventToContainerPoint(e.touches[1]);

      this._startDist = p1.distanceTo(p2);
      if (this._startDist < 1) {
        this._active = false;
        return;
      }

      this._touchZoomCenter = map.options.touchZoom === "center";
      this._centerPoint = map.getSize().divideBy(2);
      this._startCenter = map.getCenter();
      this._startMidpoint = this._touchZoomCenter
        ? this._centerPoint
        : p1.add(p2).divideBy(2);
      this._startAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      this._startBearing = map.getBearing();
      this._startBearingRad = map._bearingRad || 0;
      this._startZoom = map.getZoom();
      this._anchorLatLng = this._touchZoomCenter
        ? this._startCenter
        : map.containerPointToLatLng(this._startMidpoint);

      this._moved = false;
      this._active = true;
      this._rotationActive = false;
      this._scaleActive = false;
      this.zoom = false;

      L.DomEvent.preventDefault(e);
    },

    _onTouchMove: function (e) {
      if (!e.touches || e.touches.length !== 2 || !this._active) return;
      var map = this._map;
      var p1 = map.mouseEventToContainerPoint(e.touches[0]);
      var p2 = map.mouseEventToContainerPoint(e.touches[1]);
      var midpoint = this._touchZoomCenter
        ? this._centerPoint
        : p1.add(p2).divideBy(2);
      var dist = p1.distanceTo(p2);
      var angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

      var midpointDelta = midpoint.distanceTo(this._startMidpoint);

      var scale = dist / this._startDist;
      var scaleDelta = Math.abs(scale - 1);

      var angleDelta = angle - this._startAngle;
      while (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
      while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

      var rotationBeyond =
        map.options.touchRotate &&
        Math.abs(angleDelta) > this._ROTATION_THRESHOLD;
      var scaleBeyond = scaleDelta > this._SCALE_THRESHOLD;
      var moveBeyond = midpointDelta > this._MOVE_THRESHOLD;

      if (!this._moved) {
        if (!rotationBeyond && !scaleBeyond && !moveBeyond) {
          L.DomEvent.preventDefault(e);
          return;
        }
        map._moveStart(true, false);
        this._moved = true;
      }

      // --- Zoom (with deadzone) ---
      var newZoom = this._startZoom;
      if (!this._scaleActive && scaleBeyond) {
        this._scaleActive = true;
      }
      if (this._scaleActive) {
        newZoom = map.getScaleZoom(scale, this._startZoom);
        if (
          !map.options.bounceAtZoomLimits &&
          ((newZoom < map.getMinZoom() && scale < 1) ||
            (newZoom > map.getMaxZoom() && scale > 1))
        ) {
          newZoom = Math.max(
            map.getMinZoom(),
            Math.min(map.getMaxZoom(), newZoom),
          );
        }
      }

      // --- Rotation (only after threshold exceeded) ---

      var newBearingRad = this._startBearingRad;
      if (map.options.touchRotate) {
        if (!this._rotationActive) {
          if (Math.abs(angleDelta) > this._ROTATION_THRESHOLD) {
            this._rotationActive = true;
            this._rotRefAngle = angle;
            map.stopHeadingUp();
          }
        }
        if (this._rotationActive) {
          var rotDelta = angle - this._rotRefAngle;
          while (rotDelta > Math.PI) rotDelta -= 2 * Math.PI;
          while (rotDelta < -Math.PI) rotDelta += 2 * Math.PI;
          var newBearing = this._startBearing - rotDelta * RAD_TO_DEG;
          newBearing = ((newBearing % 360) + 360) % 360;
          map.setBearing(newBearing);
          newBearingRad = map._bearingRad || 0;
        }
      }

      if (this._scaleActive) {
        // --- Anchor: keep geographic point under midpoint ---
        var viewHalf = map.getSize().divideBy(2);
        var screenOffset = midpoint.subtract(viewHalf);
        var pivotPixel = map.project(this._anchorLatLng, newZoom);
        var centerPixel = pivotPixel.subtract(
          screenOffset.rotate(-newBearingRad),
        );
        var newCenter = map.unproject(centerPixel, newZoom);

        this._center = newCenter;
        this._zoom = newZoom;
        this.zoom = true;

        if (this._animRequest) {
          L.Util.cancelAnimFrame(this._animRequest);
        }
        var moveFn = L.Util.bind(
          map._move,
          map,
          newCenter,
          newZoom,
          { pinch: true, round: false },
          undefined,
        );
        this._animRequest = L.Util.requestAnimFrame(moveFn, this, true);
      } else {
        this._center = this._startCenter;
        this._zoom = this._startZoom;
        this.zoom = false;
        if (this._animRequest) {
          L.Util.cancelAnimFrame(this._animRequest);
          this._animRequest = null;
        }
      }

      L.DomEvent.preventDefault(e);
    },

    _onTouchEnd: function (e) {
      if (!this._active) return;
      this._active = false;
      var map = this._map;
      if (this._draggingWasEnabled && map.dragging) {
        map.dragging.enable();
      }
      if (!this._moved) return;
      if (this._animRequest) {
        L.Util.cancelAnimFrame(this._animRequest);
        this._animRequest = null;
      }
      if (this.zoom) {
        if (map.options.zoomAnimation) {
          map._animateZoom(
            this._center,
            map._limitZoom(this._zoom),
            true,
            map.options.zoomSnap,
          );
        } else {
          map._resetView(this._center, map._limitZoom(this._zoom));
        }
      }
      if (this._rotationActive) {
        map.fire("rotate");
      }
      this.zoom = false;
    },
  });

  L.Map.addInitHook("addHandler", "touchGestures", L.Map.TouchGestures);

  L.Map.addInitHook(function () {
    if (this.options.rotate && this.options.touchRotate) {
      if (this.touchGestures) this.touchGestures.enable();
      if (this.touchZoom) this.touchZoom.disable();
    }
  });

  // =====================================================================
  // 10. Shift+Wheel Handler — bearing via scroll
  // =====================================================================
  L.Map.ShiftKeyRotate = L.Handler.extend({
    _ROTATE_STEP: 5,
    _EASE: 0.2,

    addHooks: function () {
      L.DomEvent.on(this._map._container, "wheel", this._onWheel, this);
    },
    removeHooks: function () {
      L.DomEvent.off(this._map._container, "wheel", this._onWheel, this);
      this._stopAnim();
    },
    _onWheel: function (e) {
      if (!e.shiftKey) return;
      L.DomEvent.stop(e);
      var map = this._map;
      map.stopHeadingUp();
      var delta = L.DomEvent.getWheelDelta(e);
      var next = map.getBearing() - delta * this._ROTATE_STEP;
      this._targetBearing = ((next % 360) + 360) % 360;
      if (!this._animating) {
        this._mousePoint = map.mouseEventToContainerPoint(e);
        this._anchorLatLng = map.containerPointToLatLng(this._mousePoint);
        this._startAnim();
      }
    },

    _startAnim: function () {
      if (this._animating) return;
      this._animating = true;
      this._animRequest = L.Util.requestAnimFrame(this._animate, this, true);
    },

    _stopAnim: function () {
      if (this._animRequest) {
        L.Util.cancelAnimFrame(this._animRequest);
        this._animRequest = null;
      }
      this._animating = false;
      this._anchorLatLng = null;
      this._mousePoint = null;
    },

    _animate: function () {
      if (!this._animating) return;
      if (this._targetBearing === undefined || this._targetBearing === null) {
        this._stopAnim();
        return;
      }

      var map = this._map;
      var current = map.getBearing();
      var diff = this._targetBearing - current;
      if (diff > 180) diff -= 360;
      if (diff < -180) diff += 360;

      if (Math.abs(diff) < 0.1) {
        map.setBearing(this._targetBearing);
        this._panToAnchor(map);
        this._stopAnim();
        return;
      }

      map.setBearing(current + diff * this._EASE);
      this._panToAnchor(map);
      this._animRequest = L.Util.requestAnimFrame(this._animate, this, true);
    },

    _panToAnchor: function (map) {
      if (!this._anchorLatLng || !this._mousePoint) return;
      var zoom = map.getZoom();
      var viewHalf = map.getSize().divideBy(2);
      var screenOffset = this._mousePoint.subtract(viewHalf);
      var pivotPixel = map.project(this._anchorLatLng, zoom);
      var centerPixel = pivotPixel.subtract(screenOffset.rotate(-map._bearingRad));
      var newCenter = map.unproject(centerPixel, zoom);
      map.setView(newCenter, zoom, { animate: false });
    },
  });

  L.Map.addInitHook("addHandler", "shiftKeyRotate", L.Map.ShiftKeyRotate);

  L.Map.addInitHook(function () {
    if (this.options.rotate && this.options.shiftKeyRotate) {
      if (this.shiftKeyRotate) this.shiftKeyRotate.enable();
    }
  });

  // Prevent standard scroll zoom when shift is held (to avoid zoom+rotate conflict)
  if (L.Map.ScrollWheelZoom) {
    var _scrollOnWheel = L.Map.ScrollWheelZoom.prototype._onWheelScroll;
    L.Map.ScrollWheelZoom.prototype._onWheelScroll = function (e) {
      if (
        e.shiftKey &&
        this._map &&
        this._map._rotate &&
        this._map.options.shiftKeyRotate
      )
        return;
      return _scrollOnWheel.call(this, e);
    };
  }

  // =====================================================================
  // 10b. DragRotate Handler — right mouse button drag (MapLibre style)
  //      Rotates the map around its center.
  // =====================================================================
  L.Map.DragRotate = L.Handler.extend({
    _SENSITIVITY: 0.5, // degrees per pixel of horizontal movement

    addHooks: function () {
      L.DomEvent.on(this._map._container, "mousedown", this._onDown, this);
      L.DomEvent.on(
        this._map._container,
        "contextmenu",
        L.DomEvent.preventDefault,
      );
    },
    removeHooks: function () {
      L.DomEvent.off(this._map._container, "mousedown", this._onDown, this);
      L.DomEvent.off(
        this._map._container,
        "contextmenu",
        L.DomEvent.preventDefault,
      );
      this._cleanup();
    },
    _onDown: function (e) {
      if (e.button !== 2) return;
      L.DomEvent.preventDefault(e);
      L.DomEvent.stopPropagation(e);
      var map = this._map;
      this._startX = e.clientX;
      this._startBearing = map.getBearing();
      this._moved = false;
      if (map.dragging && map.dragging.enabled()) {
        this._draggingWasEnabled = true;
        map.dragging.disable();
      } else {
        this._draggingWasEnabled = false;
      }
      L.DomEvent.on(document, "mousemove", this._onMove, this);
      L.DomEvent.on(document, "mouseup", this._onUp, this);
    },
    _onMove: function (e) {
      var dx = e.clientX - this._startX;
      if (!this._moved && Math.abs(dx) < 2) return;
      this._moved = true;
      this._map.stopHeadingUp();
      this._map.setBearing(this._startBearing + dx * this._SENSITIVITY);
    },
    _onUp: function (e) {
      this._cleanup();
      if (this._draggingWasEnabled && this._map.dragging) {
        this._map.dragging.enable();
      }
      if (this._moved) {
        L.DomEvent.preventDefault(e);
        this._map.fire("rotate");
      }
    },
    _cleanup: function () {
      L.DomEvent.off(document, "mousemove", this._onMove, this);
      L.DomEvent.off(document, "mouseup", this._onUp, this);
    },
  });

  L.Map.addInitHook("addHandler", "dragRotate", L.Map.DragRotate);

  L.Map.addInitHook(function () {
    if (this.options.rotate && this.options.dragRotate) {
      if (this.dragRotate) this.dragRotate.enable();
    }
  });

  // =====================================================================
  // 12. MarkerDrag fix — convert coords in rotated map
  // =====================================================================
  if (L.Handler.MarkerDrag) {
    var _markerDragOnDrag = L.Handler.MarkerDrag.prototype._onDrag;
    L.Handler.MarkerDrag.prototype._onDrag = function (e) {
      var marker = this._marker;
      var map = marker._map;

      if (map && map._rotate && map._bearing) {
        var iconPos = L.DomUtil.getPosition(marker._icon);
        var layerPos = map.mapPanePointToRotatedPoint(iconPos);
        var latlng = map.layerPointToLatLng(layerPos);

        marker._latlng = latlng;
        e.latlng = latlng;
        e.oldLatLng = this._oldLatLng;
        marker.fire("move", e);
        if (marker._shadowLatLng) marker._shadowLatLng = latlng;
        if (this._oldLatLng) marker.fire("drag", e);
        this._oldLatLng = latlng;
        return;
      }

      if (_markerDragOnDrag) return _markerDragOnDrag.call(this, e);
    };
  }
