/* Chamoli 2021 check for the risk map's tentative toll: `npm run verify:chamoli`
 *
 * Runs the rishiganga-2021 scenario headless with its default breach, then puts the risk-map
 * estimates (lib/zoneLoss.ts, run basis, whole event) next to what the 7 Feb 2021 disaster
 * actually did. It is a sanity check, not a calibration: the scenario models an ILLUSTRATIVE water
 * blockage sized to the real avalanche volume, not the rock-ice debris flow that happened.
 *
 * Observed (sources):
 *  - 204 dead or missing; 190 of them workers at the Rishiganga (13.2 MW) and Tapovan-Vishnugad
 *    (520 MW) hydropower sites, ~140 at Tapovan. Shugar et al. (2021) Science 373:300-306,
 *    doi:10.1126/science.abh4455.
 *  - ~₹1,500 crore damage to the NTPC Tapovan-Vishnugad project alone (Union Power Minister,
 *    Feb 2021); the Rishiganga project was destroyed.
 *  - Reni (Raini) bridge destroyed (OSM tags it "Destroyed"); the Rishiganga intake is beside it.
 *    The Tapovan barrage, on the Dhauliganga below Tapoban, was overwhelmed. Joshimath, ~300 m
 *    above the river, was not flooded. The village points themselves sit on the valley sides, so
 *    the check looks at the river channel at each site, not the village marker.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EngineRuntime, type EngineInit } from '../src/engine/runtime';
import type { LoadedScenario } from '../src/lib/data';
import type { DistrictData } from '../src/types/districts';
import type { ExposureData, RiverPath, ScenarioConfig } from '../src/types/scenario';
import { assessPlaces, FLOOD_DEPTH } from '../src/lib/impact';
import type { Envelopes } from '../src/lib/frames';
import { aidrClass } from '../src/lib/hazard';
import { lifeLoss, type WarningPolicy } from '../src/lib/lifeLoss';
import { GeoRisk } from '../src/lib/geoRisk';
import { generateSettlements } from '../src/lib/settlements';
import { aggregateZones, buildZoneIndex, fmtCrRange, fmtDeaths } from '../src/lib/zoneLoss';
import { cellOf } from '../src/lib/grid';

const ID = 'rishiganga-2021';
const root = join(__dirname, '..', 'public');
const json = <T>(p: string) => JSON.parse(readFileSync(join(root, p), 'utf8')) as T;

const config = json<ScenarioConfig>(`scenarios/${ID}.json`);
const buf = readFileSync(join(root, config.dem.url.replace(/^\//, '')));
const dem = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const sc: LoadedScenario = {
  config, dem,
  exposure: json<ExposureData>(config.exposureUrl.replace(/^\//, '')),
  river: json<RiverPath>(config.riverUrl.replace(/^\//, '')),
  districts: json<DistrictData>(`data/${ID}/districts.json`),
};
const g = { bbox: config.bbox, grid: config.grid };

console.log(`Chamoli 2021 check (${ID}): grid ${config.grid.cols}x${config.grid.rows}, ${config.defaults.duration / 3600} h, breach B=${config.breach.finalWidth} m tf=${config.breach.formationTime} s`);
const init: EngineInit = {
  grid: config.grid, dem, manning: config.defaults.manning, dam: config.dam,
  breach: { mode: config.breach.mode, finalWidth: config.breach.finalWidth, finalBottomElevation: config.breach.finalBottomElevation, formationTime: config.breach.formationTime, sideSlope: config.breach.sideSlope, initialLevel: config.dam.initialLevel },
  duration: config.defaults.duration, frameInterval: config.defaults.frameInterval, bbox: config.bbox,
};
const t0 = performance.now();
const rt = new EngineRuntime(init);
while (!rt.runChunk(1e9, () => {})) { /* run to the end */ }
// the app's Envelopes also carry the valid-to time and the wet bounding box
const env: Envelopes = (() => {
  const e = rt.env, { cols, rows } = config.grid;
  let r0 = rows, c0 = cols, r1 = -1, c1 = -1;
  for (let k = 0; k < e.peakDepth.length; k++) {
    if (!(e.peakDepth[k] > 0.01)) continue;
    const r = Math.floor(k / cols), c = k - r * cols;
    if (r < r0) r0 = r; if (r > r1) r1 = r; if (c < c0) c0 = c; if (c > c1) c1 = c;
  }
  return { ...e, t: config.defaults.duration, box: r1 < 0 ? null : [r0, c0, r1, c1] };
})();
console.log(`  solver done in ${((performance.now() - t0) / 1000).toFixed(0)} s; peak breach Q ${rt.peakQ.toFixed(0)} m3/s\n`);

