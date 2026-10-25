// Event bus with a replay clock. Observations are released strictly by arrival time: a consumer at
// time `now` can never see an event that had not reached the control room yet. This is the
// "future-data isolation" guarantee the validation harness relies on, enforced here and counted.

import type { CascadeForecaster, CascadeSnapshot, Observation } from './contract';

export class IsolationError extends Error {}

export class EventBus {
  private readonly q: Observation[];
  private i = 0;
  private _now = -Infinity;
  /** Events served so far. */
  served = 0;
  /** Events served whose arrival or event time lies in the future of `now`. Must stay 0. */
  violations = 0;

  constructor(events: readonly Observation[]) {
    this.q = [...events].sort((a, b) => a.arrivalTime - b.arrivalTime || (a.id < b.id ? -1 : 1));
  }

  get now() { return this._now; }
  get remaining() { return this.q.length - this.i; }
  get total() { return this.q.length; }

  /**
   * World-side injection (live demo): add events that have not arrived yet. Events whose arrival
   * time is already past are delivered at the next advance, never retroactively.
   */
  inject(events: Observation[]) {
    const pending = this.q.slice(this.i);
    for (const e of events) pending.push({ ...e, arrivalTime: Math.max(e.arrivalTime, this._now + 1e-6) });
    pending.sort((a, b) => a.arrivalTime - b.arrivalTime || (a.id < b.id ? -1 : 1));
    this.q.length = this.i;
    this.q.push(...pending);
  }

  /** World-side tampering with events still in flight (kill or spoof a sensor). Returns how many were touched. */
  mutatePending(fn: (o: Observation) => Observation | null): number {
    let touched = 0;
    const kept: Observation[] = [];
    for (let j = this.i; j < this.q.length; j++) {
      const o = fn(this.q[j]);
      if (o !== this.q[j]) touched++;
      if (o) kept.push(o);
    }
    this.q.length = this.i;
    this.q.push(...kept);
    return touched;
  }

  /** Move the clock to t (never backwards) and return everything that arrived in (previous now, t]. */
  advanceTo(t: number): Observation[] {
    if (t < this._now) throw new IsolationError(`clock cannot go backwards (${t} < ${this._now})`);
    const out: Observation[] = [];
    while (this.i < this.q.length && this.q[this.i].arrivalTime <= t) {
      const o = this.q[this.i++];
      if (o.arrivalTime > t || o.eventTime > t || o.eventTime > o.arrivalTime + 1e-9) this.violations++;
      out.push(o);
    }
    this.served += out.length;
    this._now = t;
    return out;
  }
}

export interface ReplayOptions {
  from: number;
  to: number;
  /** Clock step, hours. */
  step: number;
  /** Take a snapshot every n steps (default 1). */
  snapshotEvery?: number;
  onSnapshot?: (s: CascadeSnapshot) => void;
}

/** Drive a forecaster through a feed with strict isolation. Returns the bus for its counters. */
export function replay(bus: EventBus, model: CascadeForecaster, opt: ReplayOptions): EventBus {
  const every = opt.snapshotEvery ?? 1;
  let k = 0;
  for (let t = opt.from; t <= opt.to + 1e-9; t += opt.step, k++) {
    model.ingest(bus.advanceTo(t), t);
    if (opt.onSnapshot && k % every === 0) opt.onSnapshot(model.snapshot(t));
  }
  return bus;
}
