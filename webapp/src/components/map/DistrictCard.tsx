'use client';

// On-map district readout for the geofence (store/geo.ts, driven by useGeoEngine): which district
// the flood is in, a plain-language sentence of what that means there, four headline numbers, the
// risk heatmap legend and the districts along the route (click one to pin it). A short banner
// announces each district the wave crosses into.
//
// In the risk-map view (ui.riskMap) the card becomes an overview of every district instead: the
// zone legend, reach-wide totals and a row per district with its tentative deaths and loss.

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, House, MapIcon, Thermometer, Waves } from 'lucide-react';
import { geoBig, useGeo, focusedDistrict, type DistrictStats, type DistrictView } from '@/store/geo';
import { useSim } from '@/store/sim';
import { useSampledPlayhead } from '@/lib/useSampledPlayhead';
import { useUi } from '@/store/ui';
import { RISK_BANDS, RISK_CSS_GRADIENT } from '@/lib/geoRisk';
import { bandLabel, fmtCrRange, fmtDeaths, ZONE_METHOD } from '@/lib/zoneLoss';
import { useEnsemble } from '@/store/ensemble';
import { big } from '@/lib/big';
import { HAZARD_COLORS } from '@/lib/hazard';
import { dur, fmtInt, fmtNum, tPlus } from '@/lib/format';

/** OSM places without a name come through as "(unnamed hamlet)". */
const placeName = (n: string) => (n.startsWith('(') ? `an ${n.slice(1, -1)}` : n);

function headline(d: DistrictView, s: DistrictStats | null, t: number, hasRun: boolean, isSource: boolean): string {
  if (!hasRun) {
    return isSource
      ? 'The dam is in this district. Red and orange along the river mark the ground that would flood first if it failed; green is safer high ground.'
      : 'Red and orange along the river mark the ground most likely to flood; green is safer high ground.';
  }
  if (d.entryT < 0 || d.entryT > t) {
    return s?.next
      ? `The flood has not reached this district yet. First expected at ${placeName(s.next.name)} in about ${dur(s.next.eta - t)}.`
      : 'The flood has not reached this district in the run so far.';
  }
  if (!s) return 'Reading the flood in this district…';
  const parts: string[] = [];
  parts.push(s.placesFlooded
    ? `Water has reached ${fmtInt(s.placesFlooded)} of ${fmtInt(s.places)} settlements here${s.people ? `, home to about ${fmtInt(s.people)} people` : ''}.`
    : 'Water is in the river valley here but no settlement is flooded yet.');
  if (s.housesDestroyed) parts.push(`${fmtInt(s.housesDestroyed)} houses have collapsed.`);
  else if (s.housesUnderwater) parts.push(`${fmtInt(s.housesUnderwater)} houses are standing in water.`);
  return parts.join(' ');
}

