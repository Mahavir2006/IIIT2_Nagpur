/* 2D shallow-water solver on an arbitrary DEM grid.
 *
 * Generalisation of sweStep() in src/simulation/damcore.ts to any GridSpec:
 *  - cell-centred finite volume, conserved state h, hu, hv in Float64;
 *  - HLL Riemann solver with the hydrostatic reconstruction of Audusse et al. (2004), which is
 *    well balanced (lake at rest stays at rest) and positivity preserving;
 *  - point-implicit Manning friction (same form as damcore);
 *  - adaptive time step from the actual HLL wave speeds of the current state (CFL 0.45);
 *  - active-cell tracking: only cells that hold water, plus their 4 neighbours, are computed;
 *  - open box edges: transmissive (zero-gradient) ghost cell when the flow leaves the box, solid
 *    wall when it would enter, so water can leave but never be created at the boundary. The volume
 *    leaving is accumulated for the mass ledger.
 *
 * Conventions (types/scenario.ts): row 0 = north, col 0 = west, k = r * cols + c.
 * Internally u is the velocity toward +col (east) and v toward +row (SOUTH).
 */

export const G = 9.81;
/** Outward speed above which a box edge acts as free outflow (else it is a wall), m/s. */
export const OUTFLOW_MIN_SPEED = 1e-3;

export interface SolverOptions {
  cols: number;
  rows: number;
  dx: number;
  dy: number;
  /** Bed elevation, m. Copied. */
  bed: ArrayLike<number>;
  manning: number;
  cfl?: number;
  /** Depth below which a cell is treated as dry (no velocity, no mass flux between two such faces). */
  hDry?: number;
  /** Speed cap, m/s (limits spurious velocities in very thin films at wet/dry fronts). */
  maxSpeed?: number;
  /** Envelope bookkeeping (optional). */
  envelopes?: Envelopes;
}

export interface Envelopes {
  peakDepth: Float32Array;
  arrival: Float32Array;
  peakSpeed: Float32Array;
  peakHazard: Float32Array;
  /** Depth used to define arrival, m. */
  arrivalDepth: number;
  /** Minimum depth for recording speed (thin films can carry large, meaningless speeds). */
  speedMinDepth: number;
}

// HLL result scratch (module-level: no per-call allocation).
// [0] mass flux, [1] normal-momentum flux seen by the LEFT cell, [2] ... seen by the RIGHT cell,
// [3] tangential-momentum flux, [4] max |wave speed| at this face.
const FL = new Float64Array(5);

/** HLL flux across a face with Audusse hydrostatic reconstruction. States are given in the face
 * frame: un = velocity normal to the face (left->right positive), ut = tangential velocity. */
function hll(hL: number, unL: number, utL: number, zL: number, hR: number, unR: number, utR: number, zR: number, heps: number): void {
  const zf = zL > zR ? zL : zR;
  let hl = hL + zL - zf; if (hl < 0) hl = 0;
  let hr = hR + zR - zf; if (hr < 0) hr = 0;
  if (hl < heps && hr < heps) {
    // no mass exchange between two films; keep the centred film pressure so that the Audusse
    // correction below stays exactly balanced for a lake at rest (hl == hr)
    const pf = 0.25 * G * (hl * hl + hr * hr);
    FL[0] = 0; FL[3] = 0; FL[4] = 0;
    FL[1] = pf + 0.5 * G * (hL * hL - hl * hl);
    FL[2] = pf + 0.5 * G * (hR * hR - hr * hr);
    return;
  }
  const cl = Math.sqrt(G * hl), cr = Math.sqrt(G * hr);
  let sl: number, sr: number;
  if (hr < heps) { sl = unL - cl; sr = unL + 2 * cl; }            // dry right: Toro (2001) dry-bed speeds
  else if (hl < heps) { sl = unR - 2 * cr; sr = unR + cr; }       // dry left
  else {
    sl = unL - cl < unR - cr ? unL - cl : unR - cr;
    sr = unL + cl > unR + cr ? unL + cl : unR + cr;
  }
  const f0l = hl * unL, f1l = hl * unL * unL + 0.5 * G * hl * hl, f2l = hl * unL * utL;
  const f0r = hr * unR, f1r = hr * unR * unR + 0.5 * G * hr * hr, f2r = hr * unR * utR;
  let f0: number, f1: number, f2: number;
  if (sl >= 0) { f0 = f0l; f1 = f1l; f2 = f2l; }
  else if (sr <= 0) { f0 = f0r; f1 = f1r; f2 = f2r; }
  else {
    const k = 1 / (sr - sl), sls = sl * sr;
    f0 = (sr * f0l - sl * f0r + sls * (hr - hl)) * k;
    f1 = (sr * f1l - sl * f1r + sls * (hr * unR - hl * unL)) * k;
    f2 = (sr * f2l - sl * f2r + sls * (hr * utR - hl * utL)) * k;
  }
  FL[0] = f0; FL[3] = f2;
  FL[1] = f1 + 0.5 * G * (hL * hL - hl * hl);
  FL[2] = f1 + 0.5 * G * (hR * hR - hr * hr);
  const as = -sl > sr ? -sl : sr;
  FL[4] = as;
}

