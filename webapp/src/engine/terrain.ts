/* Terrain pre-processing for the 4-connected finite-volume solver.
 *
 * DEMs conditioned for D8 routing (8-neighbour flow directions) contain channels whose cells touch
 * only diagonally: two low cells a, d on a diagonal with both "corner" cells b1, b2 higher. D8 treats
 * a -> d as connected; a finite-volume solver only exchanges water across the 4 cell faces, so such a
 * step behaves as a weir at min(b1, b2) and the channel becomes a staircase of pools.
 *
 * repairDiagonalPassages() lowers the lower corner to max(z_a, z_d) wherever
 *     max(z_a, z_d) < min(z_b1, z_b2)
 * which makes the passage 4-connected at exactly the spill level D8 assumed, and changes nothing
 * else. Repeated until no 2x2 block matches (values only decrease, each new value already exists in
 * the grid, so it terminates). Run before the grid holds water: it is then mass neutral. */

export interface RepairStats { cells: number; maxLowering: number; meanLowering: number; passes: number }

export interface FillStats { cells: number; maxRaise: number; meanRaise: number }

/* Priority-flood depression filling with an epsilon gradient (Barnes, Lehman & Mulla 2014,
 * Computers & Geosciences 62:117-127), 4-connected to match the solver. Afterwards every cell has a
 * strictly descending 4-neighbour path to the grid edge, so water cannot pond in SRTM noise pits
 * and flats and stall the flood. Run before the grid holds water (mass neutral) and before the dam
 * wall is built, so the reservoir basin is left alone. */
export function fillDepressions(z: Float64Array, cols: number, rows: number, eps = 1e-3): FillStats {
  const n = cols * rows;
  const done = new Uint8Array(n);
  const heap = new Int32Array(n);
  let size = 0;
  const push = (k: number) => {
    let i = size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (z[heap[p]] <= z[k]) break;
      heap[i] = heap[p]; i = p;
    }
    heap[i] = k;
  };
  const pop = () => {
    const top = heap[0], last = heap[--size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= size) break;
      if (c + 1 < size && z[heap[c + 1]] < z[heap[c]]) c++;
      if (z[heap[c]] >= z[last]) break;
      heap[i] = heap[c]; i = c;
    }
    heap[i] = last;
    return top;
  };
  for (let c = 0; c < cols; c++) { for (const r of [0, rows - 1]) { const k = r * cols + c; if (!done[k]) { done[k] = 1; push(k); } } }
  for (let r = 1; r < rows - 1; r++) { for (const c of [0, cols - 1]) { const k = r * cols + c; done[k] = 1; push(k); } }
  let cells = 0, maxRaise = 0, sum = 0;
  while (size > 0) {
    const k = pop();
    const r = (k / cols) | 0, c = k - r * cols;
    const floor = z[k] + eps;
    const nb = [r > 0 ? k - cols : -1, r < rows - 1 ? k + cols : -1, c > 0 ? k - 1 : -1, c < cols - 1 ? k + 1 : -1];
    for (const m of nb) {
      if (m < 0 || done[m]) continue;
      done[m] = 1;
      if (z[m] < floor) {
        const dz = floor - z[m];
        z[m] = floor; cells++; sum += dz; if (dz > maxRaise) maxRaise = dz;
      }
      push(m);
    }
  }
  return { cells, maxRaise, meanRaise: cells ? sum / cells : 0 };
}

export function repairDiagonalPassages(z: Float64Array, cols: number, rows: number, maxPasses = 20): RepairStats {
  const orig = new Map<number, number>();
  let passes = 0;
  for (; passes < maxPasses; passes++) {
    let changed = 0;
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = r * cols + c, b1 = a + 1, b2 = a + cols, d = b2 + 1;
        const za = z[a], zb1 = z[b1], zb2 = z[b2], zd = z[d];
        // diagonal a-d blocked by corners b1, b2?
        let hiPair = za > zd ? za : zd, loCorner = zb1 < zb2 ? zb1 : zb2;
        if (hiPair < loCorner) {
          const k = zb1 < zb2 ? b1 : b2;
          if (!orig.has(k)) orig.set(k, z[k]);
          z[k] = hiPair; changed++;
          continue;
        }
        // diagonal b1-b2 blocked by corners a, d?
        hiPair = zb1 > zb2 ? zb1 : zb2; loCorner = za < zd ? za : zd;
        if (hiPair < loCorner) {
          const k = za < zd ? a : d;
          if (!orig.has(k)) orig.set(k, z[k]);
          z[k] = hiPair; changed++;
        }
      }
    }
    if (!changed) break;
  }
  let maxL = 0, sum = 0;
  for (const [k, z0] of orig) { const dz = z0 - z[k]; sum += dz; if (dz > maxL) maxL = dz; }
  return { cells: orig.size, maxLowering: maxL, meanLowering: orig.size ? sum / orig.size : 0, passes: passes + 1 };
}
