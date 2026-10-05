'use client';

import { useMemo, useState } from 'react';
import { ClipboardCopy, Download, Info, Play } from 'lucide-react';
import { useScenario } from '@/store/scenario';
import { useSim } from '@/store/sim';
import { useAnalytics } from '@/store/analytics';
import { big } from '@/lib/big';
import { storageAt } from '@/lib/breachSizing';
import { capAlert, download, floodedBboxPolygon } from '@/lib/exporters';
import { dur, fmtInt, fmtNum, fmtVolume } from '@/lib/format';
import type { ScenarioConfig, Place } from '@/types/scenario';
import { fillDepressions } from '@/engine/terrain';

// ------------------------------------------------------------------ helpers

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const lin = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));
const SETTLEMENT = new Set(['city', 'town', 'village', 'hamlet']);

function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toR, dLng = (b[0] - a[0]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Lake surface area at a level, m², as dV/dh of the stage–storage table. */
function lakeArea(cfg: ScenarioConfig, level: number): number {
  const ss = cfg.dam.stageStorage;
  const h = 0.5;
  return Math.max(0, (storageAt(ss, level + h) - storageAt(ss, level - h)) / (2 * h));
}

/** D8 contributing area (km²) at the dam, computed on the scenario DEM only — clipped to the box, so a lower bound. */
function catchmentKm2(cfg: ScenarioConfig, dem0: Float32Array): { km2: number; clipped: boolean } | null {
  const { cols, rows, dx, dy } = cfg.grid;
  const n = cols * rows;
  if (dem0.length !== n) return null;
  // fill pits/flats first so D8 flow reaches the channel instead of stopping in SRTM noise
  const dem = Float64Array.from(dem0);
  fillDepressions(dem, cols, rows);
  const [w, s, e, nb] = cfg.bbox as unknown as [number, number, number, number];
  const c0 = Math.floor(((cfg.dam.lng - w) / (e - w)) * cols);
  const r0 = Math.floor(((nb - cfg.dam.lat) / (nb - s)) * rows);
  if (c0 < 0 || r0 < 0 || c0 >= cols || r0 >= rows) return null;
  const order = new Uint32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => dem[b] - dem[a]);
  const acc = new Float64Array(n).fill(1);
  // edge[k] = 1 if any cell draining through k lies on the box edge (catchment cut off by the box)
  const edge = new Uint8Array(n);
  for (let c = 0; c < cols; c++) { edge[c] = 1; edge[(rows - 1) * cols + c] = 1; }
  for (let r = 0; r < rows; r++) { edge[r * cols] = 1; edge[r * cols + cols - 1] = 1; }
  const diag = Math.hypot(dx, dy);
  for (let q = 0; q < n; q++) {
    const k = order[q];
    const r = (k / cols) | 0, c = k - r * cols;
    let best = -1, bs = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const j = rr * cols + cc;
      const sl = (dem[k] - dem[j]) / (dr && dc ? diag : dr ? dy : dx);
      if (sl > bs) { bs = sl; best = j; }
    }
    if (best >= 0) { acc[best] += acc[k]; if (edge[k]) edge[best] = 1; }
  }
  // max accumulation within ~500 m of the dam point (snaps to the channel)
  const rr = Math.ceil(500 / dy), rc = Math.ceil(500 / dx);
  let m = 0, mk = -1;
  for (let r = r0 - rr; r <= r0 + rr; r++) for (let c = c0 - rc; c <= c0 + rc; c++) {
    if (r < 0 || c < 0 || r >= rows || c >= cols) continue;
    const k = r * cols + c;
    if (acc[k] > m) { m = acc[k]; mk = k; }
  }
  return { km2: (m * dx * dy) / 1e6, clipped: mk >= 0 && edge[mk] === 1 };
}

interface Factor { key: string; group: 'Hazard' | 'Consequence' | 'Confidence'; label: string; value: string; pts: number; max: number; tip: string }