export class ShallowWaterSolver {
  readonly cols: number;
  readonly rows: number;
  readonly n: number;
  readonly dx: number;
  readonly dy: number;
  readonly cellArea: number;
  manning: number;
  cfl: number;
  hDry: number;
  maxSpeed: number;

  /** Bed elevation (may be edited in place by boundary conditions, e.g. dam walls / breach carving). */
  readonly z: Float64Array;
  readonly h: Float64Array;
  readonly hu: Float64Array;
  readonly hv: Float64Array;
  /** Primitive velocities, kept in sync with the conserved state after every update. */
  readonly u: Float64Array;
  readonly v: Float64Array;

  /** 0 = inactive, 1 = active, 2 = activated during the current update (becomes 1 after it). */
  readonly active: Uint8Array;
  /** 1 once the cell's 4 neighbours have been activated. */
  private readonly nbrDone: Uint8Array;
  /** Active cell indices, first nActive entries valid. */
  list: Int32Array;
  nActive = 0;

  // Face fluxes, interleaved 4 per cell: east face of cell k (between k and k+1) and south face
  // (between k and k+cols). [mass, normal mom. seen by west/north cell, ... by east/south cell, tangential]
  private readonly fE: Float64Array;
  private readonly fS: Float64Array;

  /** Simulated time, s. */
  t = 0;
  steps = 0;
  /** Cumulative volume that left the box through its edges, m3. */
  outflowVolume = 0;
  /** Volume created by clamping negative depths to zero (should stay ~0), m3. */
  clampVolume = 0;
  /** Outflow rate over the last step, m3/s. */
  lastOutflowRate = 0;
  /** Sum over steps of cells computed (for cell-updates/s). */
  cellUpdates = 0;

  private maxRate = 0; // max |s|/d over faces from last computeFluxes
  private readonly env: Envelopes | null;

  constructor(o: SolverOptions) {
    this.cols = o.cols; this.rows = o.rows; this.n = o.cols * o.rows;
    this.dx = o.dx; this.dy = o.dy; this.cellArea = o.dx * o.dy;
    this.manning = o.manning;
    this.cfl = o.cfl ?? 0.45;
    this.hDry = o.hDry ?? 1e-3;
    this.maxSpeed = o.maxSpeed ?? 50;
    const n = this.n;
    if (o.bed.length !== n) throw new Error(`bed length ${o.bed.length} != cols*rows ${n}`);
    this.z = new Float64Array(n);
    for (let k = 0; k < n; k++) this.z[k] = o.bed[k];
    this.h = new Float64Array(n); this.hu = new Float64Array(n); this.hv = new Float64Array(n);
    this.u = new Float64Array(n); this.v = new Float64Array(n);
    this.active = new Uint8Array(n); this.nbrDone = new Uint8Array(n);
    this.list = new Int32Array(Math.min(n, 4096));
    this.fE = new Float64Array(4 * n); this.fS = new Float64Array(4 * n);
    this.env = o.envelopes ?? null;
  }

