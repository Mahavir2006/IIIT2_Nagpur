'use client';

// Mount point and view-switch logic for the 3D Earth globe. Always mounted
// next to the dashboard: it watches the deck.gl camera through mapHandle and
// swaps to the globe when the user zooms far enough out.
//
// Smoothness contract:
// - The ArcGIS SceneView is warm-started hidden once the page is idle, so its
//   basemap/elevation tiles are cached before the user first zooms out, and it
//   is never destroyed on exit — the overlay only fades and hides.
// - Entering: the overlay stays transparent (map still visible) until the
//   globe reports it has drawn the matching camera shot, then crossfades in.
// - Leaving via a dam pick: the map starts its fly-to at click time, the globe
//   dives toward the site, and the overlay fades out over the already-moving
//   map — one continuous camera move.

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useUi } from '@/store/ui';
import { mapHandle } from '@/lib/mapHandle';

/** deck.gl zoom below which the map hands over to the whole-Earth globe. */
export const EARTH_ZOOM_THRESHOLD = 6.5;
/** Ignore the zoom trigger for this long after returning, while the fly-to runs. */
const REENTRY_SUPPRESS_MS = 4000;
/** Reveal cap: crossfade in even if the globe never reports ready (slow net). */
const REVEAL_FALLBACK_MS = 2200;

const EarthView = dynamic(() => import('./EarthView'), {
  ssr: false,
  loading: () => <div className="earth-root" aria-hidden />,
});

export default function EarthOverlay() {
  const viewMode = useUi((s) => s.viewMode);
  const active = viewMode === 'earth';
  /** ArcGIS bundle + SceneView mounted (hidden) ahead of first use. */
  const [warm, setWarm] = useState(false);
  /** Globe has drawn its opening shot; overlay may crossfade in. */
  const [revealed, setRevealed] = useState(false);
  const suppressUntil = useRef(0);

  // Zoom-out trigger + camera tracking: MapView reports every camera change
  // through mapHandle.
  useEffect(() => {
    mapHandle.onViewState = (vs) => {
      mapHandle.lastViewState = vs;
      const ui = useUi.getState();
      if (ui.viewMode !== 'map') return;
      if (Date.now() < suppressUntil.current) return;
      if (vs.zoom < EARTH_ZOOM_THRESHOLD) {
        suppressUntil.current = Date.now() + REENTRY_SUPPRESS_MS;
        ui.set({ viewMode: 'earth', follow: false });
      }
    };
    return () => {
      mapHandle.onViewState = null;
    };
  }, []);

  // Warm-start the globe once the browser is idle so the first zoom-out never
  // meets a cold, textureless sphere — without hurting initial page load.
  useEffect(() => {
    if (warm) return;
    if (active) {
      // Entered before the idle warm-up fired: mount the globe right away.
      const t = setTimeout(() => setWarm(true), 0);
      return () => clearTimeout(t);
    }
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(() => setWarm(true), { timeout: 8000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = setTimeout(() => setWarm(true), 3500);
    return () => clearTimeout(t);
  }, [warm, active]);

  // Reveal fallback cap: crossfade in even if the ready signal never arrives.
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setRevealed(true), REVEAL_FALLBACK_MS);
    return () => {
      clearTimeout(t);
      // Leaving: arm the next entry to start transparent again.
      setTimeout(() => setRevealed(false), 0);
    };
  }, [active]);

  const returnToMap = (flewToDam: boolean) => {
    suppressUntil.current = Date.now() + REENTRY_SUPPRESS_MS;
    const ui = useUi.getState();
    ui.set({ viewMode: 'map' });
    // Exited without picking a site: settle back on the current scenario
    // (a dam pick already started its own fly-to at click time).
    if (!flewToDam) ui.requestCamera({ kind: 'scenario' });
  };

  if (!warm) return null;

  return (
    <div
      className={`earth-overlay ${active ? 'is-interactive' : ''} ${active && revealed ? 'is-active' : ''}`}
      aria-hidden={!active}
    >
      <EarthView
        active={active}
        onRevealReady={() => setRevealed(true)}
        onSelectDam={(dam) => {
          // Start the map's fly-to immediately: it animates beneath the globe
          // while the globe dives, so the fade lands on a moving, nearby camera.
          suppressUntil.current = Date.now() + REENTRY_SUPPRESS_MS;
          useUi.getState().requestCamera({ kind: 'fly-to', lng: dam.lng, lat: dam.lat, zoom: dam.zoom });
        }}
        onHandover={() => returnToMap(true)}
        onExit={() => returnToMap(false)}
      />
    </div>
  );
}
