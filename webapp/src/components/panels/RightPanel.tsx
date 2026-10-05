'use client';

import { useMemo } from 'react';
import { Activity, AlertTriangle, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useSim } from '@/store/sim';
import { useScenario } from '@/store/scenario';
import { useAnalytics } from '@/store/analytics';
import { big } from '@/lib/big';
import { dur, fmtInt, fmtNum, fmtVolume, fmtSig, tPlus } from '@/lib/format';
import { GRAHAM_CITATION, WARNING_POLICY_LABEL, type WarningPolicy } from '@/lib/lifeLoss';
import { JRC_CITATION } from '@/lib/damage';
import { AIDR_CITATION } from '@/lib/hazard';
import { BUFFER_S, FREEBOARD, SEARCH_RADIUS, WALK_SPEED } from '@/lib/evacuation';
import type { PlaceImpact } from '@/lib/impact';
import { useGeo } from '@/store/geo';
import { useSampledPlayhead } from '@/lib/useSampledPlayhead';
import { HazardBadge, Segmented, Skeleton, useTween } from '../ui/primitives';

function Tw({ v, fmt }: { v: number; fmt: (n: number) => string }) {
  const s = useTween(v);
  return <>{fmt(s)}</>;
}

const LOL_TIP = `${GRAHAM_CITATION}
Indicative only. Population at risk = people in flooded places reached by the playhead. Severity: Low if peak depth×velocity < 4.6 m²/s, else Medium; Graham reserves High for near-instant concrete-dam failures, so it is never assigned here. Warning time per place = its arrival time plus the lead chosen here (<15 min = no warning, 15–60 min, >60 min). Central value = Graham's "vague understanding" rate; range = the envelope of the vague and precise rows. Placeholder ("typical") populations make this an order-of-magnitude figure.`;

export default function RightPanel() {
  const open = useUi((s) => s.rightOpen);
  const set = useUi((s) => s.set);
  if (!open) {
    return (
      <div className="panel-rail">
        <button type="button" className="icon-btn" aria-label="Open impact panel" data-tip="Open the Impact panel: people, places, hazard, loss of life and last-departure clocks." onClick={() => set({ rightOpen: true })}>
          <PanelRightOpen size={16} />
        </button>
        <Activity size={16} className="faint" aria-hidden />
      </div>
    );
  }
  return (
    <aside className="panel right" aria-label="Impact panel">
      <div className="panel-head">
        <h2>Impact</h2>
        <span className="micro" style={{ marginLeft: 4 }}>at playhead</span>
        <span className="spacer" />
        <button type="button" className="icon-btn" aria-label="Collapse impact panel" data-tip="Collapse the Impact panel to give the map more room." onClick={() => set({ rightOpen: false })}>
          <PanelRightClose size={16} />
        </button>
      </div>
      <div className="panel-body">
        <ImpactBody />
      </div>
    </aside>
  );
}