interface RiskResult {
  score: number;
  band: 'Green' | 'Amber' | 'Red';
  dbi: number;
  dbiBand: 'stable' | 'uncertain' | 'unstable';
  Ab: number; AbMethod: string; Hd: number; Vd: number;
  lakeV: number; lakeA: number;
  people: number; peopleMethod: string; typicalFrac: number;
  nearestKm: number | null; nearestName: string | null;
  factors: Factor[];
}

function computeRisk(cfg: ScenarioConfig, level: number, dem: Float32Array | null, places: Place[], runRows: typeof big.places): RiskResult {
  const Hd = cfg.dam.height;
  const Vd = cfg.dam.crestLength * Hd * (Hd * 2);
  const lakeV = storageAt(cfg.dam.stageStorage, level);
  const lakeA = lakeArea(cfg, level);
  const cat = dem ? catchmentKm2(cfg, dem) : null;
  let Ab: number, AbMethod: string, clipped = false;
  if (cat && cat.km2 > 0.01) {
    Ab = cat.km2; clipped = cat.clipped;
    AbMethod = cat.clipped
      ? 'D8 flow accumulation on the depression-filled scenario DEM; the catchment runs past the model box edge, so this is a LOWER BOUND and DBI is a lower bound too'
      : 'D8 flow accumulation on the depression-filled scenario DEM (whole catchment inside the box)';
  } else { Ab = (lakeA / 1e6) * 10; AbMethod = 'Estimate: 10 × lake area (DEM accumulation unavailable)'; }
  // Ermini & Casagli (2003): A_b in km², H_d in m, V_d in 10⁶ m³
  const dbi = Math.log10((Ab * Hd) / (Vd / 1e6));
  const dbiBand = dbi > 3.08 ? 'unstable' : clipped ? 'uncertain' : dbi < 2.75 ? 'stable' : 'uncertain';

  // exposure
  let people = 0, typicalPop = 0, peopleMethod: string;
  if (runRows.some((r) => r.flooded)) {
    for (const r of runRows) if (r.flooded && r.place.population) { people += r.place.population; if (r.place.populationSource === 'typical') typicalPop += r.place.population; }
    peopleMethod = 'Population in places flooded (≥ 0.3 m) in the latest run';
  } else {
    for (const p of places) if (p.population) { people += p.population; if (p.populationSource === 'typical') typicalPop += p.population; }
    peopleMethod = 'No flooded places yet (run the scenario), so this counts all populated places inside the model box';
  }
  const typicalFrac = people > 0 ? typicalPop / people : 0;
  let nearestKm: number | null = null, nearestName: string | null = null;
  for (const p of places) {
    if (!SETTLEMENT.has(p.kind)) continue;
    const d = haversineKm([cfg.dam.lng, cfg.dam.lat], [p.lng, p.lat]);
    if (nearestKm == null || d < nearestKm) { nearestKm = d; nearestName = p.name; }
  }

  const factors: Factor[] = [
    { key: 'dbi', group: 'Hazard', label: 'Blockage index DBI', value: fmtNum(dbi, 2), max: 40, pts: 40 * lin(dbi, 2.0, 3.5),
      tip: 'Linear 0→40 pts for DBI 2.0→3.5 (spans the 2.75 / 3.08 Ermini & Casagli bands).' },
    { key: 'vol', group: 'Hazard', label: 'Lake volume', value: fmtVolume(lakeV), max: 15, pts: 15 * lin(Math.log10(Math.max(lakeV, 1)), 5, 9),
      tip: 'Linear on log10 V: 10⁵ m³ → 0, 10⁹ m³ → 15 pts. From the DEM stage–storage table at the start level.' },
    { key: 'h', group: 'Hazard', label: 'Dam height', value: `${fmtNum(Hd, 0)} m`, max: 10, pts: 10 * lin(Hd, 10, 150),
      tip: 'Linear 10 m → 0, 150 m → 10 pts.' },
    { key: 'pop', group: 'Consequence', label: 'People downstream', value: fmtInt(people), max: 25, pts: 25 * lin(Math.log10(Math.max(people, 1)), 1, 5),
      tip: `Linear on log10 people: 10 → 0, 100 000 → 25 pts. ${peopleMethod}.` },
    { key: 'dist', group: 'Consequence', label: 'Nearest settlement', value: nearestKm != null ? `${fmtNum(nearestKm, 1)} km` : 'none', max: 10,
      pts: nearestKm != null ? 10 * (1 - lin(nearestKm, 0, 30)) : 0,
      tip: `Straight-line distance from the dam to the nearest OSM city/town/village/hamlet${nearestName ? ` (${nearestName})` : ''}: 0 km → 10, ≥ 30 km → 0 pts.` },
    { key: 'conf', group: 'Confidence', label: '“Typical” populations', value: `${fmtInt(typicalFrac * 100)} %`, max: 0, pts: -5 * typicalFrac,
      tip: 'Penalty up to −5 pts in proportion to people counted from placeholder “typical” populations rather than OSM/census.' },
  ];
  const score = Math.round(Math.max(0, Math.min(100, factors.reduce((a, f) => a + f.pts, 0))));
  const band = score >= 70 ? 'Red' : score >= 40 ? 'Amber' : 'Green';
  return { score, band, dbi, dbiBand, Ab, AbMethod, Hd, Vd, lakeV, lakeA, people, peopleMethod, typicalFrac, nearestKm, nearestName, factors };
}