  // ---------------------------------------------------------------- active set
  private pushActive(k: number, flag: number): void {
    if (this.nActive === this.list.length) {
      const nl = new Int32Array(Math.min(this.n, this.list.length * 2));
      nl.set(this.list); this.list = nl;
    }
    this.list[this.nActive++] = k;
    this.active[k] = flag;
  }

  /** Activate k and its 4 neighbours (outside of an update pass). */
  activateWithNeighbours(k: number): void {
    if (!this.active[k]) this.pushActive(k, 1);
    if (this.nbrDone[k]) return;
    this.nbrDone[k] = 1;
    const c = k % this.cols, cols = this.cols;
    if (c > 0 && !this.active[k - 1]) this.pushActive(k - 1, 1);
    if (c < cols - 1 && !this.active[k + 1]) this.pushActive(k + 1, 1);
    if (k >= cols && !this.active[k - cols]) this.pushActive(k - cols, 1);
    if (k + cols < this.n && !this.active[k + cols]) this.pushActive(k + cols, 1);
  }

  /** Replace the whole state (e.g. test initial conditions). Rebuilds the active set. */
  setState(h: ArrayLike<number>, hu?: ArrayLike<number>, hv?: ArrayLike<number>): void {
    this.active.fill(0); this.nbrDone.fill(0); this.nActive = 0;
    for (let k = 0; k < this.n; k++) {
      this.h[k] = h[k]; this.hu[k] = hu ? hu[k] : 0; this.hv[k] = hv ? hv[k] : 0;
    }
    for (let k = 0; k < this.n; k++) {
      this.syncVelocity(k);
      if (this.h[k] > 0) this.activateWithNeighbours(k);
    }
  }

  private syncVelocity(k: number): void {
    const hk = this.h[k];
    if (hk < this.hDry) { this.u[k] = 0; this.v[k] = 0; this.hu[k] = 0; this.hv[k] = 0; return; }
    let uu = this.hu[k] / hk, vv = this.hv[k] / hk;
    const s = Math.sqrt(uu * uu + vv * vv);
    if (s > this.maxSpeed) { const f = this.maxSpeed / s; uu *= f; vv *= f; this.hu[k] = uu * hk; this.hv[k] = vv * hk; }
    this.u[k] = uu; this.v[k] = vv;
  }

  /** Add a volume of water (m3) to cell k carrying velocity (ue east, vs south) m/s. Mass exact. */
  addWater(k: number, volume: number, ue: number, vs: number): void {
    if (volume <= 0) return;
    const dh = volume / this.cellArea;
    this.h[k] += dh; this.hu[k] += dh * ue; this.hv[k] += dh * vs;
    this.syncVelocity(k);
    this.activateWithNeighbours(k);
  }

  /** Sort the active list by index for memory locality. */
  sortActive(): void { this.list.subarray(0, this.nActive).sort(); }

  // ---------------------------------------------------------------- numerics
  /** Compute all face fluxes of the active set from the current state. Returns the largest stable
   * dt (CFL * min over faces of d / |s|), or Infinity if nothing moves. */
  computeFluxes(): number {
    const { cols, n, h, u, v, z, fE, fS, list, hDry } = this;
    const nA = this.nActive, lastCol = cols - 1;
    const idx = 1 / this.dx, idy = 1 / this.dy;
    let rate = 0;
    for (let q = 0; q < nA; q++) {
      const i = list[q];
      const hi = h[i], ui = u[i], vi = v[i], zi = z[i];
      const c = i % cols;
      const o = 4 * i;
      if (c < lastCol) {
        const j = i + 1;
        hll(hi, ui, vi, zi, h[j], u[j], v[j], z[j], hDry);
        fE[o] = FL[0]; fE[o + 1] = FL[1]; fE[o + 2] = FL[2]; fE[o + 3] = FL[3];
        const r = FL[4] * idx; if (r > rate) rate = r;
      }
      const j2 = i + cols;
      if (j2 < n) {
        hll(hi, vi, ui, zi, h[j2], v[j2], u[j2], z[j2], hDry);
        fS[o] = FL[0]; fS[o + 1] = FL[1]; fS[o + 2] = FL[2]; fS[o + 3] = FL[3];
        const r = FL[4] * idy; if (r > rate) rate = r;
      }
    }
    this.maxRate = rate;
    return rate > 0 ? this.cfl / rate : Infinity;
  }