// ------------------------------------------------------------------ where the water went
const places = assessPlaces(sc.exposure.places, g, dem, env);
const byName = (re: RegExp) => places.find((p) => re.test(p.place.name));
const at = (lng: number, lat: number) => {
  const k = cellOf(g, lng, lat);
  return { d: env.peakDepth[k], h: aidrClass(env.peakDepth[k], env.peakSpeed[k], env.peakHazard[k]) };
};
type Row = [string, string, string, boolean];
const rows: Row[] = [];
const reniBridge = byName(/Reni Bridge/i)!;
const rb = at(reniBridge.place.lng, reniBridge.place.lat);
rows.push(['Reni (Raini) bridge, beside the Rishiganga project', 'destroyed', `peak ${rb.d.toFixed(1)} m, hazard H${rb.h}`, rb.h >= 5]);
// river channel at a site: deepest point of the traced river within 1 km of the marker (the Tapoban
// marker is ~620 m up the slope from the channel at the barrage)
const channelAt = (lng: number, lat: number) => {
  let best = { d: 0, h: 0, dist: Infinity };
  const { path, cell } = sc.river;
  const mx = 111320 * Math.cos((lat * Math.PI) / 180), my = 110540;
  for (let i = 0; i < path.length; i++) {
    const dist = Math.hypot((path[i][0] - lng) * mx, (path[i][1] - lat) * my);
    if (dist > 1000) continue;
    const k = cell[i];
    const d = env.peakDepth[k];
    if (d > best.d) best = { d, h: aidrClass(d, env.peakSpeed[k], env.peakHazard[k]), dist };
  }
  return best;
};
const tap = byName(/^Tapoban$/)!;
const tb = channelAt(tap.place.lng, tap.place.lat);
rows.push(['Dhauliganga at the Tapovan barrage (channel below Tapoban)', 'overwhelmed', tb.dist < Infinity ? `peak ${tb.d.toFixed(1)} m, hazard H${tb.h}` : 'river not traced here', tb.h >= 5]);
const jos = byName(/^Joshimath$/)!;
rows.push(['Joshimath town (hillside)', 'not flooded', jos.flooded ? `flooded, peak ${jos.peakDepth.toFixed(1)} m` : 'dry', !jos.flooded]);
console.log('Where the water went (model vs record)');
for (const [what, obs, mod, ok] of rows) console.log(`  [${ok ? 'agrees' : 'DIFFERS'}] ${what}: record ${obs}; model ${mod}`);

// ------------------------------------------------------------------ toll
const flooded = places.filter((p) => p.flooded && p.arrival >= 0 && (p.place.population ?? 0) > 0);
const par = flooded.reduce((a, p) => a + (p.place.population ?? 0), 0);
const typical = flooded.filter((p) => p.place.populationSource === 'typical').length;

