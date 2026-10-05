// Imperative hooks the map registers so non-map UI (export sheet) can reach the WebGL canvas.

export const mapHandle = {
  /** Redraws synchronously and returns the deck canvas, or null if the map is not mounted. */
  capture: null as null | (() => HTMLCanvasElement | null),
  /** GPU renderer string reported by the WebGL device. */
  gpu: null as string | null,
  /**
   * Called by the map on every view-state change with the latest camera
   * ({ zoom, longitude, latitude, ... }). Registered from outside MapView
   * (earth-view zoom-out trigger); keep it cheap, it fires per frame while
   * the user pans/zooms.
   */
  onViewState: null as null | ((vs: { zoom: number; longitude: number; latitude: number }) => void),
  /** Last camera the map reported (written by the earth-view overlay's onViewState subscriber). */
  lastViewState: null as null | { zoom: number; longitude: number; latitude: number },
};