function ImpactBody() {
  const scnStatus = useScenario((s) => s.status);
  const status = useSim((s) => s.status);
  const summary = useAnalytics((s) => s.summary);
  const areaNow = useAnalytics((s) => s.areaNow);
  const warning = useUi((s) => s.warning);
  const set = useUi((s) => s.set);
  const geoTotals = useGeo((s) => s.totals);

  if (scnStatus !== 'ready') return <Skeleton lines={8} />;
  if (status === 'idle' || status === 'no-scenario' || !summary) {
    return (
      <div className="empty">
        <b>No flood computed yet</b>
        <span>Set the breach in <b>Event</b> (left), then press <b>Run</b> in the dock below. Numbers here fill in live as the wave moves, and follow the playhead when you scrub.</span>
      </div>
    );
  }
  const ll = summary.lifeLoss;
  const hiMax = Math.max(1, ll.hi);
  const mode = useSim((s) => s.runParams?.mode);
  return (
    <>
      {mode === 'landslide-dam' && (
        <div className="callout amber" style={{ marginBottom: 12 }}>
          <AlertTriangle size={15} style={{ flex: 'none', color: '#F59E0B' }} />
          <span><b>Landslide Outburst:</b> Devastating surge wave unleashed following natural dam overtopping & collapse. Peak velocities & damage computed live on DEM.</span>
        </div>
      )}
      <div className="headline">
        <div className="metric alert" data-tip={'People in places counted as flooded: peak depth ≥ 0.3 m at the place or within 100 m, reached by the playhead. Places without a population figure are not counted.'}>
          <span className="micro">People in flooded places</span>
          <span className="v"><Tw v={summary.people} fmt={fmtInt} /></span>
          <span className="sub">{summary.placesFlooded} places{summary.placesNoPopulation ? ` · ${summary.placesNoPopulation} without population` : ''}</span>
        </div>
        {geoTotals && (
          <div className="metric alert" data-tip="Settlements (OSM villages, hamlets, towns) the flood has reached at the playhead, and the illustrative houses around them that are in the water or have collapsed.">
            <span className="micro">Flooded settlements & houses</span>
            <span className="v sm">
              {geoTotals.settlementsFlooded} <span className="unit">settlements</span> · {geoTotals.housesFlooded} <span className="unit">houses</span>
            </span>
            <span className="sub">
              {geoTotals.housesDestroyed} collapsed · {geoTotals.settlementsAtRisk} settlements ({geoTotals.housesAtRisk} houses) in the flood path
            </span>
          </div>
        )}
        <div className="metric" data-tip="The first OSM place whose 100 m neighbourhood got wetter than 0.1 m, and when.">
          <span className="micro">First place reached</span>
          <span className="v sm">{summary.firstReached ? summary.firstReached.name : '—'}</span>
          <span className="sub">{summary.firstReached ? tPlus(summary.firstReached.arrival) : 'not yet'}</span>
        </div>
        <div className="metric" data-tip="Area of cells deeper than 0.1 m in the stored frame at the playhead.">
          <span className="micro">Flooded area now</span>
          <span className="v"><Tw v={areaNow} fmt={(n) => fmtNum(n, 2)} /><span className="unit">km²</span></span>
        </div>
        <div className="metric" data-tip="Breach outflow at the playhead, and the volume released through the breach so far (trapezoidal integral of the dam hydrograph).">
          <span className="micro">Breach outflow now</span>
          <span className="v"><Tw v={summary.outflowNow} fmt={fmtInt} /><span className="unit">m³/s</span></span>
          <span className="sub">{fmtVolume(summary.volumeReleased)} released</span>
        </div>
      </div>

      <div className="lol">
        <div className="lol-top">
          <span className="micro" data-tip={LOL_TIP}>Loss of life · indicative</span>
          <span className="badge gray" data-tip={LOL_TIP}>Graham 1999</span>
        </div>
        <div style={{ marginBottom: 10 }}>
          <Segmented<WarningPolicy>
            label="Warning time"
            value={warning}
            onChange={(v) => set({ warning: v })}
            options={(['none', 'at-breach', '30-early', '60-early'] as const).map((w) => ({
              value: w,
              label: WARNING_POLICY_LABEL[w],
              tip: w === 'none' ? 'Nobody is warned before the water arrives.' : w === 'at-breach' ? 'Warning goes out the moment the breach starts: each place gets its arrival time as warning.' : w === '30-early' ? 'Warning goes out 30 min before the breach (e.g. from monitoring): arrival + 30 min.' : 'Warning goes out 1 h before the breach: arrival + 60 min.',
            }))}
          />
        </div>
        <div className="lol-range" data-tip={LOL_TIP}>
          <span className="mid"><Tw v={ll.mid} fmt={(n) => fmtInt(n)} /></span>
          <span className="rng">range {fmtInt(ll.lo)} – {fmtInt(ll.hi)}</span>
        </div>
        <div className="lol-bar" aria-hidden>
          <span style={{ left: `${(ll.lo / hiMax) * 100}%`, width: `${((ll.hi - ll.lo) / hiMax) * 100}%` }} />
          <i style={{ left: `${(ll.mid / hiMax) * 100}%` }} />
        </div>
        <span className="note" style={{ margin: 0 }}>Population at risk {fmtInt(ll.par)} · {fmtInt(ll.bySeverity.medium)} in medium-severity flow</span>
      </div>

      <div className="stat-grid">
        <div className="stat" data-tip="OSM places tagged hospital that are flooded (peak ≥ 0.3 m within 100 m).">
          <span className="micro">Hospitals flooded</span><span className="v">{summary.hospitalsFlooded}</span>
        </div>
        <div className="stat" data-tip="OSM places tagged school that are flooded (peak ≥ 0.3 m within 100 m).">
          <span className="micro">Schools flooded</span><span className="v">{summary.schoolsFlooded}</span>
        </div>
        <div className="stat" data-tip="Bridges under water: OSM bridge points that are flooded plus bridge road segments crossing cells with peak depth ≥ 0.3 m.">
          <span className="micro">Bridges under water</span><span className="v">{summary.bridgesUnderWater}</span>
        </div>
        <div className="stat" data-tip="Length of OSM road over cells with peak depth ≥ 0.3 m reached by the playhead (roads sampled every half cell).">
          <span className="micro">Road cut</span><span className="v">{fmtNum(summary.roadKmCut, 1)}<span className="unit">km</span></span>
        </div>
        <div className="stat" data-tip={`Worst AIDR hazard class among flooded places. ${AIDR_CITATION}`}>
          <span className="micro">Worst hazard</span><span className="v"><HazardBadge h={summary.maxHazard} /></span>
        </div>
        <div className="stat" data-tip={`Population-weighted mean fraction of maximum residential damage at each flooded place's peak depth. ${JRC_CITATION}`}>
          <span className="micro">Mean damage fraction</span><span className="v">{Number.isFinite(summary.meanDamageFactor) ? `${fmtNum(summary.meanDamageFactor * 100, 0)}` : '—'}<span className="unit">%</span></span>
        </div>
        <div className="stat" style={{ gridColumn: 'span 2' }} data-tip="A monetary loss needs the JRC report's India maximum-damage value per m² AND the building floor area in each place. Our OSM exposure has points, not a building inventory, so we do not invent a floor area; only the damage fraction above is computed.">
          <span className="micro">Economic loss (₹)</span><span className="v na">not modelled, needs a building floor-area inventory</span>
        </div>
      </div>

      <PlacesTable />
    </>
  );
}