export default function DistrictCard() {
  const ready = useGeo((s) => s.ready);
  const districts = useGeo((s) => s.districts);
  const activeIdx = useGeo((s) => s.activeIdx);
  const focusIdx = useGeo((s) => s.focusIdx);
  const stats = useGeo((s) => s.stats);
  const announce = useGeo((s) => s.announce);
  const setGeo = useGeo((s) => s.set);
  const showRisk = useUi((s) => s.showDistrictRisk);
  const showHouses = useUi((s) => s.showSettlements);
  const riskMap = useUi((s) => s.riskMap);
  const basinView = useUi((s) => s.basinView);
  const setUi = useUi((s) => s.set);
  const requestCamera = useUi((s) => s.requestCamera);
  const hasRun = useSim((s) => s.runParams != null);
  const t = useSampledPlayhead();
  const [open, setOpen] = useState(true);
  const [showList, setShowList] = useState(false);
  const [mapW, setMapW] = useState(1200);
  const cardRef = useRef<HTMLElement>(null);
  const [banner, setBanner] = useState<{ idx: number; t: number; nonce: number } | null>(null);

  useEffect(() => {
    if (!announce) return;
    queueMicrotask(() => setBanner(announce));
    const id = setTimeout(() => setBanner((b) => (b?.nonce === announce.nonce ? null : b)), 5000);
    return () => clearTimeout(id);
  }, [announce]);

  // collapse on a narrow map, hide when there is no room at all
  useEffect(() => {
    const host = cardRef.current?.parentElement;
    if (!host) return;
    const ro = new ResizeObserver(([e]) => setMapW(e.contentRect.width));
    ro.observe(host);
    return () => ro.disconnect();
  }, [ready]);
  useEffect(() => { if (mapW < 700) queueMicrotask(() => setOpen(false)); }, [mapW]);

  if (!ready || basinView || !districts.length) return null;

  const toggleRiskMap = () => {
    const next = !riskMap;
    setUi({ riskMap: next, showDistrictRisk: true, follow: false });
    setGeo({ hoverDistrict: null });
    requestCamera({ kind: next ? 'frame-reach' : 'scenario' });
  };
  const riskMapBtn = (
    <button type="button" className={`geo-icon-btn ${riskMap ? 'on' : ''}`} aria-pressed={riskMap} title={riskMap ? 'Back to the district view' : 'Risk map of every district (hover a zone for deaths and loss)'} onClick={toggleRiskMap}>
      <MapIcon size={13} />
    </button>
  );

  if (riskMap) {
    return (
      <section ref={cardRef} className="geo-card riskmap" style={mapW < 440 ? { display: 'none' } : undefined} aria-label="Flood risk map">
        <header className="geo-card-head">
          <span className="geo-kicker">FLOOD RISK MAP</span>
          <div className="geo-head-actions">
            {riskMapBtn}
            <button type="button" className="geo-icon-btn" aria-expanded={open} title={open ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)}>
              {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </header>
        <RiskMapOverview open={open} hasRun={hasRun} />
      </section>
    );
  }

  const focus = focusedDistrict({ focusIdx, activeIdx });
  const d = districts[focus];
  if (!d) return null;
  const s = stats && stats.idx === focus ? stats : null;
  const floodHere = hasRun && d.entryT >= 0 && d.entryT <= t;
  const isSource = geoBig.risk?.sourceDistrict === focus;

  // route order: districts the flood entered (by entry time), then the rest (source first)
  const route = [...districts].sort((a, b) => {
    const ea = hasRun && a.entryT >= 0 ? a.entryT : Infinity;
    const eb = hasRun && b.entryT >= 0 ? b.entryT : Infinity;
    if (ea !== eb) return ea - eb;
    const sa = geoBig.risk?.sourceDistrict === a.idx ? -1 : 0;
    const sb = geoBig.risk?.sourceDistrict === b.idx ? -1 : 0;
    return sa - sb || b.domainKm2 - a.domainKm2;
  });

  const pin = (idx: number) => {
    const next = idx === focus && focusIdx != null ? null : idx;
    setGeo({ focusIdx: next });
    const bb = geoBig.risk?.districts[idx]?.domainBBox;
    if (bb && next != null) {
      setUi({ follow: false });
      requestCamera({ kind: 'fit-bbox', bbox: bb });
    }
  };

  const area = s?.area;
  const areaTotal = area ? area.severeKm2 + area.highKm2 + area.moderateKm2 + area.lowKm2 : 0;
  const bandPct = (v: number) => (areaTotal > 0 ? (v / areaTotal) * 100 : 0);

  return (
    <>
      {banner && districts[banner.idx] && (
        <div className="geo-banner" role="status" key={banner.nonce}>
          <Waves size={16} />
          <span>Flood has entered <b>{districts[banner.idx].name.toUpperCase()}</b> district</span>
          <span className="geo-banner-t">{tPlus(banner.t)}</span>
        </div>
      )}
      <section ref={cardRef} className={`geo-card ${floodHere ? 'flood' : ''}`} style={mapW < 440 ? { display: 'none' } : undefined} aria-label="District flood geofence">
        <header className="geo-card-head">
          <span className="geo-kicker">{floodHere ? 'FLOOD NOW IN' : focusIdx != null ? 'DISTRICT (PINNED)' : hasRun ? 'DISTRICT' : 'DAM DISTRICT'}</span>
          <div className="geo-head-actions">
            {riskMapBtn}
            <button type="button" className={`geo-icon-btn ${showRisk ? 'on' : ''}`} aria-pressed={showRisk} title="Risk heatmap and geofence" onClick={() => setUi({ showDistrictRisk: !showRisk })}>
              <Thermometer size={13} />
            </button>
            <button type="button" className={`geo-icon-btn ${showHouses ? 'on' : ''}`} aria-pressed={showHouses} title="Houses (illustrative)" onClick={() => setUi({ showSettlements: !showHouses })}>
              <House size={13} />
            </button>
            <button type="button" className="geo-icon-btn" aria-expanded={open} title={open ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)}>
              {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>
        </header>

        <div className="geo-title-row">
          <h3 className="geo-title">{d.name}</h3>
          {d.nameLocal && <span className="geo-local">{d.nameLocal}</span>}
        </div>
        <div className="geo-status">
          {floodHere ? (
            <span className="geo-pill red">Flooded since {tPlus(d.entryT)}</span>
          ) : hasRun && d.entryT > t ? (
            <span className="geo-pill amber">Flood arrives {tPlus(d.entryT)}</span>
          ) : (
            <span className="geo-pill">{hasRun ? 'Not reached' : isSource ? 'Breach site' : 'Before the breach'}</span>
          )}
          {s && s.worst > 0 && floodHere && (
            <span className="geo-pill" style={{ borderColor: HAZARD_COLORS[s.worst as 1], color: HAZARD_COLORS[s.worst as 1] }}>Worst H{s.worst}</span>
          )}
        </div>

        {open && (
          <>
            <p className="geo-lede">{headline(d, s, t, hasRun, isSource)}</p>
            {hasRun && s?.next && floodHere && (
              <p className="geo-next">Next: <b>{placeName(s.next.name)}</b> in about {dur(s.next.eta - t)}</p>
            )}

            <div className="geo-tiles">
              <div className="geo-tile">
                <span className="geo-tile-v">{s ? `${fmtInt(s.placesFlooded)}/${fmtInt(s.places)}` : '—'}</span>
                <span className="geo-tile-k">settlements flooded</span>
              </div>
              <div className="geo-tile">
                <span className="geo-tile-v">{s && hasRun ? fmtInt(s.people) : '—'}</span>
                <span className="geo-tile-k">people in them</span>
              </div>
              <div className="geo-tile">
                <span className="geo-tile-v">{s ? fmtInt(s.housesUnderwater) : '—'}</span>
                <span className="geo-tile-k">houses in water now</span>
              </div>
              <div className="geo-tile warn">
                <span className="geo-tile-v">{s ? fmtInt(s.housesDestroyed) : '—'}</span>
                <span className="geo-tile-k">houses collapsed</span>
              </div>
            </div>

            {area && areaTotal > 0 && (
              <div className="geo-area">
                <div className="geo-area-bar" aria-hidden>
                  <i style={{ width: `${bandPct(area.severeKm2)}%`, background: 'rgb(239,68,68)' }} />
                  <i style={{ width: `${bandPct(area.highKm2)}%`, background: 'rgb(249,115,22)' }} />
                  <i style={{ width: `${bandPct(area.moderateKm2)}%`, background: 'rgb(250,204,21)' }} />
                  <i style={{ width: `${bandPct(area.lowKm2)}%`, background: 'rgb(34,160,80)' }} />
                </div>
                <div className="geo-area-k">
                  <span><b>{fmtNum(area.severeKm2, 1)}</b> km² danger</span>
                  <span><b>{fmtNum(area.highKm2, 1)}</b> km² high</span>
                  <span><b>{fmtNum(area.moderateKm2 + area.lowKm2, 0)}</b> km² lower</span>
                </div>
              </div>
            )}

            {hasRun && s && s.list.length > 0 && (
              <div className="geo-list">
                <button type="button" className="geo-list-toggle" aria-expanded={showList} onClick={() => setShowList(!showList)}>
                  {showList ? 'Hide' : 'Show'} the {s.list.length} settlements the flood reaches here {showList ? '▲' : '▼'}
                </button>
                {showList && (
                  <ul className="geo-list-body">
                    {s.list.slice(0, 80).map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          className={`geo-list-row ${r.flooded ? 'wet' : ''}`}
                          title="Fly to this settlement"
                          onClick={() => { setUi({ follow: false, selectedPlace: r.id }); requestCamera({ kind: 'fly-to', lng: r.lng, lat: r.lat, zoom: 14.2 }); }}
                        >
                          <span className="geo-list-name">{placeName(r.name)} <small>{r.houses ? `${r.houses} houses` : r.kind}</small></span>
                          <span className="geo-list-t">{r.flooded ? `+${fmtNum(r.depth, 1)} m` : tPlus(r.arrival)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="geo-legend">
              <span className="geo-legend-ramp" style={{ background: RISK_CSS_GRADIENT }} />
              <div className="geo-legend-ticks"><span>Safer high ground</span><span>Could flood</span><span>Deep, fast water</span></div>
            </div>

            {districts.length > 1 && (
              <div className="geo-route" role="group" aria-label="Districts along the flood route">
                {route.map((r, i) => {
                  const reached = hasRun && r.entryT >= 0 && r.entryT <= t;
                  const current = r.idx === activeIdx && reached;
                  return (
                    <span key={r.idx} className="geo-route-item">
                      {i > 0 && <span className="geo-route-arrow" aria-hidden>→</span>}
                      <button
                        type="button"
                        className={`geo-chip ${r.idx === focus ? 'focus' : ''} ${current ? 'current' : reached ? 'reached' : ''}`}
                        aria-pressed={r.idx === focus}
                        title={reached ? `Flooded from ${tPlus(r.entryT)}` : hasRun && r.entryT > t ? `Flood arrives ${tPlus(r.entryT)}` : 'Not reached'}
                        onClick={() => pin(r.idx)}
                      >
                        {r.name}
                      </button>
                    </span>
                  );
                })}
                {focusIdx != null && (
                  <button type="button" className="geo-chip auto" onClick={() => setGeo({ focusIdx: null })} title="Follow the flood from district to district again">
                    Auto
                  </button>
                )}
              </div>
            )}

            <p className="geo-foot">
              Houses are illustrative, placed around OSM settlement points; they sink with the simulated water depth and collapse at AIDR hazard H5+.
              People counts come from the OSM places. Boundaries © OpenStreetMap.
            </p>
          </>
        )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------- risk-map overview

function RiskMapOverview({ open, hasRun }: { open: boolean; hasRun: boolean }) {
  const zones = useGeo((s) => s.zones);
  const districts = useGeo((s) => s.districts);
  const hoverDistrict = useGeo((s) => s.hoverDistrict);
  const hoverZone = useGeo((s) => s.hoverZone);
  const setGeo = useGeo((s) => s.set);
  const setUi = useUi((s) => s.set);
  const requestCamera = useUi((s) => s.requestCamera);
  const riskBasis = useUi((s) => s.riskBasis);
  const ensRunning = useEnsemble((s) => s.running);
  const ensMembers = useEnsemble((s) => s.members);
  useEnsemble((s) => s.version);
  const risk = geoBig.risk;
  const lit = hoverDistrict ?? hoverZone?.district ?? -1;
  const basis = zones?.basis;
  const shown = basis === 'prior' ? 'terrain' : basis;
  const ensDone = ensMembers.filter((m) => m.status === 'done').length;
  const ensProgress = ensMembers.length ? ensMembers.reduce((a, m) => a + (m.status === 'done' ? 1 : m.progress), 0) / ensMembers.length : 0;
  // an ensemble is available when it finished for this scenario (the engine re-checks the grid)
  const hasEns = !ensRunning && ensDone > 0;

  const runEnsemble = () => {
    const e = useEnsemble.getState();
    e.prepare(big.scenario?.config ?? null);
    e.run();
    setUi({ riskBasis: 'auto' });
  };
  const BASES = [
    { id: 'terrain', label: 'Terrain', ok: true, tip: 'Rank ground by height above the river and distance from it (no simulation)' },
    { id: 'run', label: 'This run', ok: hasRun, tip: hasRun ? 'What the simulated flood did over the whole event' : 'Run the simulation first' },
    { id: 'ensemble', label: '% of runs', ok: hasEns, tip: hasEns ? 'How often each place floods across the breach scenarios' : 'Run the ensemble first' },
  ] as const;

  // river districts first, then by expected deaths
  const rows = zones
    ? zones.districts
      .filter((r) => r.bandKm2.some((v) => v > 0))
      .sort((a, b) => Number(risk?.districts[b.district]?.touchesRiver) - Number(risk?.districts[a.district]?.touchesRiver) || b.deaths.mid - a.deaths.mid || b.lossCr.mid - a.lossCr.mid)
    : [];
  const tot = zones?.total;
  const lede = basis === 'ensemble'
    ? `Colours show how often each place floods across ${zones!.members} breach scenarios (narrow to wide breach, slow to fast). Hover a zone for its expected deaths and economic loss.`
    : basis === 'run'
      ? 'Colours show what the simulated flood did over the whole event. Hover any coloured zone for its tentative deaths and economic loss.'
      : 'Zones rank ground by how likely it is to flood if the dam fails (height above the river and distance from it). Hover any coloured zone for a tentative toll.';

  return (
    <>
      <div className="geo-title-row">
        <h3 className="geo-title">Districts on the river</h3>
      </div>
      <div className="rm-basis" role="group" aria-label="Map basis">
        {BASES.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`rm-basis-btn ${shown === b.id ? 'on' : ''}`}
            aria-pressed={shown === b.id}
            disabled={!b.ok}
            title={b.tip}
            onClick={() => setUi({ riskBasis: b.id })}
          >
            {b.label}
          </button>
        ))}
        {riskBasis !== 'auto' && <button type="button" className="rm-basis-btn auto" title="Best available: ensemble, then run, then terrain" onClick={() => setUi({ riskBasis: 'auto' })}>Auto</button>}
      </div>
      {ensRunning ? (
        <div className="rm-ens" role="status">
          <span>Running {ensMembers.length} breach scenarios… {ensDone}/{ensMembers.length}</span>
          <span className="rm-ens-bar"><i style={{ width: `${Math.round(ensProgress * 100)}%` }} /></span>
        </div>
      ) : !hasEns && (
        <div className="rm-ens">
          <span>Map how often each place floods, like a flood-frequency map.</span>
          <button type="button" className="geo-chip" onClick={runEnsemble} title="Runs 8 breach scenarios in parallel in the browser; takes a few minutes">Run 8 scenarios</button>
        </div>
      )}
      <p className="geo-lede">{lede}</p>

      {basis === 'ensemble' && <div className="rm-legend-title">Share of breach scenarios that flood the ground</div>}
      <div className="rm-legend" role="list" aria-label="Risk zones">
        {RISK_BANDS.map((b) => (
          <span key={b.band} role="listitem" className="rm-legend-item">
            <i style={{ background: b.color }} />{bandLabel(b.band, basis)}
          </span>
        ))}
      </div>
      <span className="geo-legend-ramp" style={{ background: RISK_CSS_GRADIENT, marginTop: 5 }} />

      {open && (
        <>
          <div className="geo-tiles">
            <div className="geo-tile warn">
              <span className="geo-tile-v">{tot ? fmtDeaths(tot.deaths) : '—'}</span>
              <span className="geo-tile-k">{basis === 'ensemble' ? 'expected deaths, all districts' : 'estimated deaths, all districts'}</span>
            </div>
            <div className="geo-tile">
              <span className="geo-tile-v">{tot ? fmtCrRange(tot.lossCr) : '—'}</span>
              <span className="geo-tile-k">economic loss (houses, roads)</span>
            </div>
          </div>

          <div className="rm-table" role="table" aria-label="Tentative toll by district">
            <div className="rm-row rm-head" role="row">
              <span role="columnheader">District</span>
              <span role="columnheader">Deaths</span>
              <span role="columnheader">Loss</span>
            </div>
            {rows.map((r) => {
              const dg = risk?.districts[r.district];
              const area = r.bandKm2[1] + r.bandKm2[2] + r.bandKm2[3] + r.bandKm2[4];
              return (
                <button
                  key={r.district}
                  type="button"
                  role="row"
                  className={`rm-row ${lit === r.district ? 'lit' : ''} ${dg?.touchesRiver ? '' : 'off-river'}`}
                  onMouseEnter={() => setGeo({ hoverDistrict: r.district })}
                  onMouseLeave={() => setGeo({ hoverDistrict: null })}
                  onFocus={() => setGeo({ hoverDistrict: r.district })}
                  onBlur={() => setGeo({ hoverDistrict: null })}
                  onClick={() => { if (dg?.domainBBox) { setUi({ follow: false }); requestCamera({ kind: 'fit-bbox', bbox: dg.domainBBox }); } }}
                  title={`${fmtInt(r.people)} people in modelled settlements · click to zoom`}
                >
                  <span role="cell" className="rm-name">
                    {districts[r.district]?.name}
                    <span className="rm-bar" aria-hidden>
                      {[4, 3, 2, 1].map((b) => (
                        <i key={b} style={{ width: `${area > 0 ? (r.bandKm2[b] / area) * 100 : 0}%`, background: RISK_BANDS.find((x) => x.band === b)!.color }} />
                      ))}
                    </span>
                  </span>
                  <span role="cell" className="rm-num death">{fmtDeaths(r.deaths)}</span>
                  <span role="cell" className="rm-num">{fmtCrRange(r.lossCr)}</span>
                </button>
              );
            })}
          </div>

          <p className="geo-foot">
            {basis === 'ensemble'
              ? `Ensemble basis: deaths and damage are worked out for each of the ${zones!.members} breach scenarios and averaged (expected toll if the dam fails).`
              : basis === 'run'
                ? 'Run basis: deaths and damage come from what the simulated water did to each settlement, house and road.'
                : 'Terrain basis: each zone is assumed to flood as its rank suggests; run the simulation or the ensemble for modelled figures.'}{' '}
            {ZONE_METHOD} Boundaries © OpenStreetMap.
          </p>
        </>
      )}
    </>
  );
}
