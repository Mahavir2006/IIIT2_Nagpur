/* On-map destruction markers, driven by the playhead (visual layer only).
 *
 * When the flood front reaches an asset (its assessPlaces() arrival, src/lib/impact.ts), the
 * marker flips state: destroyed bridges (and other structurally-hit assets) get a red "broken"
 * cross above the base dot, and a short expanding collapse ring plays in SIM time around the
 * arrival — so scrubbing back before the arrival restores the intact marker and the ring replays
 * deterministically. No new physics or numbers: everything derives from the existing PlaceImpact
 * arrivals and AIDR hazard classes.
 */

import { ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Layer } from '@deck.gl/core';
import type { PlaceImpact } from '@/lib/impact';
import { isDestructive } from '@/lib/eventFeed';

/** Sim-time window after arrival during which the collapse ring plays, s. */
const FLASH_WINDOW = 240;

export interface ImpactMarkerInputs {
  places: PlaceImpact[];
  playhead: number;
  mode3d: boolean;
  fontFamily: string;
}

/** True once the flood has reached this place at the playhead. */
export function reachedAt(pi: PlaceImpact, playhead: number): boolean {
  return pi.flooded && pi.arrival >= 0 && pi.arrival <= playhead;
}

export function buildImpactMarkers(i: ImpactMarkerInputs): Layer[] {
  const { places, playhead, mode3d: t3 } = i;
  const out: Layer[] = [];
  const sfx = t3 ? '' : '-2d';

  const destroyed: PlaceImpact[] = [];
  const flashing: Array<{ pi: PlaceImpact; age: number }> = [];
  for (const pi of places) {
    if (!reachedAt(pi, playhead) || !isDestructive(pi.place.kind, pi.hazard)) continue;
    // Don't show red cross over residential settlements; they have detailed houses and submersion visuals
    if (pi.place.kind === 'village' || pi.place.kind === 'hamlet' || pi.place.kind === 'town') continue;
    destroyed.push(pi);
    const age = playhead - pi.arrival;
    if (age <= FLASH_WINDOW) flashing.push({ pi, age });
  }

  if (flashing.length) {
    out.push(new ScatterplotLayer<{ pi: PlaceImpact; age: number }>({
      id: `impact-flash${sfx}`,
      data: flashing,
      getPosition: (d) => [d.pi.place.lng, d.pi.place.lat, t3 ? d.pi.place.ground + 4 : 0],
      getRadius: (d) => 8 + (d.age / FLASH_WINDOW) * 42,
      radiusUnits: 'pixels',
      stroked: true,
      filled: false,
      getLineColor: (d) => [239, 68, 68, Math.round(235 * (1 - d.age / FLASH_WINDOW))],
      lineWidthMinPixels: 2.5,
      updateTriggers: { getPosition: t3, getRadius: playhead, getLineColor: playhead },
      parameters: { depthCompare: 'always' },
      pickable: false,
    }));
  }

  if (destroyed.length) {
    out.push(new TextLayer<PlaceImpact>({
      id: `impact-destroyed${sfx}`,
      data: destroyed,
      getPosition: (d) => [d.place.lng, d.place.lat, t3 ? d.place.ground + 4 : 0],
      getText: () => '✕',
      getSize: (d) => (d.place.kind === 'bridge' ? 17 : 14),
      getColor: [248, 82, 72, 255],
      fontFamily: i.fontFamily,
      fontWeight: 800,
      characterSet: ['✕'],
      outlineWidth: 4,
      outlineColor: [7, 9, 12, 235],
      fontSettings: { sdf: true, fontSize: 64, buffer: 8 },
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      updateTriggers: { getPosition: t3 },
      parameters: { depthCompare: 'always' },
      pickable: false,
    }));
  }

  return out;
}