const DEPART_TIP = `Latest departure = arrival − walk time − ${BUFFER_S / 60} min buffer. Walk time = straight-line distance at ${WALK_SPEED} m/s to the nearest DEM ground at least ${FREEBOARD} m above the peak water surface here, searched within ${SEARCH_RADIUS / 1000} km. Straight lines ignore paths and slopes, so read it as "at the very latest".`;

function Departure({ pi, t }: { pi: PlaceImpact; t: number }) {
  const d = pi.departure;
  if (!pi.flooded || !d) return <span className="faint">—</span>;
  if (d.latest == null) return <span className="depart late" data-tip={`No ground ${FREEBOARD} m above the peak water surface within ${SEARCH_RADIUS / 1000} km on the DEM.`}>No high ground ≤2 km</span>;
  const left = d.latest - t;
  if (left <= 0) {
    return <span className="depart late" data-tip={`${pi.arrival <= t ? 'The water is already here: move to high ground now.' : 'Road evacuation no longer feasible. The latest departure time has passed, so move to high ground now.'}
${DEPART_TIP}`}>{pi.arrival <= t ? 'High ground now' : 'Too late by road: high ground now'}</span>;
  }
  return <span className={`depart ${left < 1800 ? 'soon' : 'ok'}`} data-tip={`${DEPART_TIP}\nWalk ${fmtInt(d.safe!.distance)} m (${dur(d.walkSeconds!)}).`}>in {dur(left)}</span>;
}

function PlacesTable() {
  const placesVersion = useAnalytics((s) => s.placesVersion);
  const playhead = useSampledPlayhead(150);
  const selected = useUi((s) => s.selectedPlace);
  const set = useUi((s) => s.set);
  const requestCamera = useUi((s) => s.requestCamera);

  const rows = useMemo(() => {
    void placesVersion;
    return big.places.filter((p) => p.arrival >= 0 && p.peakDepth >= 0.1).sort((a, b) => a.arrival - b.arrival);
  }, [placesVersion]);

  return (
    <section>
      <div className="section-title">
        <span className="micro">Places by arrival</span>
        <span className="faint num" style={{ fontSize: 11 }}>{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <div className="empty"><span>No place has been reached yet. Rows appear as the wave arrives; click one to fly the camera there.</span></div>
      ) : (
        <table className="ptable">
          <colgroup><col className="c-place" /><col className="c-arr" /><col className="c-peak" /><col className="c-hz" /><col className="c-dep" /></colgroup>
          <thead>
            <tr>
              <th>Place</th>
              <th className="r" data-tip="Time after breach start when the place's 100 m neighbourhood first exceeded 0.1 m depth.">Arrival</th>
              <th className="r" data-tip="Peak depth so far within 100 m of the place.">Peak</th>
              <th data-tip={AIDR_CITATION}>Hz</th>
              <th data-tip={DEPART_TIP}>Leave by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const future = r.arrival > playhead;
              return (
                <tr
                  key={r.place.id}
                  className={`row${future ? ' future' : ''}`}
                  aria-selected={selected === r.place.id}
                  tabIndex={0}
                  onClick={() => { set({ selectedPlace: r.place.id, follow: false, basinView: false }); requestCamera({ kind: 'fly-to', lng: r.place.lng, lat: r.place.lat, zoom: 14.2, z: r.place.ground }); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { set({ selectedPlace: r.place.id, follow: false }); requestCamera({ kind: 'fly-to', lng: r.place.lng, lat: r.place.lat, zoom: 14.2, z: r.place.ground }); } }}
                  data-tip={`${r.place.name} (${r.place.kind})${r.place.population != null ? ` · pop. ${fmtInt(r.place.population)} (${r.place.populationSource})` : ''}\nClick to fly the camera here.`}
                >
                  <td><span className="pname">{r.place.name}</span><span className="pkind">{r.place.kind}</span></td>
                  <td className="r num">{tPlus(r.arrival).replace('T+', '+')}</td>
                  <td className="r num">{fmtSig(r.peakDepth)}<span className="unit">m</span></td>
                  <td><HazardBadge h={r.hazard} /></td>
                  <td><Departure pi={r} t={playhead} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}
