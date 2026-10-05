// Run: npx tsx src/lib/__tests__/zoneLoss.test.ts
import assert from 'node:assert/strict';
import { bandOf, probToRisk, PROB_BANDS } from '../geoRisk';
import { bandLabel, fmtCrRange, fmtDeaths, resolveBasis } from '../zoneLoss';

// probability cut-offs land on the same bands the colours use
assert.equal(bandOf(probToRisk(0)), 1);
assert.equal(bandOf(probToRisk(0.09)), 1);
assert.equal(bandOf(probToRisk(PROB_BANDS.moderate)), 2);
assert.equal(bandOf(probToRisk(0.49)), 2);
assert.equal(bandOf(probToRisk(PROB_BANDS.high)), 3);
assert.equal(bandOf(probToRisk(0.89)), 3);
assert.equal(bandOf(probToRisk(PROB_BANDS.severe)), 4);
assert.equal(probToRisk(1), 1);
for (let p = 0; p < 1; p += 0.01) assert.ok(probToRisk(p + 0.01) >= probToRisk(p), `monotonic at ${p}`);

// basis: requested when available, else ensemble > run > terrain
assert.equal(resolveBasis('auto', false, false), 'terrain');
assert.equal(resolveBasis('auto', true, false), 'run');
assert.equal(resolveBasis('auto', true, true), 'ensemble');
assert.equal(resolveBasis('run', true, true), 'run');
assert.equal(resolveBasis('ensemble', true, false), 'run');
assert.equal(resolveBasis('terrain', true, true), 'terrain');

assert.equal(bandLabel(4, 'ensemble'), '≥90 %');
assert.equal(bandLabel(4, 'run', true), 'Severe risk zone');

assert.equal(fmtDeaths({ lo: 0, mid: 0, hi: 0.2 }), 'None expected');
assert.equal(fmtDeaths({ lo: 0, mid: 0.4, hi: 0.9 }), 'Under 1');
assert.equal(fmtDeaths({ lo: 98.4, mid: 494, hi: 1152.2 }), '98 – 1,153');
assert.equal(fmtCrRange({ lo: 0, mid: 0, hi: 0.001 }), 'Negligible');
assert.equal(fmtCrRange({ lo: 52.2, mid: 200, hi: 600 }), '₹52–600 cr');
assert.equal(fmtCrRange({ lo: 0.3, mid: 2, hi: 5.4 }), '₹30 lakh – ₹5.4 cr');

console.log('zoneLoss tests ok');
