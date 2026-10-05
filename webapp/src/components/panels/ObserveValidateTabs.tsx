'use client';

import { Fragment, useMemo, useState } from 'react';
import { ClipboardCopy, Download, Info } from 'lucide-react';
import { useScenario } from '@/store/scenario';
import { useSim } from '@/store/sim';
import { big } from '@/lib/big';
import { storageAt } from '@/lib/breachSizing';
import { download } from '@/lib/exporters';
import { dur, fmtInt, fmtLatLng, fmtNum, fmtVolume } from '@/lib/format';
import { buildGeeScript, geeWindows } from '@/lib/gee';
import { checkStructures, nearestVertex, sectionAt, SECTION_NOTE, type StructureCheck } from '@/lib/cascade';

const RUN_FIRST = 'run the scenario first';

function useRunVersion() {
  // re-render when envelopes / series change
  const a = useSim((s) => s.summaryVersion);
  const b = useSim((s) => s.framesVersion);
  const status = useSim((s) => s.status);
  return { v: a * 100000 + b, status };
}

// ------------------------------------------------------------------ Observe

export function ObserveTab() {
  const cfg = useScenario((s) => s.config);
  const params = useSim((s) => s.params);
  const [copied, setCopied] = useState(false);

  const curve = useMemo(() => {
    if (!cfg) return null;
    const ss = cfg.dam.stageStorage;
    const z = ss.elevation;
    if (z.length < 2) return null;
    const pts = z.map((h, i) => {
      const a = i === 0 ? (ss.volume[1] - ss.volume[0]) / (z[1] - z[0])
        : i === z.length - 1 ? (ss.volume[i] - ss.volume[i - 1]) / (z[i] - z[i - 1])
        : (ss.volume[i + 1] - ss.volume[i - 1]) / (z[i + 1] - z[i - 1]);
      return { h, v: ss.volume[i], a: Math.max(0, a) };
    });
    return { pts, bed: z[0], top: z[z.length - 1] };
  }, [cfg]);

  if (!cfg || !curve) return <div className="empty"><b>No scenario loaded</b><span>Open a scenario to see its lake-growth curve.</span></div>;

  const level = params?.initialLevel ?? cfg.dam.initialLevel;
  const vol = storageAt(cfg.dam.stageStorage, level);
  const area = Math.max(0, (storageAt(cfg.dam.stageStorage, level + 0.5) - storageAt(cfg.dam.stageStorage, level - 0.5)));
  const vMax = Math.max(...curve.pts.map((p) => p.v)) || 1;
  const aMax = Math.max(...curve.pts.map((p) => p.a)) || 1;
  const W = 300, H = 170, L = 38, R = 38, T = 8, B = 24;
  const x = (h: number) => L + ((h - curve.bed) / (curve.top - curve.bed || 1)) * (W - L - R);
  const yv = (v: number) => H - B - (v / vMax) * (H - T - B);
  const ya = (a: number) => H - B - (a / aMax) * (H - T - B);
  const pv = curve.pts.map((p) => `${x(p.h).toFixed(1)},${yv(p.v).toFixed(1)}`).join(' ');
  const pa = curve.pts.map((p) => `${x(p.h).toFixed(1)},${ya(p.a).toFixed(1)}`).join(' ');
  const hLake = level - curve.bed;
  const ssMethod = cfg.dam.stageStorage.method;
  const win = geeWindows(cfg);
  const script = () => buildGeeScript(cfg);

  return (
    <>
      <section className="section">
        <p className="lede">Lake growth behind the {cfg.event === 'lake-outburst' ? 'blockage' : 'dam'}, from the {ssMethod === 'dem' ? 'real DEM' : 'fitted'} stage–storage table.</p>
        <div className="section-title"><span className="micro">Lake area &amp; volume vs level</span></div>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Lake area and volume versus water level" style={{ fontSize: 9 }}>
          <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke="currentColor" opacity={0.3} />
          <line x1={L} y1={T} x2={L} y2={H - B} stroke="currentColor" opacity={0.3} />
          <line x1={W - R} y1={T} x2={W - R} y2={H - B} stroke="currentColor" opacity={0.3} />
          <polyline points={pv} fill="none" stroke="var(--accent)" strokeWidth={1.8} />
          <polyline points={pa} fill="none" stroke="var(--cyan, #3ab)" strokeWidth={1.5} strokeDasharray="4 3" />
          {level >= curve.bed && level <= curve.top && (
            <g>
              <line x1={x(level)} x2={x(level)} y1={T} y2={H - B} stroke="var(--amber)" strokeWidth={1.2} />
              <text x={x(level) + 3} y={T + 9} fill="var(--amber)">level {fmtNum(level, 0)} m</text>
            </g>
          )}
          <text x={L} y={H - 6} fill="currentColor" opacity={0.7}>{fmtNum(curve.bed, 0)}</text>
          <text x={W - R} y={H - 6} fill="currentColor" opacity={0.7} textAnchor="end">{fmtNum(curve.top, 0)} m ASL</text>
          <text x={L - 3} y={T + 8} fill="var(--accent)" textAnchor="end">{fmtNum(vMax / 1e6, 0)}</text>
          <text x={L - 3} y={T + 18} fill="var(--accent)" textAnchor="end">Mm³</text>
          <text x={W - R + 3} y={T + 8} fill="var(--cyan, #3ab)">{fmtNum(aMax / 1e6, 2)}</text>
          <text x={W - R + 3} y={T + 18} fill="var(--cyan, #3ab)">km²</text>
        </svg>
        <p className="note">Solid: volume V(h). Dashed: area A = dV/dh (finite differences of the table). Amber: current initial level.</p>
      </section>

      <section className="section">
        <div className="card">
          <div className="card-head">
            <h3>Blockage candidate</h3>
            <span className="badge gray">{ssMethod === 'dem' ? 'Confidence: medium (DEM-derived)' : 'Confidence: low (fitted)'}</span>
          </div>
          <dl className="kv">
            <dt>Name</dt><dd>{cfg.dam.name}</dd>
            <dt>Location</dt><dd>{fmtLatLng(cfg.dam.lng, cfg.dam.lat)}</dd>
            <dt>Height (config)</dt><dd>{fmtNum(cfg.dam.height, 0)}<span className="unit">m</span></dd>
            <dt>Lake depth @ level</dt><dd>{fmtNum(hLake, 0)}<span className="unit">m</span></dd>
            <dt>Volume @ level</dt><dd>{fmtVolume(vol)}</dd>
            <dt>Area @ level</dt><dd>{fmtNum(area / 1e6, 2)}<span className="unit">km²</span></dd>
            {cfg.dam.publishedVolume != null && <><dt>Published volume</dt><dd>{fmtVolume(cfg.dam.publishedVolume)}</dd></>}
            <dt>Evidence</dt><dd>DEM stage–storage ({cfg.dam.stageStorage.elevation.length} levels)</dd>
          </dl>
          <p className="note">{cfg.dam.stageStorage.note} Confidence is a qualitative label: a 60 m, SRTM-era DEM does not see the lake that formed after the survey, nor bathymetry below the water surface.</p>
        </div>
      </section>

      <section className="section">
        <div className="section-title"><span className="micro">Satellite check (Google Earth Engine)</span></div>
        <p className="note">Sentinel-1 GRD VV before/after ratio change detection (UN-SPIDER Recommended Practice, threshold 1.25) + Sentinel-2 NDWI water mask over the scenario box, exporting GeoTIFF masks to Drive.</p>
        <dl className="kv">
          <dt>Before</dt><dd>{win.before[0]} → {win.before[1]}</dd>
          <dt>After</dt><dd>{win.after[0]} → {win.after[1]}</dd>
        </dl>
        <p className="note">{win.label}.</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn sm" onClick={() => { void navigator.clipboard?.writeText(script()).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
            <ClipboardCopy size={14} /> {copied ? 'Copied' : 'Copy GEE script'}
          </button>
          <button type="button" className="btn sm" onClick={() => download(`${cfg.id}-water-gee.js`, script(), 'text/javascript')}>
            <Download size={14} /> Download .js
          </button>
        </div>
        <div className="callout amber" style={{ marginTop: 8 }}><Info size={15} /><span>Run it in the Earth Engine Code Editor (account required). Results are <b>not yet imported back</b> into this app.</span></div>
      </section>

      <section className="section">
        <div className="section-title"><span className="micro">Data provenance</span></div>
        <dl className="kv">
          <dt>DEM</dt><dd>{cfg.dem.source}</dd>
          <dt>DEM retrieved</dt><dd>{cfg.dem.retrieved}</dd>
          <dt>Conditioning</dt><dd>{cfg.dem.conditioning}</dd>
          <dt>Exposure</dt><dd>{big.scenario?.exposure.source ?? '—'}</dd>
          <dt>OSM retrieved</dt><dd>{big.scenario?.exposure.retrieved ?? '—'}</dd>
          <dt>River path</dt><dd>{big.scenario?.river.method ?? '—'}</dd>
        </dl>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ Validate

const VERIFIED = [
  ['Ritter dry-bed dam break (h0 10 m, 30 s)', 'L1 depth error 2.10 / 1.32 / 0.82 % at dx 10 / 5 / 2.5 m (converging)'],
  ['Stoker wet-bed dam break (10 m / 1 m)', 'bore position −0.43 % of travel; plateau −0.49 %'],
  ['Lake at rest, rough bed, 1000 steps', 'max |u| 7.3e-14 m/s; volume change 0'],
  ['Mass balance, synthetic valley, 2 h', 'error 3.3e-13 %'],
  ['Piping breach, 1 h', 'mass error −4.7e-14 %'],
  ['Real DEM rishiganga-2021, 6 h', 'mass error −5.6e-13 %; peak breach outflow 99,635 m³/s'],
];

// Shugar et al. (2021) Science 373:300–306, doi:10.1126/science.abh4455
const SHUGAR = { upper: 25, lower: 16, qLo: 8200, qHi: 14200 };

function verdictBadge(ok: boolean | null, txt?: string) {
  if (ok == null) return <span className="badge gray">{txt ?? 'n/a'}</span>;
  return <span className="badge" style={{ background: ok ? 'var(--green, #3a6)' : 'var(--amber)', color: '#000' }}>{txt ?? (ok ? 'within range' : 'outside range')}</span>;
}

export function ValidateTab() {
  const cfg = useScenario((s) => s.config);
  const mass = useSim((s) => s.mass);
  const { v, status } = useRunVersion();
  const hasRun = status !== 'idle' && status !== 'no-scenario' && big.dam.t.length > 0;

  const hind = useMemo(() => {
    const sc = big.scenario;
    if (!cfg || !sc || cfg.id !== 'rishiganga-2021' || !hasRun || !big.env) return null;
    const peakOut = Math.max(0, ...big.dam.outflow);
    const reni = sc.exposure.places.find((p) => /^reni$/i.test(p.name));
    const jm = sc.exposure.places.find((p) => /vishnuprayag hydro/i.test(p.name)) ?? sc.exposure.places.find((p) => /^joshimath$/i.test(p.name));
    const iR = reni ? nearestVertex(sc, [reni.lng, reni.lat]).i : -1;
    const iJ = jm ? nearestVertex(sc, [jm.lng, jm.lat]).i : -1;
    const sR = iR >= 0 ? sectionAt(sc, big.env, iR) : null;
    const sJ = iJ >= 0 ? sectionAt(sc, big.env, iJ) : null;
    const speed = (c0: number, t0: number, c1: number, t1: number) => (t1 > t0 && t0 >= 0 ? (c1 - c0) / (t1 - t0) : null);
    const upper = sR && sR.arrival >= 0 ? speed(0, 0, sR.chainage, sR.arrival) : null;
    const lower = sR && sJ && sJ.arrival >= 0 ? speed(sR.chainage, sR.arrival, sJ.chainage, sJ.arrival) : null;
    return { peakOut, sR, sJ, upper, lower, jmName: jm?.name ?? '—' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, hasRun, v]);

  if (!cfg) return <div className="empty"><b>No scenario loaded</b></div>;
  const inR = (x: number, lo: number, hi: number) => x >= lo && x <= hi;

  return (
    <>
      <section className="section">
        <div className="section-title"><span className="micro">Solver verification, last verified run</span><span className="badge gray">not live</span></div>
        <dl className="kv">
          {VERIFIED.map(([k, val]) => <Fragment key={k}><dt>{k}</dt><dd>{val}</dd></Fragment>)}
        </dl>
        <p className="note">From <code>npm run verify:engine</code> (<code>scripts/verify-engine.ts</code>), measured 2026-09-29 as recorded in docs/ENGINE.md. Re-run the script to refresh; these are not computed in the browser.</p>
      </section>

      <section className="section">
        <div className="section-title"><span className="micro">Mass ledger, current run</span></div>
        {mass ? (
          <dl className="kv">
            <dt>Released</dt><dd>{fmtVolume(mass.released)}</dd>
            <dt>Stored in domain</dt><dd>{fmtVolume(mass.stored)}</dd>
            <dt>Left domain</dt><dd>{fmtVolume(mass.leftDomain)}</dd>
            <dt>Error</dt><dd>{mass.errorPct.toExponential(2)} %</dd>
          </dl>
        ) : <p className="note">No ledger yet. {RUN_FIRST}.</p>}
      </section>

      <section className="section">
        <div className="section-title"><span className="micro">2021 hindcast</span></div>
        {cfg.id !== 'rishiganga-2021' ? (
          <p className="note">Only available for the rishiganga-2021 scenario (no published observations wired for {cfg.name}).</p>
        ) : !hind ? (
          <p className="note">Model values not available. {RUN_FIRST}.</p>
        ) : (
          <>
            <dl className="kv">
              <dt>Model peak breach outflow</dt>
              <dd>{fmtInt(hind.peakOut)}<span className="unit">m³/s</span> {verdictBadge(inR(hind.peakOut, SHUGAR.qLo, SHUGAR.qHi))}</dd>
              <dt>Model peak Q at Reni (Raini)*</dt>
              <dd>{hind.sR && hind.sR.arrival >= 0 ? <>{fmtInt(hind.sR.peakQ)}<span className="unit">m³/s</span> {verdictBadge(inR(hind.sR.peakQ, SHUGAR.qLo, SHUGAR.qHi))}</> : 'not reached'}</dd>
              <dt>Observed peak Q at Raini</dt><dd>{fmtInt(SHUGAR.qLo)}–{fmtInt(SHUGAR.qHi)}<span className="unit">m³/s</span></dd>
              <dt>Front speed dam → Reni</dt>
              <dd>{hind.upper != null ? <>{fmtNum(hind.upper, 1)} m/s {verdictBadge(Math.abs(hind.upper - SHUGAR.upper) / SHUGAR.upper <= 0.3, `obs ~${SHUGAR.upper}`)}</> : 'not reached'}</dd>
              <dt>Front speed Reni → {hind.jmName}</dt>
              <dd>{hind.lower != null ? <>{fmtNum(hind.lower, 1)} m/s {verdictBadge(Math.abs(hind.lower - SHUGAR.lower) / SHUGAR.lower <= 0.3, `obs ~${SHUGAR.lower}`)}</> : 'not reached'}</dd>
              {hind.sR && <><dt>Arrival at Reni</dt><dd>{hind.sR.arrival >= 0 ? `T+${dur(hind.sR.arrival)}` : '—'} <span className="faint">· {fmtNum(hind.sR.chainage / 1000, 1)} km</span></dd></>}
              {hind.sJ && <><dt>Arrival at {hind.jmName}</dt><dd>{hind.sJ.arrival >= 0 ? `T+${dur(hind.sJ.arrival)}` : '—'} <span className="faint">· {fmtNum(hind.sJ.chainage / 1000, 1)} km</span></dd></>}
            </dl>
            <p className="note">Speed = Δ chainage along the traced river path / Δ arrival (depth &gt; 0.1 m) at the nearest path vertices; the upper reach is timed from breach start. Front-speed verdict: within ±30 % of the observed mean (a tolerance chosen here, not from the paper). * {SECTION_NOTE}</p>
            <p className="note">Observations: Shugar, D. H. et al. (2021) A massive rock and ice avalanche caused the 2021 disaster at Chamoli, Indian Himalaya. Science 373:300-306. Front speeds ~25 m/s (upper reach) and ~16 m/s (lower), peak discharge 8,200-14,200 m³/s at Raini. Reni is the OSM spelling of Raini.</p>
            <div className="callout amber"><Info size={15} /><span>The 2021 event was a rock–ice avalanche turning into a <b>debris flow</b>; this model is clear-water shallow-water flow from an illustrative lake breach. Agreement or disagreement is indicative only.</span></div>
          </>
        )}
      </section>

      <section className="section">
        <div className="section-title"><span className="micro">Satellite flood-extent IoU</span><span className="badge gray">not done</span></div>
        <p className="note">Not done: needs an imported Sentinel-1 water mask (see Observe → GEE script). No comparison is made.</p>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ Cascade

const V_COLOR: Record<string, string> = { overtops: 'var(--red, #d44)', 'below crest': 'var(--green, #3a6)' };

function CheckRow({ c }: { c: StructureCheck }) {
  const col = V_COLOR[c.verdict];
  return (
    <div className="card" style={{ marginBottom: 8 }}>
      <div className="card-head">
        <h3>{c.s.name}</h3>
        <span className={col ? 'badge' : 'badge gray'} style={col ? { background: col, color: '#000' } : undefined}>{c.verdict}</span>
      </div>
      <dl className="kv">
        {c.s.located && <><dt>Location</dt><dd>{fmtLatLng(c.s.lng, c.s.lat)}{Number.isFinite(c.distM) && <span className="faint"> · {fmtInt(c.distM)} m from path</span>}</dd></>}
        {c.sec && <><dt>Chainage</dt><dd>{fmtNum(c.sec.chainage / 1000, 1)}<span className="unit">km</span></dd></>}
        {c.sec && <><dt>Arrival</dt><dd>{c.sec.arrival >= 0 ? `T+${dur(c.sec.arrival)}` : 'not reached'}</dd></>}
        {c.sec && c.sec.arrival >= 0 && <>
          <dt>Peak depth (channel)</dt><dd>{fmtNum(c.sec.peakDepth, 1)}<span className="unit">m</span></dd>
          <dt>Peak water surface</dt><dd>{fmtNum(c.sec.peakWse, 1)}<span className="unit">m ASL</span></dd>
          <dt>Peak Q*</dt><dd>{fmtInt(c.sec.peakQ)}<span className="unit">m³/s</span></dd>
        </>}
        <dt>Height</dt><dd>{c.s.height != null ? <>{fmtNum(c.s.height, 1)}<span className="unit">m</span></> : 'height unknown'}</dd>
        {c.crest != null && <><dt>Crest (bed + height)*</dt><dd>{fmtNum(c.crest, 1)}<span className="unit">m ASL</span></dd></>}
        <dt>Spillway capacity</dt><dd>{c.s.capacity != null ? `${fmtInt(c.s.capacity)} m³/s` : 'capacity not verified'}</dd>
        <dt>Source</dt><dd>{c.s.source}</dd>
      </dl>
      {c.s.note && <p className="note">{c.s.note}</p>}
    </div>
  );
}

export function CascadeTab() {
  const cfg = useScenario((s) => s.config);
  const version = useScenario((s) => s.version);
  const { v, status } = useRunVersion();
  const hasRun = status !== 'idle' && status !== 'no-scenario' && big.dam.t.length > 0;

  const checks = useMemo(() => {
    const sc = big.scenario;
    if (!cfg || !sc) return null;
    return checkStructures(sc, hasRun ? big.env : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, version, hasRun, v]);

  if (!cfg || !checks) return <div className="empty"><b>No scenario loaded</b></div>;
  const onPath = checks.filter((c) => c.sec || c.verdict === 'not reached');

  return (
    <>
      <section className="section">
        <div className="callout amber"><Info size={15} /><span>Indicative cascade check from one model run. Not a structural or dam-safety assessment.</span></div>
        {!hasRun && <p className="note">Arrival, depth and discharge need a run. {RUN_FIRST}.</p>}
      </section>

      <section className="section">
        <div className="section-title"><span className="micro">Scenario tree</span></div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
          <li><b>{cfg.dam.name}</b> breaches{hasRun ? ` · peak outflow ${fmtInt(Math.max(0, ...big.dam.outflow))} m³/s` : ''}</li>
          {onPath.map((c) => (
            <li key={c.s.id}>
              → <b>{c.s.name}</b>: {c.verdict === 'overtops' ? 'OVERTOPS (failure possible, adds its storage downstream)'
                : c.verdict === 'below crest' ? 'survives overtopping check'
                : c.verdict === 'height unknown' ? 'reached; overtopping undetermined (height unknown)'
                : 'not reached in this run'}
            </li>
          ))}
          <li>→ downstream / basin hand-off{cfg.basinHandoff ? ` (${cfg.basinHandoff.reachId})` : ''}</li>
        </ol>
      </section>

      <section className="section">
        <div className="section-title"><span className="micro">Downstream structures</span><span className="badge gray">{checks.length}</span></div>
        {checks.length === 0 && <p className="note">No hydro structures in this scenario's exposure data.</p>}
        {checks.map((c) => <CheckRow key={c.s.id} c={c} />)}
        <p className="note">Overtops if peak water surface (max of ground + peak depth across the section) &gt; crest; crest = river-path bed at the nearest vertex + structure height. Structures &gt; 1.5 km from the traced river path are not evaluated. * {SECTION_NOTE}</p>
      </section>
    </>
  );
}
