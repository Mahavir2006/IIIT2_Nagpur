/**
 * Verify the default camera against the reference screenshot.
 *
 * The range was solved by replicating `viewBBox()` offline. This checks the
 * committed constants against the same geometry independently, so a typo in
 * lon/lat or a wrong range is caught here rather than by eye in the browser.
 *
 * Reference screenshot (the view the user asked to keep):
 *     bbox 72.82, 18.96, 72.86, 18.98   (2 d.p.)
 *     heading 0 deg, pitch -55 deg
 *
 * Run: npx tsx scripts/default-camera-check.ts
 */

import { readFileSync } from "node:fs";

const problems: string[] = [];
function check(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(50)} ${detail}`);
  if (!ok) problems.push(label);
}

// Pull the committed constants straight out of the source, so this cannot drift
// from what the app actually uses.
const src = readFileSync("src/components/gis3d/globe/CesiumGlobe.ts", "utf8");
// Scope to the DEFAULT literal. A naive `\bpitchDeg:` search also matches
// flyHome's -90 nadir view, which is exactly the kind of silent mismatch this
// check exists to catch.
const block = src.match(/private static readonly DEFAULT = \{([\s\S]*?)\} as const;/)?.[1];
if (!block) throw new Error("could not locate the DEFAULT camera literal");

const grab = (key: string): number => {
  const m = block.match(new RegExp(`\\b${key}:\\s*(-?[\\d.]+)`));
  if (!m?.[1]) throw new Error(`could not read ${key} from the DEFAULT literal`);
  return Number(m[1]);
};

const lon = grab("lon");
const lat = grab("lat");
const rangeMeters = grab("rangeMeters");
const headingDeg = grab("headingDeg");
const pitchDeg = grab("pitchDeg");

check("longitude is 72.84216", lon === 72.84216, `${lon}`);
check("latitude is 18.96178", lat === 18.96178, `${lat}`);
check("heading is 0", headingDeg === 0, `${headingDeg} deg`);
check("pitch is -55", pitchDeg === -55, `${pitchDeg} deg`);
check("range is 523 m", rangeMeters === 523, `${rangeMeters} m`);

// --- replicate viewBBox() ---------------------------------------------------
const A_EQ = 6378137.0;
const FLAT = 1 / 298.257223563;
const FOV_DEG = 60; // Cesium PerspectiveFrustum default; the app never sets it

function mPerDeg(latDeg: number): number {
  const s = Math.sin((latDeg * Math.PI) / 180);
  return (Math.PI / 180) * (A_EQ / Math.sqrt(1 - FLAT * FLAT * s * s));
}

function bbox(altM: number, aspect: number): [number, number, number, number] {
  const mLat = mPerDeg(lat);
  const mLon = mPerDeg(lat) * Math.cos((lat * Math.PI) / 180);
  const p = (pitchDeg * Math.PI) / 180;
  const h = (headingDeg * Math.PI) / 180;
  const fwd: [number, number, number] = [
    Math.sin(h) * Math.cos(p),
    Math.cos(h) * Math.cos(p),
    Math.sin(p),
  ];
  const rl = Math.hypot(fwd[1], fwd[0]) || 1;
  const right: [number, number, number] = [fwd[1] / rl, -fwd[0] / rl, 0];
  const up: [number, number, number] = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];

  const dist = altM / Math.abs(Math.sin(p));
  const cam: [number, number, number] = [-fwd[0] * dist, -fwd[1] * dist, -fwd[2] * dist + altM];
  const halfV = (FOV_DEG * Math.PI) / 180 / 2;
  const halfH = Math.atan(Math.tan(halfV) * aspect);

  let w = Infinity;
  let e = -Infinity;
  let s = Infinity;
  let n = -Infinity;
  for (let i = 0; i < 5; i += 1) {
    for (let j = 0; j < 5; j += 1) {
      const sx = (2 * i) / 4 - 1;
      const sy = 1 - (2 * j) / 4;
      const th = sx * Math.tan(halfH);
      const tv = sy * Math.tan(halfV);
      const d: [number, number, number] = [
        fwd[0] + right[0] * th + up[0] * tv,
        fwd[1] + right[1] * th + up[1] * tv,
        fwd[2] + right[2] * th + up[2] * tv,
      ];
      if (d[2] >= -1e-9) continue;
      const t = -cam[2] / d[2];
      const lo = lon + (cam[0] + d[0] * t) / mLon;
      const la = lat + (cam[1] + d[1] * t) / mLat;
      w = Math.min(w, lo);
      e = Math.max(e, lo);
      s = Math.min(s, la);
      n = Math.max(n, la);
    }
  }
  return [w, s, e, n];
}

const altM = rangeMeters * Math.abs(Math.sin((pitchDeg * Math.PI) / 180));
console.log(`\n  range ${rangeMeters} m at pitch ${pitchDeg} deg -> altitude ${altM.toFixed(0)} m`);
console.log(`  status readout would print "${(altM / 1000).toFixed(0)} km"\n`);

/**
 * A fixed altitude at a fixed FOV shows more east-west ground on a wider canvas,
 * so an exact 2 d.p. bbox match is impossible at every aspect. 523 m is the
 * range that reproduces the reference across the whole realistic desktop range;
 * only unusually wide windows (>= 2.5) miss, and only on the east edge by one
 * printed unit. That boundary is asserted rather than hidden.
 */
const EXACT_ASPECTS = [1.8, 1.9, 2.0, 2.06, 2.15, 2.24, 2.35];
const WIDE_ASPECTS = [2.5, 2.7];

const WANT = ["72.82", "18.96", "72.86", "18.98"];
for (const aspect of EXACT_ASPECTS) {
  const [w, s, e, n] = bbox(altM, aspect);
  const got = [w, s, e, n].map((v) => v.toFixed(2));
  check(
    `bbox matches reference at aspect ${aspect}`,
    got.join() === WANT.join(),
    `${got.join(", ")}  (want ${WANT.join(", ")})`,
  );
}
for (const aspect of WIDE_ASPECTS) {
  const [w, s, e, n] = bbox(altM, aspect);
  const got = [w, s, e, n].map((v) => v.toFixed(2));
  // Documented, expected deviation: one 2 d.p. unit on the east edge only.
  // Tolerance is 1.1e-2 because 72.87 - 72.86 evaluates to 0.010000000000005
  // in binary floating point, which a bare `<= 0.01` would reject.
  check(
    `wide aspect ${aspect} deviates only on the east edge`,
    got[0] === WANT[0] &&
      got[1] === WANT[1] &&
      got[3] === WANT[3] &&
      Math.abs(Number(got[2]) - Number(WANT[2])) <= 1.1e-2,
    `${got.join(", ")}`,
  );
}

console.log("");
if (problems.length) {
  console.log(`${problems.length} check(s) FAILED: ${problems.join(", ")}`);
  process.exit(1);
}
console.log("all checks passed");
