// From sampled futures to failure chains: the most probable order in which systems hit CRITICAL,
// where it branches, which feedback loops are active, and which separate cascades run at once.
//
// Simultaneous cascades are told apart by their trigger: zones whose first system to fail is the
// same (drainage after rain vs power after a substation fault) form one cascade. Two cascades
// interact when their zones border each other, so stress spills between them.

import { SYSTEMS, SYSTEM_INDEX, type CascadeChain, type CascadeStage, type NodeRef, type DependencyEdge } from '../contract';
import type { McResult } from './forecast';
import { ttcInterval } from './forecast';
import type { Fusion } from './fusion';

const NS = SYSTEMS.length;
const HAZARD = new Set([SYSTEM_INDEX.rain, SYSTEM_INDEX.river]);

interface Trie { count: number; children: Map<number, Trie> }

export function buildChains(mc: McResult, zoneIds: string[], nbrs: number[][], edges: DependencyEdge[], fusion: Fusion): CascadeChain[] {
  const P = mc.particles, nz = zoneIds.length;
  // ---- trigger of each zone: its modal first non-hazard system to reach CRITICAL
  const trigger = new Array<number>(nz).fill(-1);
  const zoneP = new Array<number>(nz).fill(0);
  for (let z = 0; z < nz; z++) {
    const votes = new Array<number>(NS).fill(0);
    let hits = 0;
    for (let p = 0; p < P; p++) {
      let best = -1, bt = Infinity;
      for (let k = 0; k < NS; k++) {
        if (HAZARD.has(k)) continue;
        const t = mc.firstCrit[(p * nz + z) * NS + k];
        if (t && t < bt) { bt = t; best = k; }
      }
      if (best >= 0) { votes[best]++; hits++; }
    }
    zoneP[z] = hits / P;
    if (hits / P >= 0.15) trigger[z] = votes.indexOf(Math.max(...votes));
  }
  const groups = new Map<number, number[]>();
  trigger.forEach((k, z) => { if (k >= 0) groups.set(k, [...(groups.get(k) ?? []), z]); });

  const chains: CascadeChain[] = [];
  const zoneSets: number[][] = [];
  const ordered = [...groups.entries()].sort((a, b) => b[1].reduce((s, z) => s + zoneP[z], 0) - a[1].reduce((s, z) => s + zoneP[z], 0));
  for (const [trig, zones] of ordered) {
    const id = `cascade-${SYSTEMS[trig]}`;
    // per particle: city-level (within group) first crossing per system, and where
    const seqs: { k: number; t: number; z: number }[][] = [];
    for (let p = 0; p < P; p++) {
      const firsts: { k: number; t: number; z: number }[] = [];
      for (let k = 0; k < NS; k++) {
        let bt = 0, bz = -1;
        for (const z of zones) { const t = mc.firstCrit[(p * nz + z) * NS + k]; if (t && (!bt || t < bt)) { bt = t; bz = z; } }
        if (bt) firsts.push({ k, t: bt, z: bz });
      }
      firsts.sort((a, b) => a.t - b.t || a.k - b.k);
      seqs.push(firsts);
    }
    const root: Trie = { count: 0, children: new Map() };
    for (const s of seqs) {
      let node = root; node.count++;
      for (const f of s) {
        let c = node.children.get(f.k);
        if (!c) { c = { count: 0, children: new Map() }; node.children.set(f.k, c); }
        c.count++; node = c;
      }
    }
    // greedy most-probable path; record alternatives
    const path: number[] = [];
    const branches: { atStage: number; alt: number; support: number }[] = [];
    let node = root;
    while (node.children.size) {
      const kids = [...node.children.entries()].sort((a, b) => b[1].count - a[1].count);
      if (kids[0][1].count / P < 0.08) break;
      for (const [k, c] of kids.slice(1, 3)) if (c.count / P >= 0.1) branches.push({ atStage: path.length, alt: k, support: c.count / P });
      path.push(kids[0][0]);
      node = kids[0][1];
    }
    if (!path.length) continue;
    const support = (() => { let n = root; let c = P; for (const k of path.slice(0, 3)) { n = n.children.get(k)!; c = n.count; } return c / P; })();

    const stages: CascadeStage[] = path.map((k, i) => {
      const hits = seqs.map((s) => s.find((f) => f.k === k)).filter((f): f is { k: number; t: number; z: number } => !!f);
      const zoneVotes = new Map<number, number>();
      for (const f of hits) zoneVotes.set(f.z, (zoneVotes.get(f.z) ?? 0) + 1);
      const z = [...zoneVotes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? zones[0];
      const node: NodeRef = { system: SYSTEMS[k], zoneId: zoneIds[z] };
      // cause: earlier stage with the strongest learned edge into this one
      let causedBy: NodeRef | null = null;
      let link: CascadeStage['link'] = null;
      let best = 0;
      for (let j = 0; j < i; j++) {
        const pk = path[j];
        const e = edges.find((ed) => ed.from.system === SYSTEMS[pk] && ed.to.system === SYSTEMS[k] && ed.from.zoneId !== 'upstream');
        const score = e ? e.weight * e.confidence : 0;
        if (score > best) {
          best = score;
          causedBy = { system: SYSTEMS[pk], zoneId: node.zoneId };
          link = { weight: e!.weight, lagH: e!.lagH, confidence: e!.confidence, evidence: fusion.evidenceFor(z, pk).slice(-3) };
        }
      }
      if (!causedBy && i > 0) causedBy = { system: SYSTEMS[path[i - 1]], zoneId: node.zoneId };
      return { node, prob: hits.length / P, eta: ttcInterval(hits.map((f) => f.t)) ?? { median: 0, p10: 0, p90: 0 }, causedBy, link };
    });

    // feedback loops among the chain's systems (2- and 3-cycles in the learned graph)
    const inChain = new Set(path.map((k) => SYSTEMS[k] as string));
    const has = (a: string, b: string) => edges.some((e) => e.from.system === a && e.to.system === b && e.from.zoneId !== 'upstream' && e.scope === 'local');
    const loops: NodeRef[][] = [];
    const list = [...inChain];
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      if (has(list[a], list[b]) && has(list[b], list[a])) loops.push([list[a], list[b]].map((s) => ({ system: s as never, zoneId: '*' })));
      for (let c = b + 1; c < list.length; c++) {
        const [x, y, w] = [list[a], list[b], list[c]];
        if ((has(x, y) && has(y, w) && has(w, x)) || (has(x, w) && has(w, y) && has(y, x))) loops.push([x, y, w].map((s) => ({ system: s as never, zoneId: '*' })));
      }
    }
    for (const k of path) if (edges.some((e) => e.scope === 'neighbour' && e.from.system === SYSTEMS[k] && e.to.system === SYSTEMS[k])) loops.push([{ system: SYSTEMS[k], zoneId: 'neighbours' }]);

    const cityHits: number[] = [];
    for (let p = 0; p < P; p++) if (mc.cityFirstCrit[p]) cityHits.push(mc.cityFirstCrit[p]);
    chains.push({
      id, support, stages,
      branches: branches.map((b) => ({ atStage: b.atStage, chainId: `${id}/alt-${SYSTEMS[b.alt]}@${b.atStage}`, support: b.support })),
      loops, interactsWith: [],
      cityCriticalEta: cityHits.length / P >= 0.1 ? ttcInterval(cityHits) : null,
    });
    zoneSets.push(zones);
  }
  // interactions: cascades whose zones border each other
  chains.forEach((a, i) => chains.forEach((b, j) => {
    if (i !== j && zoneSets[i].some((z) => zoneSets[j].some((y) => nbrs[z].includes(y)))) a.interactsWith.push(b.id);
  }));
  return chains;
}
