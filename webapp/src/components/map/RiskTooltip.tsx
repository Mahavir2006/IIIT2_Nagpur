'use client';

// Hover card for a risk zone (one district × one risk band of the heatmap): what the zone is, who
// and what is in it, and a tentative range of deaths and economic loss (lib/zoneLoss.ts). Follows
// the pointer; the zone itself is highlighted on the map by useGeoEngine.

import { useLayoutEffect, useRef, useState } from 'react';
import { geoBig, useGeo } from '@/store/geo';
import { useUi } from '@/store/ui';
import { RISK_BANDS } from '@/lib/geoRisk';
import { bandLabel, fmtCr, fmtCrRange, fmtDeaths } from '@/lib/zoneLoss';
import { ensembleBig } from '@/store/ensemble';
import { big } from '@/lib/big';
import { WARNING_POLICY_LABEL } from '@/lib/lifeLoss';
import { fmtInt, fmtNum } from '@/lib/format';

const BAND_MEANING: Record<number, { prior: string; run: string; ensemble: string }> = {
  4: { prior: 'Low ground beside the river: floods first and deepest if the dam fails.', run: 'Under water in this run.', ensemble: 'Floods in almost every breach scenario: near-certain if the dam fails.' },
  3: { prior: 'Close to the channel and not far above it: likely to flood.', run: 'Just above or beside the flood: at the edge of the water.', ensemble: 'Floods in most scenarios; stays dry only if the breach is small or slow.' },
  2: { prior: 'Higher ground that a large flood could still reach.', run: 'Above the flood with some margin.', ensemble: 'Floods only in the larger or faster breaches.' },
  1: { prior: 'High ground well away from the river: safer.', run: 'High ground well away from the water: safe in this run.', ensemble: 'Rarely or never floods across the scenarios.' },
};

/** Ensemble members flooding the ground under the pointer, over the same heat block the colour
 *  stands for (so it always matches the band): [flooded, members], or null. */
function hereCount(lng: number, lat: number): [number, number] | null {
  const agg = ensembleBig.agg, sc = big.scenario, risk = geoBig.risk;
  if (!agg || !sc || !risk || ensembleBig.cfgId !== sc.config.id) return null;
  const p = risk.blockMaxAt(agg.prob, lng, lat);
  return Number.isFinite(p) ? [Math.round(p * agg.members), agg.members] : null;
}

const placeName = (n: string) => (n.startsWith('(') ? n.slice(1, -1) : n);

export default function RiskTooltip() {
  const hz = useGeo((s) => s.hoverZone);
  const zones = useGeo((s) => s.zones);
  const districts = useGeo((s) => s.districts);
  const hover = useUi((s) => s.hover);
  const riskMap = useUi((s) => s.riskMap);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const z = hz && zones ? zones.zones[hz.district]?.[hz.band] ?? null : null;

  // keep the card inside the map, flipping to the other side of the pointer near an edge
  useLayoutEffect(() => {
    const el = ref.current, host = el?.parentElement;
    if (!el || !host || !hover) return;
    const W = host.clientWidth, H = host.clientHeight, w = el.offsetWidth, h = el.offsetHeight;
    let left = hover.x + 18, top = hover.y + 18;
    if (left + w > W - 8) left = hover.x - w - 18;
    if (top + h > H - 8) top = hover.y - h - 18;
    const next = { left: Math.max(8, left), top: Math.max(8, top) };
    setPos((p) => (p && p.left === next.left && p.top === next.top ? p : next));
  }, [hover, z]);

  if (!z || !hover || !zones) return null;
  const band = RISK_BANDS.find((b) => b.band === z.band)!;
  const d = districts[z.district];
  const basis = zones.basis;
  const run = basis === 'run';
  const ens = basis === 'ensemble';
  const people = run || ens ? z.peopleReached : z.people;
  const here = ens ? hereCount(hover.lng, hover.lat) : null;

  return (
    <div
      ref={ref}
      className="risk-tip"
      role="tooltip"
      style={{ left: pos?.left ?? hover.x + 18, top: pos?.top ?? hover.y + 18, borderColor: band.color }}
    >
      <div className="risk-tip-head">
        <span className="risk-tip-sw" style={{ background: band.color }} />
        <span className="risk-tip-band" style={{ color: band.color }}>{bandLabel(z.band, basis, true).toUpperCase()}</span>
      </div>
      <div className="risk-tip-title">{d?.name ?? 'District'} <small>district</small></div>
      <p className="risk-tip-meaning">{BAND_MEANING[z.band][ens ? 'ensemble' : run ? 'run' : 'prior']}</p>
      {here && <p className="risk-tip-here">Right here: floods in <b>{here[0]} of {here[1]}</b> scenarios</p>}

      <div className="risk-tip-facts">
        <span><b>{fmtNum(z.areaKm2, z.areaKm2 < 10 ? 1 : 0)}</b> km²</span>
        <span><b>{fmtInt(z.settlements)}</b> settlements</span>
        <span><b>{fmtInt(z.people)}</b> people</span>
        <span><b>{fmtInt(z.houses)}</b> houses</span>
        {z.roadKm >= 0.1 && <span><b>{fmtNum(z.roadKm, 1)}</b> km road</span>}
      </div>

      <div className="risk-tip-row death">
        <span className="risk-tip-k">{ens ? 'Expected deaths' : 'Estimated deaths'}</span>
        <span className="risk-tip-v">{fmtDeaths(z.deaths)}</span>
        {z.deaths.hi >= 0.5 && <span className="risk-tip-sub">likely about {fmtInt(Math.max(0, z.deaths.mid))}{people >= 1 ? ` of ${fmtInt(people)} ${ens ? 'reached by water on average' : run ? 'reached by water' : 'living here'}` : ''}</span>}
      </div>
      <div className="risk-tip-row loss">
        <span className="risk-tip-k">Economic loss</span>
        <span className="risk-tip-v">{fmtCrRange(z.lossCr)}</span>
        {z.lossCr.hi >= 0.01 && (
          <span className="risk-tip-sub">
            houses {fmtCr(z.buildingsCr.mid)}{z.housesDamaged ? ` (${fmtInt(z.housesDamaged)} damaged)` : ''} · roads &amp; bridges {fmtCr(z.roadsCr.mid)}
          </span>
        )}
      </div>

      {z.places.length > 0 && (
        <p className="risk-tip-places">Includes {z.places.map(placeName).join(', ')}{z.settlements > z.places.length ? ` and ${z.settlements - z.places.length} more` : ''}</p>
      )}
      <p className="risk-tip-basis">
        {ens
          ? `Average over ${zones.members} breach scenarios, warning: ${WARNING_POLICY_LABEL[zones.policy].toLowerCase()}.`
          : run
            ? `From the simulated flood ${riskMap ? '(whole event)' : '(up to the playhead)'}, warning: ${WARNING_POLICY_LABEL[zones.policy].toLowerCase()}.`
            : 'Terrain ranking: tentative, assuming the dam fails and this zone floods as its rank suggests.'}
        {' '}Indicative range; excludes crops, public buildings and hydropower.
      </p>
    </div>
  );
}
