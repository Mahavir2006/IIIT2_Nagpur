// Holder for large data kept OUT of React/zustand state. Stores expose version counters that bump
// whenever these change, and components read the arrays from here.

import type { DamSeries, OutletSeries } from '@/types/engine';
import type { LoadedScenario } from './data';
import { FrameStore, type Envelopes } from './frames';
import type { PlaceImpact, PreparedRoad } from './impact';
import type { BasinResult } from './basin';

export const big = {
  scenario: null as LoadedScenario | null,
  frames: new FrameStore(),
  env: null as Envelopes | null,
  dam: { t: [], outflow: [], level: [], width: [] } as DamSeries,
  outlet: { t: [], q: [] } as OutletSeries,
  roads: [] as PreparedRoad[],
  places: [] as PlaceImpact[],
  basin: null as BasinResult | null,
};
