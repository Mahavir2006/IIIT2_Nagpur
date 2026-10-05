// Chronological destruction/impact timeline for the live feed and the on-map destruction markers.
// Pure derivation from the EXISTING impact assessment (src/lib/impact.ts) and envelopes — no new
// numbers are invented: event times are the per-place arrivals assessPlaces() already computes
// (min arrival within 100 m), severities are the AIDR hazard classes it already assigns, and road
// events use the same "cut" definition as roadCut() (arrival at a crossed cell with peak depth
// >= FLOOD_DEPTH). The feed component filters this list by the playhead, so scrubbing back
// rewinds it for free.

import type { Envelopes } from './frames';
import { FLOOD_DEPTH, type PlaceImpact, type PreparedRoad } from './impact';
import type { HazardClass } from './hazard';
import type { PlaceKind } from '@/types/scenario';

export interface FloodEvent {
  /** Sim time of the event, s after breach start. */
  t: number;
  id: string;
  name: string;
  kind: PlaceKind | 'road';
  hazard: HazardClass;
  /** Short verb phrase, e.g. "washed out", "flooded". */
  verb: string;
  /** True for structural destruction (bridges, H5+ buildings) — shown red in the feed. */
  destroyed: boolean;
}

/** Structural destruction (vs "just" flooding): bridges always; others at AIDR H5+. */
export function isDestructive(kind: PlaceKind, hazard: HazardClass): boolean {
  return kind === 'bridge' || hazard >= 5;
}

function placeVerb(kind: PlaceKind, hazard: HazardClass): { verb: string; destroyed: boolean } {
  if (kind === 'bridge') return { verb: 'washed out', destroyed: true };
  if (kind === 'hydro') return { verb: hazard >= 5 ? 'destroyed' : 'inundated', destroyed: hazard >= 5 };
  if (kind === 'hospital' || kind === 'school' || kind === 'shelter') {
    return hazard >= 5 ? { verb: 'structurally damaged', destroyed: true } : { verb: 'flooded', destroyed: false };
  }
  // settlements
  return hazard >= 5 ? { verb: `hit (H${hazard})`, destroyed: true } : { verb: `flooded (H${hazard})`, destroyed: false };
}

/** Earliest time the road was cut (arrival at a crossed cell with peak depth >= FLOOD_DEPTH), or -1. */
export function roadCutTime(pr: PreparedRoad, env: Envelopes): number {
  let first = -1;
  for (let i = 0; i < pr.cells.length; i++) {
    const k = pr.cells[i];
    const a = env.arrival[k];
    if (a >= 0 && env.peakDepth[k] >= FLOOD_DEPTH && (first < 0 || a < first)) first = a;
  }
  return first;
}

/** Full-run event list, ascending by time. Recompute when placesVersion/summaryVersion change. */
export function buildEventTimeline(
  places: PlaceImpact[],
  roads: PreparedRoad[],
  env: Envelopes | null,
  runParams?: { mode?: string; landslideDelay?: number } | null,
): FloodEvent[] {
  const out: FloodEvent[] = [];

  if (runParams?.mode === 'landslide-dam') {
    const delay = runParams.landslideDelay ?? 180;
    out.push({
      t: 0,
      id: 'ls:slope-failure',
      name: 'Valley Slope Landslide',
      kind: 'other',
      hazard: 5,
      verb: 'massive rock & debris avalanche blocks gorge',
      destroyed: true,
    });
    out.push({
      t: Math.max(1, Math.round(delay * 0.4)),
      id: 'ls:natural-dam',
      name: 'Natural Landslide Dam',
      kind: 'other',
      hazard: 4,
      verb: 'lake impounds rapidly behind unstable blockage',
      destroyed: false,
    });
    out.push({
      t: delay,
      id: 'ls:dam-collapse',
      name: 'Natural Dam Breached',
      kind: 'other',
      hazard: 6,
      verb: 'catastrophic devastating outburst flood unleashed!',
      destroyed: true,
    });
  }

  for (const pi of places) {
    if (!pi.flooded || pi.arrival < 0) continue;
    const { verb, destroyed } = placeVerb(pi.place.kind, pi.hazard);
    out.push({ t: pi.arrival, id: `p:${pi.place.id}`, name: pi.place.name, kind: pi.place.kind, hazard: pi.hazard, verb, destroyed });
  }
  if (env) {
    // one event per named non-bridge road (bridge roads are covered by the bridge place markers)
    const seen = new Set<string>();
    for (const pr of roads) {
      if (pr.road.bridge || !pr.road.name) continue;
      const key = pr.road.name;
      if (seen.has(key)) continue;
      const t = roadCutTime(pr, env);
      if (t < 0) continue;
      seen.add(key);
      out.push({ t, id: `r:${pr.road.id}`, name: pr.road.name, kind: 'road', hazard: 0, verb: 'cut', destroyed: false });
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}