const BAND_COLOR = { Green: 'var(--green)', Amber: 'var(--amber)', Red: 'var(--red, #e5484d)' } as const;

// ------------------------------------------------------------------ Risk

export function RiskTab() {
  const cfg = useScenario((s) => s.config);
  const version = useScenario((s) => s.version);
  const params = useSim((s) => s.params);
  const status = useSim((s) => s.status);
  const run = useSim((s) => s.run);
  const placesVersion = useAnalytics((s) => s.placesVersion);
  const [stamp] = useState(() => new Date());

  const level = params?.initialLevel ?? cfg?.dam.initialLevel ?? 0;
  const res = useMemo(() => {
    const sc = big.scenario;
    if (!cfg || !sc) return null;
    return computeRisk(cfg, level, sc.dem, sc.exposure.places, big.places);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, level, version, placesVersion]);

  if (!cfg || !res) return <div className="empty"><b>No scenario loaded</b><span>Open a scenario to compute its risk index.</span></div>;
  const maxPts = 40;
  return (
    <>
      <section className="section">
        <div className="callout cyan"><Info size={15} /><span>Score from published stability indices, summed from the factors below. No machine-learned model is involved.</span></div>
      </section>
      <section className="section">
        <div className="card">
          <div className="card-head">
            <h3>Blockage-failure risk</h3>
            <span className="badge" style={{ background: BAND_COLOR[res.band], color: '#000' }}>{res.band}</span>
          </div>
          <div style={{ fontSize: 36, fontWeight: 700, color: BAND_COLOR[res.band] }}>{res.score}<span className="unit"> / 100</span></div>
          <p className="note">Bands: Green &lt; 40, Amber 40–69, Red ≥ 70. Score = sum of the factor points below, clamped to 0–100.</p>
        </div>
      </section>
      <section className="section">
        <div className="section-title"><span className="micro">Factor contributions (points)</span></div>
        {res.factors.map((f) => (
          <div key={f.key} data-tip={f.tip} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', fontSize: 12 }}>
              <span>{f.label} <span className="faint">· {f.group} · {f.value}</span></span>
              <span className="spacer" style={{ flex: 1 }} />
              <b>{f.pts >= 0 ? '+' : ''}{fmtNum(f.pts, 1)}</b>
            </div>
            <div style={{ height: 6, background: 'var(--line, rgba(128,128,128,.2))', borderRadius: 3, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3,
                width: `${(Math.abs(f.pts) / maxPts) * 100}%`, background: f.pts < 0 ? 'var(--amber)' : f.group === 'Hazard' ? 'var(--accent)' : 'var(--cyan, #3ab)' }} />
            </div>
          </div>
        ))}
      </section>
      <section className="section">
        <div className="section-title"><span className="micro">Dimensionless Blockage Index</span><span className="badge gray">{res.dbiBand}</span></div>
        <p className="note"><b>DBI = log₁₀(A_b · H_d / V_d)</b> (A_b km², H_d m, V_d 10⁶ m³); &lt; 2.75 stable, 2.75–3.08 uncertain, &gt; 3.08 unstable.</p>
        <dl className="kv">
          <dt data-tip={res.AbMethod}>A_b catchment*</dt><dd>{fmtNum(res.Ab, 1)}<span className="unit">km²</span></dd>
          <dt>H_d dam height</dt><dd>{fmtNum(res.Hd, 1)}<span className="unit">m</span></dd>
          <dt data-tip="Approximation: crest length × height × (2 × height), i.e. a trapezoid-like body with base ≈ 2H. Not a surveyed volume.">V_d dam volume*</dt><dd>{fmtVolume(res.Vd)}</dd>
          <dt>DBI</dt><dd>{res.AbMethod.includes('LOWER BOUND') ? '≥ ' : ''}{fmtNum(res.dbi, 2)}</dd>
          <dt>Lake area @ level</dt><dd>{fmtNum(res.lakeA / 1e6, 2)}<span className="unit">km²</span></dd>
        </dl>
        <p className="note">* Approximations. A_b: {res.AbMethod}. V_d ≈ crest length · H · 2H. Lake area = dV/dh of the DEM stage–storage table. People: {res.peopleMethod}.</p>
        <p className="note">Ermini, L. &amp; Casagli, N. (2003) Prediction of the behaviour of landslide dams using a geomorphological dimensionless index. Earth Surf. Process. Landforms 28:31–47. Casagli &amp; Ermini (1999) J. Japan Soc. Erosion Control 52(3).</p>
      </section>
      {res.score >= 70 && (
        <section className="section">
          <div className="card" style={{ borderColor: BAND_COLOR.Red }}>
            <div className="card-head"><h3>Trigger: scenario job created</h3><span className="badge" style={{ background: BAND_COLOR.Red, color: '#000' }}>≥ 70</span></div>
            <dl className="kv">
              <dt>Timestamp</dt><dd>{stamp.toISOString().replace('T', ' ').slice(0, 19)} UTC</dd>
              <dt>Evidence</dt><dd>score {res.score}, DBI {fmtNum(res.dbi, 2)} ({res.dbiBand}), {fmtInt(res.people)} people</dd>
              <dt>Model version</dt><dd>risk-index v1</dd>
              <dt>Data version</dt><dd>DEM {cfg.dem.retrieved}</dd>
            </dl>
            <button type="button" className="btn" disabled={status === 'running' || status === 'initializing'} onClick={run}
              data-tip="Start the breach simulation with the current Event parameters.">
              <Play size={14} /> Run breach scenario
            </button>
          </div>
        </section>
      )}
    </>
  );
}

