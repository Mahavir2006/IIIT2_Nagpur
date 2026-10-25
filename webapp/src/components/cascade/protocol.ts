// Messages between the cascade console and its worker.

import type { CascadeSnapshot, InterventionPlan, RiskLevel } from '@/cascade/contract';
import type { CityConfig } from '@/cascade/city';
import type { AdversityPreset } from '@/cascade/sim/adversity';

export type InjectKind = 'fake_reports' | 'kill_sensor' | 'spoof_gauge' | 'sever_feeds';

export type ToWorker =
  | { type: 'init'; scenarioId: string; adversity: AdversityPreset; prior: unknown | null }
  | { type: 'play'; speed: number }
  | { type: 'pause' }
  | { type: 'step'; hours: number }
  | { type: 'inject'; kind: InjectKind; zoneId: string }
  | { type: 'plan'; budget?: Record<string, number> };

export interface FeedItem { t: number; source: string; kind: string; zoneId: string; value: number; unit: string; text?: string; late: boolean }

/** The hidden truth, sent only so the console can reveal it on request (clearly marked). */
export interface TruthPeek { cityLevel: RiskLevel; zoneLevels: RiskLevel[]; cityCriticalOnset: number | null; ledger: string[] }

export type FromWorker =
  | { type: 'ready'; city: CityConfig; scenario: { id: string; label: string; description: string; hours: number; adversity: string }; sources: number }
  | { type: 'snapshot'; snapshot: CascadeSnapshot; feed: FeedItem[]; received: number; truth: TruthPeek; computeMs: number }
  | { type: 'plan'; plan: InterventionPlan; t: number; ms: number }
  | { type: 'injected'; message: string }
  | { type: 'status'; message: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