const risk = new GeoRisk(sc);
const houses = generateSettlements(sc, { dist: risk.riverDist, hand: risk.hand });
for (let i = 0; i < houses.n; i++) houses.district[i] = risk.districtOfCell(houses.cell[i]);
// The app records house wetting/collapse from animation frames; headless there are none, so take
// them from the envelopes (peak depth/hazard at the house cell, timed at first arrival). Peaks can
// only over-state collapse slightly against frame sampling.
for (let i = 0; i < houses.n; i++) {
  const k = houses.cell[i];
  if (env.peakDepth[k] < FLOOD_DEPTH || env.arrival[k] < 0) continue;
  houses.wetAt[i] = env.arrival[k];
  if (aidrClass(env.peakDepth[k], env.peakSpeed[k], env.peakHazard[k]) >= 5) houses.collapseAt[i] = env.arrival[k];
}
const zi = buildZoneIndex(sc, risk, houses);
risk.compute('all', Infinity, env);

console.log(`\nPeople the model puts in the water: ${par.toLocaleString('en-IN')} in ${flooded.length} settlements (${typical} of them use a placeholder population)`);
console.log('Deaths among residents (Graham 1999), by warning assumption:');
for (const policy of ['none', 'at-breach'] as WarningPolicy[]) {
  const ll = lifeLoss(flooded.map((p) => ({ population: p.place.population ?? 0, arrival: p.arrival, peakDV: p.peakDV })), policy);
  const zt = aggregateZones(risk, zi, houses, { env, places, tEval: Infinity }, policy);
  console.log(`  warning "${policy}": ${fmtDeaths(ll)} (likely ~${Math.round(ll.mid)}); risk-map zones total ${fmtDeaths(zt.total.deaths)}`);
}
const zt = aggregateZones(risk, zi, houses, { env, places, tEval: Infinity }, 'none');
console.log(`Economic loss on the risk map (houses + roads/bridges): ${fmtCrRange(zt.total.lossCr)} (likely ~₹${Math.round(zt.total.lossCr.mid)} cr)`);
console.log(`Settlements in the water: ${flooded.map((p) => `${p.place.name} (${(p.place.population ?? 0).toLocaleString('en-IN')}${p.place.populationSource === 'typical' ? ', placeholder' : ''})`).join(', ')}`);

// ------------------------------------------------------------------ verdict, computed
const RES_OBS = 14, WORKERS_OBS = 190, LOSS_OBS_CR = 1500;
const llNone = lifeLoss(flooded.map((p) => ({ population: p.place.population ?? 0, arrival: p.arrival, peakDV: p.peakDV })), 'none');
const extentOk = rows.filter((r) => r[3]).length;
const resVerdict = RES_OBS < llNone.lo ? `OVER-estimates: even its low end (${Math.floor(llNone.lo)}) is above the ~${RES_OBS} residents lost`
  : RES_OBS > llNone.hi ? `UNDER-estimates: its high end (${Math.ceil(llNone.hi)}) is below the ~${RES_OBS} residents lost`
    : `brackets the ~${RES_OBS} residents lost (${fmtDeaths(llNone)})`;
console.log(`
Against the record
  Extent      ${extentOk} of ${rows.length} site checks agree.
  Residents   with no warning (as in 2021) the model ${resVerdict}.${typical ? `
              ${typical} of the ${flooded.length} flooded settlements use a placeholder population, which drives this.` : ''}
  Workers     ${WORKERS_OBS} of the 204 dead were hydropower workers; the exposure data has no worker
              headcount at either project, so the model counts none of them.
  Damage      the risk map's ~₹${Math.round(zt.total.lossCr.mid)} cr (houses, roads) against ≥ ₹${LOSS_OBS_CR.toLocaleString('en-IN')} cr at Tapovan alone:
              ${Math.round((zt.total.lossCr.mid / LOSS_OBS_CR) * 100)} % of one project's loss. Hydropower is not counted.
  Total toll  model ${fmtDeaths(llNone)} vs record 204, but for the wrong reason: residents over-counted,
              workers missing. Fix the exposure (real village populations, hydropower sites with
              worker counts and asset values) before quoting totals.
(Depth threshold for "flooded": ${FLOOD_DEPTH} m, as in the app.)`);
