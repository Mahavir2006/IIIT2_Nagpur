'use client';

// Live destruction/impact feed: a compact chronological strip over the map that fills in as the
// playhead passes each asset's arrival time, and rewinds when scrubbing back. Events come from
// buildEventTimeline() (src/lib/eventFeed.ts), which only re-reads the EXISTING impact assessment
// (assessPlaces arrivals + AIDR hazard classes) and road-cut definition — no new numbers.
// The timeline is rebuilt only when the assessment version bumps (~1.2 s cadence during a run),
// and the per-frame work is a binary-search + slice, so it costs nothing at 60 fps.

import { useEffect, useMemo, useState } from 'react';
import { useSim } from '@/store/sim';
import { useSampledPlayhead } from '@/lib/useSampledPlayhead';
import { useUi } from '@/store/ui';
import { useAnalytics } from '@/store/analytics';
import { big } from '@/lib/big';
import { buildEventTimeline } from '@/lib/eventFeed';
import { tPlus } from '@/lib/format';

const MAX_SHOWN = 7;

const WRAP: React.CSSProperties = {
  position: 'absolute',
  left: 12,
  top: 44,
  zIndex: 5,
  width: 252,
  maxWidth: '46%',
  pointerEvents: 'none',
  background: 'rgba(7, 9, 12, 0.78)',
  border: '1px solid rgba(190, 242, 100, 0.22)',
  borderRadius: 8,
  padding: '7px 9px 6px',
  fontSize: 11,
  lineHeight: 1.45,
  color: 'rgba(230, 237, 243, 0.92)',
  backdropFilter: 'blur(4px)',
};

export default function ImpactFeed() {
  const playhead = useSampledPlayhead();
  const runParams = useSim((s) => s.runParams);
  const hasRun = runParams != null;
  const placesVersion = useAnalytics((s) => s.placesVersion);
  const summaryVersion = useSim((s) => s.summaryVersion);
  const basinView = useUi((s) => s.basinView);

  const timeline = useMemo(
    () => buildEventTimeline(big.places, big.roads, big.env, runParams),
    // versions gate the rebuild; big.* live outside React by design
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placesVersion, summaryVersion, runParams],
  );

  if (!hasRun || basinView || !timeline.length) return null;
  // events up to the playhead (timeline is sorted ascending by t)
  let hi = 0;
  while (hi < timeline.length && timeline[hi].t <= playhead) hi++;
  if (hi === 0) return null;
  const shown = timeline.slice(Math.max(0, hi - MAX_SHOWN), hi).reverse();

  return (
    <div style={WRAP} role="log" aria-label="Destruction and impact feed" aria-live="off">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
        <span style={{ fontSize: 9.5, letterSpacing: '0.14em', color: 'rgba(190, 242, 100, 0.85)', fontWeight: 700 }}>IMPACT FEED</span>
        <span style={{ fontSize: 9.5, color: 'rgba(148, 163, 184, 0.9)' }}>{hi}/{timeline.length} events</span>
      </div>
      {shown.map((ev, idx) => (
        <div key={ev.id} style={{ display: 'flex', gap: 7, opacity: idx === 0 ? 1 : Math.max(0.45, 1 - idx * 0.09) }}>
          <span style={{ color: 'rgba(148, 163, 184, 0.95)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{tPlus(ev.t)}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ color: ev.destroyed ? '#F87171' : 'rgba(230, 237, 243, 0.92)', fontWeight: ev.destroyed ? 700 : 500 }}>
              {ev.name}
            </span>{' '}
            <span style={{ color: ev.destroyed ? 'rgba(248, 113, 113, 0.85)' : 'rgba(148, 163, 184, 0.95)' }}>{ev.verb}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
