'use client';

// The playback clock writes the raw playhead on every animation frame. A component that subscribes
// to it directly re-renders at display rate for as long as the run plays; most readouts only need a
// few updates a second, so they sample it on an interval instead (a scrub still lands within one
// sample). Components that must track the playhead exactly (the scrubber thumb) should stay tiny.

import { useEffect, useState } from 'react';
import { useSim } from '@/store/sim';

export function useSampledPlayhead(intervalMs = 150): number {
  const [t, setT] = useState(() => useSim.getState().playhead);
  useEffect(() => {
    const iv = setInterval(() => {
      const p = useSim.getState().playhead;
      setT((prev) => (prev === p ? prev : p));
    }, intervalMs);
    return () => clearInterval(iv);
  }, [intervalMs]);
  return t;
}
