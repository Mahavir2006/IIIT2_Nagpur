/* Precompute the Haridwar historical-archive model for the browser console:
 *   npm run cascade:prior  →  public/cascade/prior-haridwar.json
 * (Training it in the page would take ~15 s at startup.) */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fitCalibration, pretrain } from '../src/cascade/validate/pretrain';

const snap = pretrain('haridwar', 10, 77);
const r = (a: number[]) => a.map((x) => Number(x.toPrecision(6)));
const calibration = fitCalibration('haridwar', 4, 77, snap);
const out = { city: 'haridwar', events: 10, seed: 77, theta: snap.theta.map(r), P: snap.P.map(r), sigma2: r(snap.sigma2), n: snap.n, calibration };
const dir = join(__dirname, '..', 'public', 'cascade');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'prior-haridwar.json'), JSON.stringify(out));
console.log('wrote public/cascade/prior-haridwar.json');
