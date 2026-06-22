import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
    touchRotate?: boolean;
    shiftKeyRotate?: boolean;
    dragRotate?: boolean;
    rotateControl?: boolean | { position?: string; closeOnZeroBearing?: boolean };
    rotateCompassControl?: boolean | { enabled?: boolean; position?: string };
    preventPageGestures?: boolean;
  }

  interface MarkerOptions {
    rotation?: number;
    rotateWithView?: boolean;
    scale?: number;
  }

  interface Map {
    setBearing(theta: number): void;
    getBearing(): number;
    setHeading(deg: number | null, options?: { ease?: number; deadzone?: number }): this;
    stopHeadingUp(): this;
    getHeadingUp(): boolean;
  }
}