// ------------------------------------------------------------------ Warn

const HAZ = ['None', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'];

function capField(xml: string, tag: string, nth = 0): string {
  const all = [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g'))];
  return all[nth]?.[1]?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'") ?? '';
}

export function WarnTab() {
  const cfg = useScenario((s) => s.config);
  const status = useSim((s) => s.status);
  const playhead = useSim((s) => s.playhead);
  const placesVersion = useAnalytics((s) => s.placesVersion);
  const [lang, setLang] = useState<'both' | 'en' | 'hi'>('both');
  const [copied, setCopied] = useState(false);

  const data = useMemo(() => {
    const sc = big.scenario;
    if (!cfg || !sc || !big.places.length || status === 'idle' || status === 'no-scenario') return null;
    const rows = big.places;
    const poly = big.env ? floodedBboxPolygon({ bbox: sc.config.bbox, grid: sc.config.grid }, big.env, playhead) : null;
    const xml = capAlert(rows, cfg, poly);
    const reached = rows.filter((r) => r.arrival >= 0).sort((a, b) => a.arrival - b.arrival);
    return { xml, reached, rows, poly };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, status, placesVersion]);

  if (!cfg) return <div className="empty"><b>No scenario loaded</b></div>;
  if (!data || !data.reached.length) {
    return <div className="empty"><b>No run yet</b><span>Press <b>Run</b> to simulate the breach; the CAP 1.2 alert preview is built from that run's arrival times and hazard.</span></div>;
  }
  const { xml, reached, rows } = data;
  const en = { h: capField(xml, 'headline', 0), d: capField(xml, 'description', 0), i: capField(xml, 'instruction', 0) };
  const hi = { h: capField(xml, 'headline', 1), d: capField(xml, 'description', 1), i: capField(xml, 'instruction', 1) };
  const text = (m: typeof en) => `${m.h}\n\n${m.d}\n\n${m.i}`;
  const msg = lang === 'en' ? text(en) : lang === 'hi' ? text(hi) : `${text(en)}\n\n---\n\n${text(hi)}`;

  return (
    <>
      <section className="section">
        <div className="callout amber"><Info size={15} /><span>CAP 1.2 status <b>Exercise</b>. Generated from a model run, so it is not an official warning.</span></div>
        <dl className="kv">
          <dt>Severity</dt><dd>{capField(xml, 'severity')}</dd>
          <dt>Urgency</dt><dd>{capField(xml, 'urgency')}</dd>
          <dt>Certainty</dt><dd>{capField(xml, 'certainty')}</dd>
          <dt>Response</dt><dd>{capField(xml, 'responseType')}</dd>
          <dt>Places reached</dt><dd>{fmtInt(reached.length)} <span className="faint">({fmtInt(reached.filter((r) => r.flooded).length)} flooded ≥ 0.3 m)</span></dd>
        </dl>
      </section>
      <section className="section">
        <div className="section-title"><span className="micro">Priority list (by arrival)</span></div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
          {reached.slice(0, 30).map((r) => (
            <li key={r.place.id} style={{ marginBottom: 3 }}>
              <b>{r.place.name}</b> <span className="faint">{r.place.kind}</span> · T+{dur(r.arrival)} · {HAZ[r.hazard] ?? r.hazard} · {fmtNum(r.peakDepth, 1)} m
            </li>
          ))}
        </ol>
        {reached.length > 30 && <p className="note">+{reached.length - 30} more in the CAP file / evacuation CSV.</p>}
      </section>
      <section className="section">
        <div className="section-title">
          <span className="micro">Message</span>
          <span style={{ display: 'flex', gap: 4 }}>
            {(['both', 'en', 'hi'] as const).map((l) => (
              <button key={l} type="button" className="btn ghost sm" aria-pressed={lang === l} onClick={() => setLang(l)}>
                {l === 'both' ? 'EN | HI' : l.toUpperCase()}
              </button>
            ))}
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: lang === 'both' ? '1fr 1fr' : '1fr', gap: 8, fontSize: 12 }}>
          {lang !== 'hi' && <div className="card" lang="en"><b>{en.h}</b><p>{en.d}</p><p>{en.i}</p></div>}
          {lang !== 'en' && <div className="card" lang="hi"><b>{hi.h}</b><p>{hi.d}</p><p>{hi.i}</p></div>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" className="btn sm" onClick={() => {
            const sc = big.scenario;
            const poly = sc && big.env ? floodedBboxPolygon({ bbox: sc.config.bbox, grid: sc.config.grid }, big.env, useSim.getState().playhead) : null;
            download(`${cfg.id}-alert.cap.xml`, capAlert(rows, cfg, poly), 'application/xml');
          }}><Download size={14} /> Download CAP XML</button>
          <button type="button" className="btn sm" onClick={() => { void navigator.clipboard?.writeText(msg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>
            <ClipboardCopy size={14} /> {copied ? 'Copied' : 'Copy message'}
          </button>
        </div>
      </section>
    </>
  );
}
