// Seeded randomness for the simulator and the Monte Carlo forecaster (mulberry32 core).

export interface Rng {
  (): number;
  normal(): number;
  poisson(lambda: number): number;
  int(n: number): number;
  pick<T>(a: readonly T[]): T;
  range(lo: number, hi: number): number;
  chance(p: number): boolean;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  let spare: number | null = null;
  const u = (() => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  u.normal = () => {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let x = 0, y = 0, r = 0;
    do { x = u() * 2 - 1; y = u() * 2 - 1; r = x * x + y * y; } while (r === 0 || r >= 1);
    const f = Math.sqrt((-2 * Math.log(r)) / r);
    spare = y * f;
    return x * f;
  };
  u.poisson = (lambda) => {
    if (lambda <= 0) return 0;
    if (lambda > 30) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * u.normal()));
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= u(); } while (p > L);
    return k - 1;
  };
  u.int = (n) => Math.floor(u() * n);
  u.pick = (arr) => arr[Math.floor(u() * arr.length)];
  u.range = (lo, hi) => lo + (hi - lo) * u();
  u.chance = (p) => u() < p;
  return u;
}

/** Derive an independent stream seed from a parent seed and a label. */
export function subSeed(seed: number, label: string): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