  /** Boundary flux in the cell's OUTWARD frame: returns via FL. Transmissive (zero-gradient ghost)
   * if the flow leaves faster than OUTFLOW_MIN_SPEED, reflective wall otherwise (no inflow ever).
   * The threshold matters: with a plain "open if un > 0" switch, round-off velocities (~1e-14 m/s)
   * in water ponded against the edge are rectified into outflow and grow exponentially (seen in the
   * lake-at-rest test). 1 mm/s is far above round-off and far below any flood velocity. */
  private boundaryFlux(hi: number, unOut: number, ut: number, zi: number): void {
    const open = unOut > OUTFLOW_MIN_SPEED;
    hll(hi, unOut, ut, zi, hi, open ? unOut : -unOut, ut, zi, this.hDry);
  }

  /** Advance the active set by dt using the fluxes from computeFluxes(). */
  update(dt: number): void {
    const { cols, rows, n, h, hu, hv, u, v, z, fE, fS, list, active, nbrDone, hDry } = this;
    const nA = this.nActive, lastCol = cols - 1, lastRowStart = (rows - 1) * cols;
    const kx = dt / this.dx, ky = dt / this.dy;
    const n2g = G * this.manning * this.manning;
    const maxS = this.maxSpeed;
    let out = 0; // outflow volume this step
    const env = this.env;
    const tNew = this.t + dt;
    for (let q = 0; q < nA; q++) {
      const i = list[q];
      const c = i % cols;
      const h0 = h[i], z0 = z[i];
      // --- x direction: east face (stored at i), west face (stored at i-1)
      let mE: number, uE: number, vE: number, mW: number, uW: number, vW: number;
      if (c < lastCol) { const o = 4 * i; mE = fE[o]; uE = fE[o + 1]; vE = fE[o + 3]; }
      else {
        if (h0 > 0) {
          this.boundaryFlux(h0, u[i], v[i], z0);
          mE = FL[0]; uE = FL[1]; vE = FL[3]; out += FL[0] * dt * this.dy;
        } else { mE = 0; uE = 0; vE = 0; }
      }
      if (c > 0) {
        const il = i - 1;
        if (active[il] === 1) { const o = 4 * il; mW = fE[o]; uW = fE[o + 2]; vW = fE[o + 3]; }
        else { mW = 0; uW = 0; vW = 0; }
      } else {
        if (h0 > 0) {
          // outward normal is -x: un_out = -u; flux F_out is in -x frame, convert: F_x = -F_out for mass
          // and tangential; normal-momentum flux (a momentum flux of -x momentum across a -x face) keeps sign.
          this.boundaryFlux(h0, -u[i], v[i], z0);
          mW = -FL[0]; uW = FL[1]; vW = -FL[3]; out += FL[0] * dt * this.dy;
        } else { mW = 0; uW = 0; vW = 0; }
      }
      // --- y direction (+row = south): south face (stored at i), north face (stored at i-cols)
      let mS: number, vS: number, uS: number, mN: number, vN: number, uN: number;
      if (i < lastRowStart) { const o = 4 * i; mS = fS[o]; vS = fS[o + 1]; uS = fS[o + 3]; }
      else {
        if (h0 > 0) {
          this.boundaryFlux(h0, v[i], u[i], z0);
          mS = FL[0]; vS = FL[1]; uS = FL[3]; out += FL[0] * dt * this.dx;
        } else { mS = 0; vS = 0; uS = 0; }
      }
      if (i >= cols) {
        const it = i - cols;
        if (active[it] === 1) { const o = 4 * it; mN = fS[o]; vN = fS[o + 2]; uN = fS[o + 3]; }
        else { mN = 0; vN = 0; uN = 0; }
      } else {
        if (h0 > 0) {
          this.boundaryFlux(h0, -v[i], u[i], z0);
          mN = -FL[0]; vN = FL[1]; uN = -FL[3]; out += FL[0] * dt * this.dx;
        } else { mN = 0; vN = 0; uN = 0; }
      }
      let hn = h0 - kx * (mE - mW) - ky * (mS - mN);
      let qu = hu[i] - kx * (uE - uW) - ky * (uS - uN);
      let qv = hv[i] - kx * (vE - vW) - ky * (vS - vN);
      if (hn < 0) { this.clampVolume += -hn * this.cellArea; hn = 0; }
      let uu = 0, vv = 0;
      if (hn < hDry) { qu = 0; qv = 0; }
      else {
        // point-implicit Manning friction: q^{n+1} = q* / (1 + dt g n^2 |u| / h^{4/3})
        const sp = Math.sqrt(qu * qu + qv * qv) / hn;
        if (n2g > 0) { const fr = 1 / (1 + dt * n2g * sp / Math.pow(hn, 4 / 3)); qu *= fr; qv *= fr; }
        uu = qu / hn; vv = qv / hn;
        const s = Math.sqrt(uu * uu + vv * vv);
        if (s > maxS) { const f = maxS / s; uu *= f; vv *= f; qu = uu * hn; qv = vv * hn; }
      }
      h[i] = hn; hu[i] = qu; hv[i] = qv; u[i] = uu; v[i] = vv;
      if (hn > 0 && !nbrDone[i]) {
        nbrDone[i] = 1;
        if (c > 0 && !active[i - 1]) this.pushActive(i - 1, 2);
        if (c < lastCol && !active[i + 1]) this.pushActive(i + 1, 2);
        if (i >= cols && !active[i - cols]) this.pushActive(i - cols, 2);
        if (i + cols < n && !active[i + cols]) this.pushActive(i + cols, 2);
      }
      if (env !== null && hn > 0) {
        if (hn > env.peakDepth[i]) env.peakDepth[i] = hn;
        if (hn >= env.arrivalDepth && env.arrival[i] < 0) env.arrival[i] = tNew;
        const sp = Math.sqrt(uu * uu + vv * vv);
        if (hn >= env.speedMinDepth && sp > env.peakSpeed[i]) env.peakSpeed[i] = sp;
        const hz = hn * sp; if (hz > env.peakHazard[i]) env.peakHazard[i] = hz;
      }
    }
    // NB: this.list, not the local `list`: pushActive() may have reallocated it during the loop
    const L = this.list;
    for (let q = nA; q < this.nActive; q++) active[L[q]] = 1;
    this.cellUpdates += nA;
    this.outflowVolume += out;
    this.lastOutflowRate = dt > 0 ? out / dt : 0;
    this.t = tNew;
    this.steps++;
    if ((this.steps & 63) === 0) this.sortActive();
  }

  /** One full step with the adaptive dt, capped at dtMax. Returns dt used. */
  step(dtMax: number): number {
    const dtc = this.computeFluxes();
    const dt = dtc < dtMax ? dtc : dtMax;
    this.update(dt);
    return dt;
  }

  /** Stored volume, m3 (sum over the active set; inactive cells are dry by construction). */
  volume(): number {
    let s = 0; const h = this.h, list = this.list;
    for (let q = 0; q < this.nActive; q++) s += h[list[q]];
    return s * this.cellArea;
  }

  /** Last computed max wave-speed / cell-size, 1/s. */
  get waveRate(): number { return this.maxRate; }
}
