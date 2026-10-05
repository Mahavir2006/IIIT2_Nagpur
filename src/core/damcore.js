/* DAM SYSTEM prototype core. Pure JS, no DOM, no THREE. */
(function (root) {
  'use strict';
  const G = 9.81;
  const NX = 480, NZ = 240, LX = 26000, LZ = 13000;
  const DX = LX / NX, A2 = DX * DX, N = NX * NZ;

  /* ---------- noise ---------- */
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const PERM = new Uint8Array(512);
  (function () { const r = mulberry32(20210207); const p = []; for (let i = 0; i < 256; i++) p.push(i); for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; } for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]; })();
  function hsh(x, y) { return PERM[(PERM[x & 255] + (y & 255)) & 255] / 255; }
  function vnoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = hsh(ix, iy), b = hsh(ix + 1, iy), c = hsh(ix, iy + 1), d = hsh(ix + 1, iy + 1);
    return ((a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy) * 2 - 1;
  }
  function fbm(x, y, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1); n += a; a *= 0.5; f *= 2.03; } return s / n; }
  function ridged(x, y, o) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { let v = 1 - Math.abs(vnoise(x * f + 31.7 * i, y * f + 7.7 * i)); v *= v; s += a * v; n += a; a *= 0.5; f *= 2.1; } return s / n; }

  /* ---------- river geometry ---------- */
  function catmull(P, seg) {
    const out = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(i - 1, 0)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(i + 2, P.length - 1)];
      for (let k = 0; k < seg; k++) {
        const t = k / seg, t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    out.push(P[P.length - 1].slice());
    return out;
  }
  function makeLine(pts) {
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, s, L: s[s.length - 1] };
  }
  function lineAt(line, s) {
    const S = line.s, P = line.pts; if (s <= 0) return [P[0][0], P[0][1]]; if (s >= line.L) { const q = P[P.length - 1]; return [q[0], q[1]]; }
    let lo = 0, hi = S.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= s) lo = m; else hi = m; }
    const t = (s - S[lo]) / (S[hi] - S[lo] || 1); return [P[lo][0] + (P[hi][0] - P[lo][0]) * t, P[lo][1] + (P[hi][1] - P[lo][1]) * t];
  }
  function lineTan(line, s) { const a = lineAt(line, s - 60), b = lineAt(line, s + 60); const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; }
  function nearest(line, x, z) {
    const P = line.pts, S = line.s; let best = 1e18, bs = 0;
    for (let i = 0; i < P.length - 1; i++) {
      const ax = P[i][0], az = P[i][1], bx = P[i + 1][0], bz = P[i + 1][1];
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
      let t = ((x - ax) * vx + (z - az) * vz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = ax + vx * t - x, pz = az + vz * t - z, d2 = px * px + pz * pz;
      if (d2 < best) { best = d2; bs = S[i] + t * (S[i + 1] - S[i]); }
    }
    return [Math.sqrt(best), bs];
  }

  const MAIN = makeLine(catmull([[-0.04, 0.50], [0.05, 0.47], [0.13, 0.58], [0.21, 0.50], [0.29, 0.55], [0.37, 0.43], [0.46, 0.52], [0.55, 0.40], [0.63, 0.47], [0.71, 0.59], [0.80, 0.50], [0.89, 0.61], [0.97, 0.53], [1.05, 0.56]].map(p => [p[0] * LX, p[1] * LZ]), 24));
  // chainage where river enters domain
  let S_IN = 0; for (let i = 0; i < MAIN.pts.length; i++) if (MAIN.pts[i][0] >= 0) { S_IN = MAIN.s[i]; break; }
  let S_OUT = MAIN.L; for (let i = 0; i < MAIN.pts.length; i++) if (MAIN.pts[i][0] >= LX) { S_OUT = MAIN.s[i]; break; }
  const LIN = S_OUT - S_IN;
  const SITE = {
    dam: S_IN + 0.070 * LIN,
    raini: S_IN + 0.265 * LIN,
    tapovan: S_IN + 0.610 * LIN,
    joshimath: S_IN + 0.955 * LIN,
  };
  SITE.hand = SITE.dam + 1300;
  const pR = lineAt(MAIN, SITE.raini);
  const TRIB = makeLine(catmull([[pR[0] + 0.07 * LX, -0.06 * LZ], [pR[0] + 0.09 * LX, 0.10 * LZ], [pR[0] + 0.03 * LX, 0.22 * LZ], [pR[0] + 0.035 * LX, 0.33 * LZ], [pR[0], pR[1]]], 20));

  function interp(knots, s, k) { if (s <= knots[0][0]) return knots[0][k]; for (let i = 1; i < knots.length; i++) if (s <= knots[i][0]) { const a = knots[i - 1], b = knots[i]; const t = (s - a[0]) / (b[0] - a[0]); return a[k] + (b[k] - a[k]) * t; } return knots[knots.length - 1][k]; }
  const BEDK = [[0, 2560 + 0.035 * SITE.dam], [SITE.dam, 2560], [SITE.raini, 2010], [SITE.tapovan, 1800], [SITE.joshimath, 1380], [MAIN.L, 1380 - 0.03 * (MAIN.L - SITE.joshimath)]];
  function bedMain(s) { return interp(BEDK, s, 1); }
  const VK = [[0, 170, 700, 2400], [SITE.dam - 250, 170, 700, 2400], [SITE.dam + 250, 80, 620, 2600], [SITE.raini - 600, 80, 650, 2600], [SITE.raini + 700, 150, 900, 2300], [SITE.tapovan - 1600, 150, 1000, 2200], [SITE.tapovan, 280, 1250, 2000], [SITE.tapovan + 1800, 190, 1100, 2100], [SITE.joshimath - 1500, 170, 1000, 2300], [SITE.joshimath, 230, 1050, 2200], [MAIN.L, 200, 1000, 2300]];
  function wall(d, wf, Lw, Rm) {
    if (d <= wf) return 12 * Math.pow(d / wf, 1.6);
    return 12 + Rm * (1 - Math.exp(-Math.pow((d - wf) / Lw, 1.15)));
  }
  function bedTrib(s2) { return bedMain(SITE.raini) + 0.022 * (TRIB.L - s2); }
  function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }

  /* ---------- per cell fields ---------- */
  const b0 = new Float64Array(N), bDam = new Float64Array(N), b = new Float64Array(N);
  const sC = new Float32Array(N), dC = new Float32Array(N), dT = new Float32Array(N);
  const act = new Uint8Array(N); let actList = null;
  const lakeCell = new Uint8Array(N);

  function cellX(i) { return (i % NX + 0.5) * DX; }
  function cellZ(i) { return (Math.floor(i / NX) + 0.5) * DX; }
  function cellAt(x, z) { let ix = Math.floor(x / DX), iz = Math.floor(z / DX); if (ix < 0) ix = 0; if (ix >= NX) ix = NX - 1; if (iz < 0) iz = 0; if (iz >= NZ) iz = NZ - 1; return iz * NX + ix; }
  function sampleArr(arr, x, z) {
    let fx = x / DX - 0.5, fz = z / DX - 0.5; if (fx < 0) fx = 0; if (fz < 0) fz = 0; if (fx > NX - 1.001) fx = NX - 1.001; if (fz > NZ - 1.001) fz = NZ - 1.001;
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * NX + ix;
    return (arr[i] * (1 - tx) + arr[i + 1] * tx) * (1 - tz) + (arr[i + NX] * (1 - tx) + arr[i + NX + 1] * tx) * tz;
  }

  function buildTerrain() {
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i, x = (i + 0.5) * DX, z = (j + 0.5) * DX;
      const [d1, s1] = nearest(MAIN, x, z);
      const [d2, s2] = nearest(TRIB, x, z);
      sC[k] = s1; dC[k] = d1; dT[k] = d2;
      const wf = interp(VK, s1, 1), Lw = interp(VK, s1, 2), Rm = interp(VK, s1, 3);
      const n1 = fbm(x / 1800, z / 1800, 5);
      const dn1 = d1 + n1 * 60 * Math.min(1, d1 / 400);
      let e1 = bedMain(s1) + wall(Math.max(0, dn1), wf, Lw, Rm);
      let e2 = bedTrib(s2) + wall(Math.max(0, d2 + n1 * 50 * Math.min(1, d2 / 400)), 110, 850, 2300);
      const bedLoc = e1 <= e2 ? bedMain(s1) : bedTrib(s2);
      let e = Math.max(smin(e1, e2, 220), Math.min(e1, e2, bedLoc + 10 * Math.min(1, Math.min(d1, d2) / 150)));
      const dd = Math.min(d1, d2);
      const rise = Math.max(0, e - bedLoc);
      const amp = 0.6 + 0.22 * Math.min(rise, 2600);
      e += amp * fbm(x / 1400 + 5, z / 1400 - 3, 6);
      e += 900 * ridged(x / 7000, z / 7000, 5) * Math.min(1, Math.max(0, (dd - 900) / 2600));
      { const t = Math.min(1, Math.max(0, (z - 0.74 * LZ) / (0.26 * LZ))); const f = t * t * (3 - 2 * t) * 0.62; e -= f * Math.max(0, e - bedLoc - 60); }
      e += 1.5 * fbm(x / 120, z / 120, 2) * Math.min(1, dd / 300) * Math.min(1, rise / 40);
      b0[k] = e;
    }
  }

  /* ---------- dam & lake ---------- */
  let DAM = { Hd: 60, zc: 0, zbase: 0 };
  const LAKE = { z: null, V: null, n: 0 };
  function buildDam(Hd) {
    bDam.set(b0);
    const zc = bedMain(SITE.dam) + Hd; DAM = { Hd, zc, zbase: bedMain(SITE.dam) + 1.5 };
    if (!NEARDAM) { const l = []; for (let k = 0; k < N; k++) if (Math.abs(sC[k] - SITE.dam) < 520 && dC[k] < 1100) l.push(k); NEARDAM = Int32Array.from(l); }
    for (let m = 0; m < NEARDAM.length; m++) {
      const k = NEARDAM[m]; const ds = Math.abs(sC[k] - SITE.dam);
      if (ds < 520 && dC[k] < 1100) {
        const face = zc - Math.max(0, ds - 45) * 0.36 + 4 * vnoise(cellX(k) / 90, cellZ(k) / 90);
        if (bDam[k] < face) bDam[k] = face;
      }
    }
    // lake storage table (lake cells are fixed; computed once)
    if (!LAKECELLS) { const l = []; for (let k = 0; k < N; k++) if (sC[k] < SITE.dam - 20 && dC[k] < 2200 && dT[k] > 1500) { lakeCell[k] = 1; l.push(k); } LAKECELLS = Int32Array.from(l); }
    const z0 = bedMain(SITE.dam) - 5, z1 = zc + 3, n = Math.ceil((z1 - z0) / 0.25) + 1;
    LAKE.z = new Float64Array(n); LAKE.V = new Float64Array(n); LAKE.A = new Float64Array(n); LAKE.n = n;
    for (let q = 0; q < n; q++) {
      const zz = z0 + q * 0.25; let v = 0, a = 0;
      for (let m = 0; m < LAKECELLS.length; m++) { const k = LAKECELLS[m]; if (bDam[k] < zz) { v += (zz - bDam[k]) * A2; a += A2; } }
      LAKE.z[q] = zz; LAKE.V[q] = v; LAKE.A[q] = a;
    }
  }
  let LAKECELLS = null, NEARDAM = null;
  function lakeV(z) { const L = LAKE; if (z <= L.z[0]) return 0; const q = (z - L.z[0]) / 0.25, i = Math.min(L.n - 2, Math.floor(q)), t = q - i; return L.V[i] + (L.V[i + 1] - L.V[i]) * t; }
  function lakeZ(V) { const L = LAKE; if (V <= 0) return L.z[0]; let lo = 0, hi = L.n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L.V[m] <= V) lo = m; else hi = m; } const dv = L.V[hi] - L.V[lo]; return L.z[lo] + (dv > 0 ? (V - L.V[lo]) / dv : 0) * 0.25; }
  function lakeArea(z) { const L = LAKE; const q = Math.max(0, Math.min(L.n - 1, Math.round((z - L.z[0]) / 0.25))); return L.A[q]; }

  function breachQ(zL, zb, B) { const H = zL - zb; if (H <= 0) return 0; return 1.7 * B * Math.pow(H, 1.5) + 1.35 * Math.pow(H, 2.5); }
  function breachGeom(p, tb) { const pr = Math.min(1, Math.max(0, tb / p.tf)); const e = pr * pr * (3 - 2 * pr) * 0.35 + pr * 0.65; return { zb: DAM.zc - (DAM.zc - DAM.zbase) * e, B: 4 + (p.Bf - 4) * e, pr }; }

  /* hydrograph standalone (for surrogate & ensemble). Needs buildDam(p.Hd) called; uses tables. */
  function hydrograph(p, dt, tmax) {
    dt = dt || 2; tmax = tmax || 7200;
    if (p.mode === 'hindcast') {
      const Q = []; for (let t = 0; t <= tmax; t += dt) Q.push(hindcastQ(t)); return { dt, Q, V0: p.V0 || 9.5e6 };
    }
    const zc = bedMain(SITE.dam) + p.Hd, zbase = bedMain(SITE.dam) + 1.5;
    let zL = zc - p.free; let V = lakeV(zL); const V0 = V; const Q = [];
    for (let t = 0; t <= tmax; t += dt) {
      const pr = Math.min(1, t / p.tf); const e = pr * pr * (3 - 2 * pr) * 0.35 + pr * 0.65;
      const zb = zc - (zc - zbase) * e, B = 4 + (p.Bf - 4) * e;
      let q = breachQ(zL, zb, B); if (q * dt > V) q = V / dt; V -= q * dt; zL = lakeZ(V); Q.push(q);
    }
    return { dt, Q, V0 };
  }
  // 7 Feb 2021 replay: water-equivalent surge entering the modelled reach. Shape is illustrative,
  // peak taken from the upper end of the Shugar et al. (2021) estimate at Raini (8,200 to 14,200 m3/s).
  function hindcastQ(t) { const tp = 90, Qp = 14200, td = 1500; if (t < 0) return 0; if (t < tp) return Qp * t / tp; if (t < td) return Qp * Math.exp(-3.2 * (t - tp) / (td - tp)); return 0; }

  /* ---------- SCENARIOS ---------- */
  const SCEN = {
    small: { id: 'small', name: 'Small breach', Hd: 30, Bf: 40, tf: 3600, free: 2, n: 0.045 },
    medium: { id: 'medium', name: 'Medium breach', Hd: 45, Bf: 80, tf: 1800, free: 2, n: 0.045 },
    large: { id: 'large', name: 'Large breach', Hd: 60, Bf: 110, tf: 1200, free: 1, n: 0.045 },
    extreme: { id: 'extreme', name: 'Extreme bound', Hd: 75, Bf: 160, tf: 480, free: 0, n: 0.045 },
    hindcast: { id: 'hindcast', name: '7 Feb 2021 replay', mode: 'hindcast', Hd: 20, Bf: 60, tf: 60, free: 2, n: 0.045 },
  };

  /* ---------- 2D shallow water (virtual pipe finite volume) ---------- */
  const d = new Float64Array(N);
  const u = new Float32Array(N), w = new Float32Array(N), maxd = new Float32Array(N), maxv = new Float32Array(N), arr = new Float32Array(N), hzd = new Float32Array(N);
  let riverCell = null; let actS = null; // cell index per 50 m chainage bin
  const RBIN = 50;

  function buildMask() {
    act.fill(0); const list = [];
    for (let k = 0; k < N; k++) {
      const i = k % NX, j = (k / NX) | 0; if (j < 1 || j >= NZ - 1 || i < 1) continue;
      const okMain = dC[k] < 1500 && b0[k] < bedMain(sC[k]) + 230 && sC[k] > SITE.hand - 60;
      const okTrib = dT[k] < 1300 && b0[k] < bedTrib(nearest(TRIB, cellX(k), cellZ(k))[1]) + 200 && dT[k] < dC[k] + 600;
      if (okMain || (okTrib && sC[k] > SITE.raini - 1500)) { act[k] = 1; list.push(k); }
    }
    list.sort((a, c) => sC[a] - sC[c]); actList = Int32Array.from(list); actS = Float32Array.from(list.map(k => sC[k]));
    const nb = Math.ceil(MAIN.L / RBIN) + 1; riverCell = new Int32Array(nb);
    for (let q = 0; q < nb; q++) { const p = lineAt(MAIN, q * RBIN); riverCell[q] = cellAt(p[0], p[1]); }
  }
  function riverCellAt(s) { const q = Math.max(0, Math.min(riverCell.length - 1, Math.round(s / RBIN))); return riverCell[q]; }

  /* ---------- particles (SPH near field) ---------- */
  const NP = 4000;
  const px = new Float32Array(NP), py = new Float32Array(NP), pz = new Float32Array(NP), pvx = new Float32Array(NP), pvy = new Float32Array(NP), pvz = new Float32Array(NP), pvol = new Float64Array(NP), page = new Float32Array(NP), prho = new Float32Array(NP), pax = new Float32Array(NP), pay = new Float32Array(NP), paz = new Float32Array(NP);
  const SPH = { h: 42, stiff: 90, xsph: 0.12, n: 0.045, heff: 5 };
  const HS = 16384, hCount = new Int32Array(HS + 1), hIdx = new Int32Array(NP), pCell = new Int32Array(NP);
  let RHO0 = 1;
  (function () { const h = SPH.h, a = h * 0.5; let r0 = 0; for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) for (let z = -3; z <= 3; z++) { const r2 = (x * x + y * y + z * z) * a * a; if (r2 < h * h) { const q = 1 - r2 / (h * h); r0 += q * q * q; } } RHO0 = r0; })();
  function hkey(ix, iy, iz) { return ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & (HS - 1); }

  const ST = {};
  let P = SCEN.large;
  let rngP = mulberry32(99);

  function reset(p) {
    P = Object.assign({}, p || P);
    if (P.mode === 'hindcast') buildDam(12); else buildDam(P.Hd);
    b.set(bDam);
    d.fill(0); hu.fill(0); hv.fill(0); fxm.fill(0); fxuL.fill(0); fxuR.fill(0); fxv.fill(0); fzm.fill(0); fzvL.fill(0); fzvR.fill(0); fzu.fill(0); u.fill(0); w.fill(0); maxd.fill(0); maxv.fill(0); arr.fill(-1); hzd.fill(0);
    rngP = mulberry32(99);
    Object.assign(ST, { t: 0, n: 0, Q: 0, Qpeak: 0, tQpeak: 0, zL: 0, V: 0, V0: 0, released: 0, grid: 0, out: 0, inflight: 0, pending: 0, err: 0, clampLoss: 0, frontS: SITE.hand, frontT: 0, frontV: 0, breach: { zb: DAM.zc, B: 4, pr: 0 }, dt: 0.5, steps: 0, done: false, hmax: 0, vmax: 0, gauges: GAUGES.map(() => []), gt: [] });
    if (P.mode === 'hindcast') { ST.zL = DAM.zbase; ST.V = 0; ST.V0 = 9.5e6; }
    else { ST.zL = DAM.zc - P.free; ST.V = lakeV(ST.zL); ST.V0 = ST.V; }
    ST.assetState = ASSETS.map(() => ({ tFlood: -1, tFront: -1, maxDepth: 0 }));
    ST.roadState = ROADS.map(() => ({ tClose: -1 }));
  }

  function emitParticles(Qdt, dt) {
    let vol = Qdt + ST.pending; ST.pending = 0; if (vol <= 0) return;
    ST.credit = (ST.credit || 0) + dt * Math.min(16, 3 + vol / dt / 1000); let nE = Math.floor(ST.credit); if (nE < 1) { ST.pending = vol; return; } ST.credit -= nE;
    const free = NP - ST.n; if (free <= 0) { ST.pending = vol; return; }
    nE = Math.min(nE, free);
    const vp = vol / nE; const s0 = SITE.dam + 70; const c = lineAt(MAIN, s0), tg = lineTan(MAIN, s0);
    const nrm = [-tg[1], tg[0]];
    const Bw = ST.breach.B, H = Math.max(1, (P.mode === 'hindcast' ? 12 : ST.zL - ST.breach.zb));
    const sp = Math.min(34, Math.sqrt(2 * G * H) * 0.75);
    for (let q = 0; q < nE; q++) {
      const i = ST.n++;
      const off = (rngP() - 0.5) * Bw * 0.9;
      const x = c[0] + nrm[0] * off + tg[0] * rngP() * 20, z = c[1] + nrm[1] * off + tg[1] * rngP() * 20;
      px[i] = x; pz[i] = z; py[i] = sampleArr(b, x, z) + 2 + rngP() * Math.min(H, 14);
      pvx[i] = tg[0] * sp + (rngP() - 0.5) * 3; pvz[i] = tg[1] * sp + (rngP() - 0.5) * 3; pvy[i] = (rngP() - 0.2) * 2;
      pvol[i] = vp; page[i] = 0;
    }
  }
  function killParticle(i) { const l = --ST.n; if (i !== l) { px[i] = px[l]; py[i] = py[l]; pz[i] = pz[l]; pvx[i] = pvx[l]; pvy[i] = pvy[l]; pvz[i] = pvz[l]; pvol[i] = pvol[l]; page[i] = page[l]; } }
  function inject(k, vol, vx, vz) { if (!act[k]) { k = riverCellAt(Math.max(sC[k], SITE.hand + 30)); } const dh = vol / A2; hu[k] += dh * (vx || 0) * 0.8; hv[k] += dh * (vz || 0) * 0.8; d[k] += dh; }

  function sphStep(dt) {
    const n = ST.n; if (!n) return;
    const h = SPH.h, h2 = h * h, inv = 1 / h;
    hCount.fill(0);
    for (let i = 0; i < n; i++) { const key = hkey(Math.floor(px[i] * inv), Math.floor(py[i] * inv), Math.floor(pz[i] * inv)); pCell[i] = key; hCount[key + 1]++; }
    for (let q = 1; q <= HS; q++) hCount[q] += hCount[q - 1];
    const fill = hCount.slice(0, HS);
    for (let i = 0; i < n; i++) hIdx[fill[pCell[i]]++] = i;
    // density
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(px[i] * inv), cy = Math.floor(py[i] * inv), cz = Math.floor(pz[i] * inv); let r = 0;
      for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let c = -1; c <= 1; c++) {
        const key = hkey(cx + a, cy + bb, cz + c); for (let m = hCount[key]; m < hCount[key + 1]; m++) {
          const j = hIdx[m]; const dx = px[i] - px[j], dy = py[i] - py[j], dz = pz[i] - pz[j], r2 = dx * dx + dy * dy + dz * dz;
          if (r2 < h2) { const q = 1 - r2 / h2; r += q * q * q; }
        }
      }
      prho[i] = r;
    }
    // forces: pressure (spiky shaped) + XSPH
    for (let i = 0; i < n; i++) {
      const cx = Math.floor(px[i] * inv), cy = Math.floor(py[i] * inv), cz = Math.floor(pz[i] * inv);
      const Pi = Math.max(0, prho[i] / RHO0 - 1); let ax = 0, ay = 0, az = 0, sx = 0, sy = 0, sz = 0, sw = 0;
      for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) for (let c = -1; c <= 1; c++) {
        const key = hkey(cx + a, cy + bb, cz + c); for (let m = hCount[key]; m < hCount[key + 1]; m++) {
          const j = hIdx[m]; if (j === i) continue; const dx = px[i] - px[j], dy = py[i] - py[j], dz = pz[i] - pz[j], r2 = dx * dx + dy * dy + dz * dz;
          if (r2 < h2 && r2 > 1e-6) {
            const r = Math.sqrt(r2), q = 1 - r / h, Pj = Math.max(0, prho[j] / RHO0 - 1);
            const f = SPH.stiff * (Pi + Pj) * 0.5 * q * q / r; ax += f * dx; ay += f * dy; az += f * dz;
            const wq = 1 - r2 / h2, ww = wq * wq * wq; sx += (pvx[j] - pvx[i]) * ww; sy += (pvy[j] - pvy[i]) * ww; sz += (pvz[j] - pvz[i]) * ww; sw += ww;
          }
        }
      }
      if (sw > 0) { const e = SPH.xsph / Math.max(1, sw * 0.2); sx *= e; sy *= e; sz *= e; }
      pax[i] = ax + sx / dt; pay[i] = ay + sy / dt - G; paz[i] = az + sz / dt;
    }
    // integrate + terrain boundary + Manning style bed friction
    const cf = G * SPH.n * SPH.n / Math.pow(SPH.heff, 4 / 3);
    for (let i = 0; i < n; i++) {
      let vx = pvx[i] + pax[i] * dt, vy = pvy[i] + pay[i] * dt, vz = pvz[i] + paz[i] * dt;
      const sp = Math.hypot(vx, vy, vz); const fr_ = 1 / (1 + dt * cf * sp); vx *= fr_; vz *= fr_; vy *= fr_;
      if (sp > 60) { const k = 60 / sp; vx *= k; vy *= k; vz *= k; }
      let x = px[i] + vx * dt, y = py[i] + vy * dt, z = pz[i] + vz * dt;
      x = Math.min(LX - 1, Math.max(1, x)); z = Math.min(LZ - 1, Math.max(1, z));
      const e = sampleArr(b, x, z);
      if (y < e + 1.5) {
        const gx = (sampleArr(b, x + 20, z) - sampleArr(b, x - 20, z)) / 40, gz = (sampleArr(b, x, z + 20) - sampleArr(b, x, z - 20)) / 40;
        const nl = Math.hypot(gx, 1, gz), nx_ = -gx / nl, ny_ = 1 / nl, nz_ = -gz / nl; const vn = vx * nx_ + vy * ny_ + vz * nz_;
        if (vn < 0) { vx -= vn * nx_; vy -= vn * ny_; vz -= vn * nz_; }
        y = e + 1.5;
      }
      if (y > e + 70) { vy = Math.min(vy, 0); }
      const kc = cellAt(x, z);
      if (sC[kc] < SITE.dam + 40 || dC[kc] > 900) { // keep near field particles in the downstream channel
        const sn = Math.max(sC[kc], SITE.dam + 45); const c2 = lineAt(MAIN, sn), t2 = lineTan(MAIN, sn);
        const off = Math.max(-60, Math.min(60, (x - c2[0]) * -t2[1] + (z - c2[1]) * t2[0]));
        x = c2[0] - t2[1] * off; z = c2[1] + t2[0] * off; y = Math.max(y, sampleArr(b, x, z) + 1.5);
        const vt = vx * t2[0] + vz * t2[1]; const vv = Math.max(vt, 6); vx = t2[0] * vv; vz = t2[1] * vv;
      }
      px[i] = x; py[i] = y; pz[i] = z; pvx[i] = vx; pvy[i] = vy; pvz[i] = vz; page[i] += dt;
    }
    // handoff: conservative transfer of particle volume into the 2D grid
    for (let i = ST.n - 1; i >= 0; i--) {
      const k = cellAt(px[i], pz[i]);
      if (sC[k] >= SITE.hand || page[i] > 160 || (act[k] && sC[k] > SITE.hand - 60)) { inject(k, pvol[i], pvx[i], pvz[i]); killParticle(i); }
    }
  }

  /* 2D shallow water equations, finite volume, HLL Riemann solver with hydrostatic reconstruction
     (Audusse et al. 2004): well balanced, positivity preserving, exactly mass conservative, handles
     supercritical flow on steep beds. Semi implicit Manning friction. */
  const hu = new Float64Array(N), hv = new Float64Array(N);
  const fxm = new Float64Array(N), fxuL = new Float64Array(N), fxuR = new Float64Array(N), fxv = new Float64Array(N);
  const fzm = new Float64Array(N), fzvL = new Float64Array(N), fzvR = new Float64Array(N), fzu = new Float64Array(N);
  const HEPS = 1e-3; const FL = new Float64Array(4);
  // normal velocity un, tangential ut. Writes [mass, momN_left, momN_right, momT] into FL.
  function hll(hL, unL, utL, zL, hR, unR, utR, zR) {
    const zf = zL > zR ? zL : zR;
    const hl = Math.max(0, hL + zL - zf), hr = Math.max(0, hR + zR - zf);
    if (hl < HEPS && hr < HEPS) { FL[0] = 0; FL[3] = 0; FL[1] = 0.5 * G * (hL * hL - hl * hl); FL[2] = 0.5 * G * (hR * hR - hr * hr); return; }
    const cl = Math.sqrt(G * hl), cr = Math.sqrt(G * hr);
    const sl = Math.min(unL - cl, unR - cr), sr = Math.max(unL + cl, unR + cr);
    const f0l = hl * unL, f1l = hl * unL * unL + 0.5 * G * hl * hl, f2l = hl * unL * utL;
    const f0r = hr * unR, f1r = hr * unR * unR + 0.5 * G * hr * hr, f2r = hr * unR * utR;
    let f0, f1, f2;
    if (sl >= 0) { f0 = f0l; f1 = f1l; f2 = f2l; }
    else if (sr <= 0) { f0 = f0r; f1 = f1r; f2 = f2r; }
    else { const k = 1 / (sr - sl); f0 = (sr * f0l - sl * f0r + sl * sr * (hr - hl)) * k; f1 = (sr * f1l - sl * f1r + sl * sr * (hr * unR - hl * unL)) * k; f2 = (sr * f2l - sl * f2r + sl * sr * (hr * utR - hl * utL)) * k; }
    FL[0] = f0; FL[3] = f2; FL[1] = f1 + 0.5 * G * (hL * hL - hl * hl); FL[2] = f1 + 0.5 * G * (hR * hR - hr * hr);
  }
  function sweStep(dt) {
    const L = actList, n2 = P.n * P.n, k = dt / DX;
    const lim = ST.frontS + 1800; let lo = 0, hi = actS.length; while (lo < hi) { const m = (lo + hi) >> 1; if (actS[m] < lim) lo = m + 1; else hi = m; } const nL = lo; ST.nProc = nL;
    for (let q = 0; q < nL; q++) {
      const i = L[q], x = i % NX, h = d[i], ui = u[i], wi = w[i], zi = b[i];
      // x face i|i+1
      if (x === NX - 1) { hll(h, ui, wi, zi, h, Math.max(ui, 0), wi, zi - 0.03 * DX); }
      else { const j = i + 1; if (act[j]) hll(h, ui, wi, zi, d[j], u[j], w[j], b[j]); else hll(h, ui, wi, zi, h, -ui, wi, zi); }
      fxm[i] = FL[0]; fxuL[i] = FL[1]; fxuR[i] = FL[2]; fxv[i] = FL[3];
      // z face i|i+NX
      const j2 = i + NX; if (act[j2]) hll(h, wi, ui, zi, d[j2], w[j2], u[j2], b[j2]); else hll(h, wi, ui, zi, h, -wi, ui, zi);
      fzm[i] = FL[0]; fzvL[i] = FL[1]; fzvR[i] = FL[2]; fzu[i] = FL[3];
    }
    let hmax = 0, vmax = 0, front = ST.frontS; const t = ST.t + dt;
    for (let q = 0; q < nL; q++) {
      const i = L[q], x = i % NX, il = i - 1, it = i - NX;
      const h0 = d[i];
      // left and top faces: if neighbour inactive, reflective wall
      let mL, uL_, vL_, mT, vT_, uT_;
      if (act[il]) { mL = fxm[il]; uL_ = fxuR[il]; vL_ = fxv[il]; } else { hll(h0, -u[i], w[i], b[i], h0, u[i], w[i], b[i]); mL = FL[0]; uL_ = FL[2]; vL_ = FL[3]; }
      if (act[it]) { mT = fzm[it]; vT_ = fzvR[it]; uT_ = fzu[it]; } else { hll(h0, -w[i], u[i], b[i], h0, w[i], u[i], b[i]); mT = FL[0]; vT_ = FL[2]; uT_ = FL[3]; }
      let hn = h0 - k * (fxm[i] - mL + fzm[i] - mT);
      let qu = hu[i] - k * (fxuL[i] - uL_ + fzu[i] - uT_);
      let qv = hv[i] - k * (fxv[i] - vL_ + fzvL[i] - vT_);
      if (x === NX - 1) ST.out += fxm[i] * DX * dt;
      if (hn < 0) { ST.clampLoss += -hn * A2; hn = 0; }
      if (hn < HEPS) { qu = 0; qv = 0; }
      else { const sp = Math.hypot(qu, qv) / hn; const fr_ = 1 / (1 + dt * G * n2 * sp / Math.pow(hn, 4 / 3)); qu *= fr_; qv *= fr_; }
      d[i] = hn; hu[i] = qu; hv[i] = qv;
    }
    for (let q = 0; q < nL; q++) {
      const i = L[q], hn = d[i];
      if (hn > 0.05) { let uu = hu[i] / hn, ww = hv[i] / hn; const s_ = Math.hypot(uu, ww); if (s_ > 40) { uu *= 40 / s_; ww *= 40 / s_; hu[i] = uu * hn; hv[i] = ww * hn; } u[i] = uu; w[i] = ww; }
      else { u[i] = 0; w[i] = 0; hu[i] = 0; hv[i] = 0; }
      if (hn > maxd[i]) maxd[i] = hn;
      const sp = Math.hypot(u[i], w[i]); if (hn > 1 && sp > maxv[i]) maxv[i] = sp;
      const hvv = hn * sp; if (hvv > hzd[i]) hzd[i] = hvv;
      if (hn > 0.5 && arr[i] < 0) { arr[i] = t; if (sC[i] > front && dC[i] < 400) front = sC[i]; }
      if (hn > hmax) hmax = hn; if (hn > 0.3 && sp > vmax) vmax = sp;
    }
    if (front > ST.frontS + 1) { const dtf = t - ST.frontT; if (ST.frontT > 0 && dtf > 0) ST.frontV = 0.8 * ST.frontV + 0.2 * ((front - ST.frontS) / dtf); ST.frontS = front; ST.frontT = t; }
    ST.hmax = hmax; ST.vmax = vmax;
  }

  function lakeStep(dt) {
    if (P.mode === 'hindcast') { const q = hindcastQ(ST.t); ST.Q = q; return q * dt; }
    ST.breach = breachGeom(P, ST.t);
    // carve breach notch into the dam
    const zb = ST.breach.zb, B = ST.breach.B;
    for (let q = 0; q < DAMCELLS.length; q++) {
      const k = DAMCELLS[q]; const lim = zb + Math.max(0, dC[k] - B * 0.5) * 1.1; const nv = Math.max(b0[k], Math.min(bDam[k], lim)); if (nv < b[k]) b[k] = nv;
    }
    let Q = breachQ(ST.zL, zb, B); if (Q * dt > ST.V) Q = ST.V / dt;
    ST.V -= Q * dt; ST.zL = lakeZ(ST.V); ST.Q = Q; return Q * dt;
  }
  let DAMCELLS = [];
  function refreshDamCells() { const l = []; for (let k = 0; k < N; k++) if (bDam[k] > b0[k] + 0.01 && sC[k] > SITE.dam - 520) l.push(k); DAMCELLS = Int32Array.from(l); }

  function sumGrid() { let s = 0; for (let q = 0; q < actList.length; q++) s += d[actList[q]]; return s * A2; }
  function sumParticles() { let s = 0; for (let i = 0; i < ST.n; i++) s += pvol[i]; return s; }

  function step(nSteps) {
    for (let s = 0; s < nSteps; s++) {
      if (ST.done) return;
      const cfl = 0.45 * DX / (Math.sqrt(G * Math.max(0.5, ST.hmax)) + ST.vmax + 1e-6);
      const dt = Math.min(1.0, cfl); ST.dt = dt;
      const vol = lakeStep(dt); ST.released += vol; if (ST.Q > ST.Qpeak) { ST.Qpeak = ST.Q; ST.tQpeak = ST.t; }
      emitParticles(vol, dt);
      const sub = ST.n > 900 ? 1 : 2; for (let k = 0; k < sub; k++) sphStep(dt / sub);
      sweStep(dt);
      ST.t += dt; ST.steps++;
      if (ST.steps % 4 === 0) { gaugeRecord(); assetRecord(); }
      if (ST.t > TMAX) ST.done = true;
    }
    ST.grid = sumGrid(); ST.inflight = sumParticles();
    const acc = ST.grid + ST.inflight + ST.out + ST.pending;
    ST.err = ST.released > 1 ? (ST.released - acc - ST.clampLoss) / ST.released : 0;
  }
  let TMAX = 5400;

  /* ---------- gauges ---------- */
  const GAUGES = [];
  function buildGauges() {
    const defs = [['Below handoff', SITE.hand + 400], ['Raini', SITE.raini + 350], ['Tapovan', SITE.tapovan + 350], ['Joshimath', SITE.joshimath]];
    for (const [name, s] of defs) {
      const c = lineAt(MAIN, s), tg = lineTan(MAIN, s); const cells = new Set();
      for (let o = -900; o <= 900; o += DX * 0.5) { const k = cellAt(c[0] - tg[1] * o, c[1] + tg[0] * o); if (act[k]) cells.add(k); }
      GAUGES.push({ name, s, tx: tg[0], tz: tg[1], cells: Int32Array.from(cells) });
    }
  }
  function gaugeRecord() {
    ST.gt.push(ST.t);
    for (let g = 0; g < GAUGES.length; g++) { const G_ = GAUGES[g]; let q = 0; for (const k of G_.cells) q += (u[k] * G_.tx + w[k] * G_.tz) * d[k] * DX; ST.gauges[g].push(Math.max(0, q)); }
  }

  /* ---------- exposed assets ---------- */
  // Heights above the local thalweg and population are indicative demo values.
  const ASSETS = [
    { id: 'hp1', name: 'Rishiganga HEP', kind: 'hydro', s: SITE.raini - 450, side: -1, h: 3, pop: 50, te: 6, route: 'foot', note: 'Powerhouse and intake on the river bank' },
    { id: 'raini_low', name: 'Raini (lower hamlet)', kind: 'village', s: SITE.raini - 150, side: 1, h: 13, pop: 60, te: 5, route: 'foot', note: 'Houses on the lower terrace' },
    { id: 'raini_up', name: 'Raini Chak Lata', kind: 'village', s: SITE.raini + 150, side: 1, h: 70, pop: 300, te: 0, route: 'none', note: 'Main village above the gorge' },
    { id: 'hp2', name: 'Tapovan Vishnugad barrage', kind: 'hydro', s: SITE.tapovan - 200, side: 1, h: 3, pop: 90, te: 8, route: 'road', road: 'road1', note: 'Barrage and desilting works' },
    { id: 'tunnel', name: 'Tapovan tunnel adit', kind: 'hydro', s: SITE.tapovan + 250, side: -1, h: 9, pop: 80, te: 15, route: 'road', road: 'road1', note: 'Workers underground need the longest exit time' },
    { id: 'tapovan', name: 'Tapovan village', kind: 'village', s: SITE.tapovan + 700, side: 1, h: 28, pop: 450, te: 6, route: 'foot', note: 'Settlement on the terrace' },
    { id: 'vishnuprayag', name: 'Vishnuprayag riverside', kind: 'village', s: SITE.joshimath - 250, side: -1, h: 8, pop: 90, te: 6, route: 'foot', note: 'Shops and homes near the confluence' },
    { id: 'joshimath', name: 'Joshimath', kind: 'town', s: SITE.joshimath + 250, side: 1, h: 260, pop: 17000, te: 0, route: 'none', note: 'Town on the high slope' },
  ];
  const ROADS = [
    { id: 'bridge_raini', name: 'Raini bridge', kind: 'bridge', s0: SITE.raini + 250, s1: SITE.raini + 250, h: 10 },
    { id: 'road1', name: 'Joshimath to Malari road, Raini to Tapovan', kind: 'road', s0: SITE.raini + 600, s1: SITE.tapovan - 300, h: 16 },
    { id: 'bridge_tapovan', name: 'Tapovan bridge', kind: 'bridge', s0: SITE.tapovan + 500, s1: SITE.tapovan + 500, h: 12 },
  ];
  function placeAssets() {
    for (const a of ASSETS) {
      const c = lineAt(MAIN, a.s), tg = lineTan(MAIN, a.s), nr = [-tg[1] * a.side, tg[0] * a.side];
      const kc = riverCellAt(a.s); const zt = b0[kc]; a.zt = zt; a.cell = kc; a.elev = zt + a.h;
      let o = 0; for (; o < 3000; o += 10) { const e = sampleArr(b0, c[0] + nr[0] * o, c[1] + nr[1] * o); if (e >= zt + a.h) break; }
      o += 25; a.x = c[0] + nr[0] * o; a.z = c[1] + nr[1] * o; a.y = sampleArr(b0, a.x, a.z);
    }
    for (const r of ROADS) {
      r.cells = []; for (let s = r.s0; s <= r.s1; s += 200) { const k = riverCellAt(s); r.cells.push({ k, elev: b0[k] + r.h, s }); }
    }
  }
  function assetRecord() {
    for (let q = 0; q < ASSETS.length; q++) {
      const a = ASSETS[q], k = a.cell, st = ST.assetState[q];
      const dep = b[k] + d[k] - a.elev; if (dep > st.maxDepth) st.maxDepth = dep;
      if (st.tFront < 0 && d[k] > 0.5) st.tFront = ST.t;
      if (st.tFlood < 0 && dep > 0.2) st.tFlood = ST.t;
    }
    for (let q = 0; q < ROADS.length; q++) { const r = ROADS[q], st = ST.roadState[q]; if (st.tClose >= 0) continue; for (const c of r.cells) if (b[c.k] + d[c.k] > c.elev - 1) { st.tClose = ST.t; break; } }
  }

  /* ---------- rapid surrogate: 1D kinematic wave on terrain derived sections ---------- */
  const SUR = { ds: 250, sec: [] };
  function buildSections() {
    SUR.sec = []; const HL = 121, dh = 0.5;
    for (let s = SITE.dam; s <= Math.min(S_OUT - 100, SITE.joshimath + 800); s += SUR.ds) {
      const c = lineAt(MAIN, s), tg = lineTan(MAIN, s); const prof = [];
      for (let o = -1400; o <= 1400; o += 20) prof.push(sampleArr(b0, c[0] - tg[1] * o, c[1] + tg[0] * o));
      let imin = 70; for (let q = 55; q <= 85; q++) if (prof[q] < prof[imin]) imin = q;
      const zmin = prof[imin]; const A = new Float64Array(HL), K = new Float64Array(HL), W = new Float64Array(HL);
      for (let hq = 0; hq < HL; hq++) {
        const lev = zmin + hq * dh; let l = imin, r = imin; while (l > 0 && prof[l - 1] < lev) l--; while (r < prof.length - 1 && prof[r + 1] < lev) r++;
        W[hq] = Math.max(20, (r - l + 1) * 20);
        if (hq > 0) A[hq] = A[hq - 1] + 0.5 * (W[hq] + W[hq - 1]) * dh;
        const Pw = W[hq] + 2 * hq * dh; K[hq] = A[hq] * Math.pow(A[hq] / Pw, 2 / 3);
      }
      const S = Math.max(0.006, (bedMain(s - 200) - bedMain(s + 200)) / 400);
      SUR.sec.push({ s, zmin, A, K, W, sqS: Math.sqrt(S) });
    }
  }
  function surrogate(p, Qin, dtIn) {
    const sec = SUR.sec, ns = sec.length, dt = 3, ds = SUR.ds, n = p.n || 0.045; const tmax = TMAX;
    const Aa = new Float64Array(ns), Qs = new Float64Array(ns), hmax = new Float64Array(ns), tarr = new Float64Array(ns).fill(-1), Qp = new Float64Array(ns), hA = new Float64Array(ns);
    const aT = ASSETS.map(() => -1), aD = ASSETS.map(() => -99), rT = ROADS.map(() => -1);
    const secOf = s => Math.max(0, Math.min(ns - 1, Math.round((s - SITE.dam) / ds)));
    const aSec = ASSETS.map(a => secOf(a.s)), rSec = ROADS.map(r => { const l = []; for (let s = r.s0; s <= r.s1; s += 200) l.push(secOf(s)); return l; });
    function qOfA(sc, a) { const A = sc.A; if (a <= 0) return [0, 0]; let lo = 0, hi = A.length - 1; if (a >= A[hi]) { return [sc.K[hi] * sc.sqS / n * (a / A[hi]) ** 1.6, (hi) * 0.5 + (a - A[hi]) / sc.W[hi]]; } while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] <= a) lo = m; else hi = m; } const t = (a - A[lo]) / (A[hi] - A[lo]); return [(sc.K[lo] + (sc.K[hi] - sc.K[lo]) * t) * sc.sqS / n, (lo + t) * 0.5]; }
    for (let t = 0, it = 0; t <= tmax; t += dt, it++) {
      const qi = Math.floor(t / dtIn); const qin = qi < Qin.length ? Qin[qi] : 0;
      for (let i = ns - 1; i >= 0; i--) { const up = i === 0 ? qin : Qs[i - 1]; Aa[i] = Math.max(0, Aa[i] + dt / ds * (up - Qs[i])); }
      for (let i = 0; i < ns; i++) { const r = qOfA(sec[i], Aa[i]); Qs[i] = r[0]; hA[i] = r[1]; if (r[1] > hmax[i]) hmax[i] = r[1]; if (r[0] > Qp[i]) Qp[i] = r[0]; if (tarr[i] < 0 && r[1] > 0.5) tarr[i] = t; }
      for (let a = 0; a < ASSETS.length; a++) { const i = aSec[a]; const wse = sec[i].zmin + hA[i]; const dep = wse - ASSETS[a].elev; if (dep > aD[a]) aD[a] = dep; if (aT[a] < 0 && dep > 0.2) aT[a] = t; }
      for (let r = 0; r < ROADS.length; r++) if (rT[r] < 0) for (const i of rSec[r]) { if (sec[i].zmin + hA[i] > (sec[i].zmin + ROADS[r].h) - 1) { rT[r] = t; break; } }
    }
    const at = s => { const i = secOf(s); return { arr: tarr[i], hmax: hmax[i], Qp: Qp[i] }; };
    return { sites: { raini: at(SITE.raini + 350), tapovan: at(SITE.tapovan + 350), joshimath: at(SITE.joshimath) }, assetT: aT, assetD: aD, roadT: rT, hmax, tarr, Qp };
  }
  function runScenarioSurrogate(p) {
    if (p.mode === 'hindcast') buildDam(12); else buildDam(p.Hd);
    const hg = hydrograph(p, 2, TMAX);
    let pk = 0, tp = 0; hg.Q.forEach((q, i) => { if (q > pk) { pk = q; tp = i * 2; } });
    const r = surrogate(p, hg.Q, 2); r.peakQ = pk; r.tPeak = tp; r.V0 = hg.V0; r.hg = hg; return r;
  }

  function init() {
    buildTerrain(); buildMask(); buildGauges(); placeAssets(); buildSections();
    reset(SCEN.large); refreshDamCells();
  }
  function setScenario(p) { reset(p); refreshDamCells(); }
  function getOutletHydrograph() {
    return { gt: Array.from(ST.gt || []), Q: ST.gauges && ST.gauges[3] ? Array.from(ST.gauges[3]) : [] };
  }

  root.DamCore = {
    G, NX, NZ, LX, LZ, DX, N, MAIN, TRIB, SITE, S_IN, S_OUT, b0, bDam, b, d, u, w, maxd, maxv, arr, hzd, sC, dC, dT, act, lakeCell,
    get actList() { return actList; }, px, py, pz, pvx, pvy, pvz, page, pvol, NP, ST, SCEN, get P() { return P; }, get DAM() { return DAM; }, LAKE, GAUGES, ASSETS, ROADS, SUR,
    init, setScenario, reset, step, lineAt, lineTan, nearest, bedMain, sampleArr, cellAt, riverCellAt, lakeV, lakeZ, lakeArea, buildDam, hydrograph, surrogate, runScenarioSurrogate, mulberry32, vnoise, fbm,
    set TMAX(v) { TMAX = v; }, get TMAX() { return TMAX; }, get NEARDAM() { return NEARDAM; }, get LAKECELLS() { return LAKECELLS; }, hindcastQ, getOutletHydrograph,
  };
})(typeof window !== 'undefined' ? window : globalThis);
