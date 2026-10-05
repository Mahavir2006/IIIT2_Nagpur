'use client';

// Drives the district geofence, the risk heatmap texture and the settlement houses from the
// playhead. Runs on a 150 ms interval (not per animation frame): house states are cheap to refresh
// at ~7 Hz, while the heatmap (a chamfer pass over one district plus a texture upload) is
// throttled further, to when the playhead has moved ~15 simulated seconds, the flood envelopes
// changed, or the focused district changed.
//
// Risk-map view (ui.riskMap): the heatmap covers every district and shows the whole event (the
// full flood envelope, not the playhead), or with a finished breach ensemble the share of members
// that flood each cell, so it only recomputes when the envelopes, the ensemble, the basis or the
// warning policy change. Either way each recompute also rebuilds the per-zone loss table (lib/zoneLoss.ts),
// and the zone under the pointer is highlighted on the texture as the pointer moves.

import { useEffect, useRef, useState } from 'react';
import type { Device, Texture } from '@luma.gl/core';
import { big } from '@/lib/big';
import { cellOf } from '@/lib/grid';
import { GeoRisk } from '@/lib/geoRisk';
import { generateSettlements } from '@/lib/settlements';
import { aggregateZones, buildZoneIndex, ensembleFor, resolveBasis } from '@/lib/zoneLoss';
import { ensembleBig, useEnsemble } from '@/store/ensemble';
import type { HazardClass } from '@/lib/hazard';
import { useSim } from '@/store/sim';
import { useUi } from '@/store/ui';
import { geoBig, useGeo, type DistrictStats, type DistrictView, type GeoTotals } from '@/store/geo';

const SETTLEMENT_KINDS = new Set(['city', 'town', 'village', 'hamlet']);

export interface GeoEngine {
  riskTex: Texture | null;
  /** Bumps when house visuals changed (layer update trigger). */
  housesVersion: number;
  /** Bumps when the district/settlement geometry was (re)built for a scenario. */
  geoVersion: number;
}

export function useGeoEngine(device: Device | null, scnVersion: number): GeoEngine {
  const [geoVersion, setGeoVersion] = useState(0);
  const [housesVersion, setHousesVersion] = useState(0);
  const [riskTex, setRiskTex] = useState<Texture | null>(null);
  const texRef = useRef<{ textures: [Texture, Texture]; front: number } | null>(null);
  /** Place id -> district index, for the per-district place counts. */
  const placeDistrict = useRef<Map<string, number>>(new Map());
  const dirty = useRef(true);

  // ---- build per scenario (deferred one task so the scenario's first paint is not held up)
  useEffect(() => {
    const sc = big.scenario;
    if (!sc) return;
    const id = setTimeout(() => {
      const risk = new GeoRisk(sc);
      const houses = generateSettlements(sc, { dist: risk.riverDist, hand: risk.hand });
      for (let i = 0; i < houses.n; i++) houses.district[i] = risk.districtOfCell(houses.cell[i]);
      const pd = new Map<string, number>();
      const g = { bbox: sc.config.bbox, grid: sc.config.grid };
      for (const p of sc.exposure.places) pd.set(p.id, risk.districtOfCell(cellOf(g, p.lng, p.lat)));
      placeDistrict.current = pd;
      geoBig.risk = risk;
      geoBig.houses = houses;
      geoBig.zoneIdx = buildZoneIndex(sc, risk, houses);
      geoBig.scenarioId = sc.config.id;
      const districts: DistrictView[] = risk.districts.map((d) => ({ idx: d.idx, name: d.name, nameLocal: d.nameLocal, entryT: -1, domainKm2: d.areaKm2 }));
      useGeo.getState().set({ ready: true, districts, activeIdx: risk.sourceDistrict, focusIdx: null, stats: null, totals: null, announce: null, zones: null, hoverZone: null, hoverDistrict: null });
      dirty.current = true;
      setGeoVersion((v) => v + 1);
    }, 0);
    return () => {
      clearTimeout(id);
      geoBig.risk = null;
      geoBig.houses = null;
      geoBig.zoneIdx = null;
      geoBig.scenarioId = null;
      useGeo.getState().set({ ready: false, districts: [], activeIdx: -1, focusIdx: null, stats: null, totals: null, announce: null, zones: null, hoverZone: null, hoverDistrict: null });
    };
  }, [scnVersion]);

  // ---- heatmap textures (two, written alternately so the layer sees a new image identity)
  useEffect(() => {
    const risk = geoBig.risk;
    if (!device || !risk) return;
    const make = () => device.createTexture({
      width: risk.heatCols,
      height: risk.heatRows,
      format: 'rgba8unorm',
      mipLevels: 1,
      sampler: { minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' },
    });
    const textures: [Texture, Texture] = [make(), make()];
    textures[0].writeData(risk.rgba);
    textures[1].writeData(risk.rgba);
    texRef.current = { textures, front: 0 };
    dirty.current = true;
    queueMicrotask(() => setRiskTex(textures[0]));
    return () => {
      texRef.current = null;
      queueMicrotask(() => setRiskTex((t) => (t === textures[0] || t === textures[1] ? null : t)));
      setTimeout(() => { textures[0].destroy(); textures[1].destroy(); }, 500);
    };
  }, [device, geoVersion]);

  // ---- playback loop
  useEffect(() => {
    const st = {
      lastT: -1, lastFV: -1, housesAt: 0, housesT: -1,
      entryFV: -1, entrySV: -1, entryAt: 0,
      riskT: -1e9, riskFocus: -2, riskFV: -1, riskSV: -1, riskAt: 0, riskOn: false, riskDirty: true,
      riskMap: false, policy: '', basis: '', ensV: -1,
    };
    let entry = new Float32Array(0);
    let lastShowRisk = useUi.getState().showDistrictRisk;

    // upload the current heatmap image (or a blank one when the heatmap is switched off)
    const pushTex = (showRisk: boolean) => {
      const tex = texRef.current, risk = geoBig.risk;
      if (!tex || !risk || (!showRisk && !st.riskOn)) return;
      const back = 1 - tex.front;
      tex.textures[back].writeData(showRisk ? risk.rgba : new Uint8ClampedArray(risk.rgba.length));
      tex.front = back;
      st.riskOn = showRisk;
      setRiskTex(tex.textures[back]);
    };

    // zone under the pointer -> store + texture highlight. `force` re-applies the highlight after a
    // recompute (which resets the image) without uploading; the caller uploads.
    const syncHover = (force: boolean) => {
      const risk = geoBig.risk;
      if (!risk) return;
      const ui = useUi.getState();
      let z: { district: number; band: number } | null = null;
      if (ui.hover && ui.showDistrictRisk && !ui.basinView) {
        const at = risk.zoneAt(ui.hover.lng, ui.hover.lat);
        if (at.band > 0 && at.district >= 0) z = at;
      }
      const cur = useGeo.getState().hoverZone;
      const same = z?.district === cur?.district && z?.band === cur?.band;
      if (!same) useGeo.getState().set({ hoverZone: z });
      if (same && !force) return;
      risk.highlight(z ? z.district : -1, z ? z.band : 0);
      if (!force) pushTex(ui.showDistrictRisk);
    };

    const tick = () => {
      const risk = geoBig.risk, houses = geoBig.houses;
      if (!risk || !houses) return;
      const sim = useSim.getState();
      const ui = useUi.getState();
      const geo = useGeo.getState();
      const t = sim.playhead;
      const hasRun = sim.runParams != null && big.frames.length > 0;
      const now = performance.now();
      const forced = dirty.current;
      dirty.current = false;
      if (entry.length !== risk.districts.length) entry = new Float32Array(risk.districts.length).fill(-1);

      // houses: sink / stain / collapse at the playhead
      if (forced || ((t !== st.housesT || sim.framesVersion !== st.lastFV) && now - st.housesAt >= 240)) {
        st.housesAt = now;
        st.housesT = t;
        st.lastFV = sim.framesVersion;
        if (houses.update(t, big.frames) || forced) setHousesVersion((v) => v + 1);
      }
      const movedForward = t > st.lastT;
      st.lastT = t;

      // district entry times, refreshed as the envelopes grow (about once a second while computing)
      let entryChanged = false;
      if (forced || ((sim.framesVersion !== st.entryFV || sim.summaryVersion !== st.entrySV) && now - st.entryAt > 900)) {
        const before = entry.slice();
        risk.entryTimes(hasRun ? big.env : null, entry);
        st.entryFV = sim.framesVersion;
        st.entrySV = sim.summaryVersion;
        st.entryAt = now;
        for (let d = 0; d < entry.length; d++) if (entry[d] !== before[d]) entryChanged = true;
        if (entryChanged || forced) {
          geo.set({ districts: geo.districts.map((v) => ({ ...v, entryT: entry[v.idx] ?? -1 })) });
        }
      }

      // the district the front most recently entered at the playhead
      let active = -1, best = -1;
      for (let d = 0; d < entry.length; d++) {
        const e = entry[d];
        if (e >= 0 && e <= t && e >= best) { best = e; active = d; }
      }
      if (active < 0) active = risk.sourceDistrict;
      if (active !== geo.activeIdx) {
        const crossing = hasRun && movedForward && (sim.playing || sim.status === 'running') && entry[active] >= 0;
        geo.set({ activeIdx: active, announce: crossing ? { idx: active, t: entry[active], nonce: (geo.announce?.nonce ?? 0) + 1 } : geo.announce });
        const dg = risk.districts[active];
        if (crossing && !ui.follow && geo.focusIdx == null && dg?.domainBBox) {
          ui.requestCamera({ kind: 'fit-bbox', bbox: dg.domainBBox });
        }
      }

      // heatmap + district stats
      const focus = geo.focusIdx ?? active;
      const showRisk = ui.showDistrictRisk;
      const riskMap = ui.riskMap && !ui.basinView;
      const scn = big.scenario;
      const ens = riskMap && scn ? ensembleFor(ensembleBig.agg, ensembleBig.cfgId, scn.config.id, risk.cols, risk.rows) : null;
      const basis = riskMap ? resolveBasis(ui.riskBasis, hasRun && !!big.env, !!ens) : hasRun ? 'run' : 'terrain';
      const ensV = useEnsemble.getState().version;
      const envMoved = sim.framesVersion !== st.riskFV || sim.summaryVersion !== st.riskSV;
      if (forced || showRisk !== lastShowRisk || riskMap !== st.riskMap || ui.warning !== st.policy || basis !== st.basis || (basis === 'ensemble' && ensV !== st.ensV)) st.riskDirty = true;
      lastShowRisk = showRisk;
      // the risk map shows the whole event, so the playhead and focus do not move it
      const playheadMoved = !riskMap && (focus !== st.riskFocus || Math.abs(t - st.riskT) >= 15);
      const need = st.riskDirty || playheadMoved || (envMoved && now - st.riskAt > 700);
      if (!need || now - st.riskAt < 380) return;
      st.riskDirty = false;
      st.riskAt = now;
      st.riskT = t;
      st.riskFocus = focus;
      st.riskFV = sim.framesVersion;
      st.riskSV = sim.summaryVersion;
      st.riskMap = riskMap;
      st.policy = ui.warning;
      st.basis = basis;
      st.ensV = ensV;
      if (!riskMap && focus < 0) return;

      const tEval = riskMap ? Infinity : t;
      const useRun = basis === 'run' && big.env;
      const area = basis === 'ensemble' && ens
        ? risk.computeProb(ens.prob)
        : risk.compute(riskMap ? 'all' : focus, tEval, useRun ? big.env : null);
      const zi = geoBig.zoneIdx;
      const zones = zi
        ? aggregateZones(risk, zi, houses, useRun ? { env: big.env!, places: big.places, tEval } : null, ui.warning, basis === 'ensemble' ? ens : null)
        : null;
      syncHover(true);
      pushTex(showRisk);

      // per-district readout + whole-domain totals (one pass over places, one over houses)
      const s: DistrictStats = {
        idx: focus, places: 0, placesFlooded: 0, people: 0,
        houses: 0, housesFlooded: 0, housesUnderwater: 0, housesDestroyed: 0,
        worst: 0, next: null, firstHit: null, area, list: [],
      };
      const tot: GeoTotals = { settlementsAtRisk: 0, settlementsFlooded: 0, housesAtRisk: 0, housesFlooded: 0, housesDestroyed: 0, maxDepth: 0 };
      const pd = placeDistrict.current;
      const sc = big.scenario;
      if (sc) for (const p of sc.exposure.places) if (SETTLEMENT_KINDS.has(p.kind) && pd.get(p.id) === focus) s.places++;
      const clusterOf = houses.clusterByPlace;
      if (hasRun) {
        for (const pi of big.places) {
          if (!pi.flooded || pi.arrival < 0 || !SETTLEMENT_KINDS.has(pi.place.kind)) continue;
          const cl = clusterOf.get(pi.place.id);
          const nh = cl ? cl.count : 0;
          const reached = pi.arrival <= t;
          tot.settlementsAtRisk++;
          tot.housesAtRisk += nh;
          if (reached) {
            tot.settlementsFlooded++;
            if (pi.peakDepth > tot.maxDepth) tot.maxDepth = pi.peakDepth;
          }
          if (pd.get(pi.place.id) !== focus) continue;
          s.list.push({ id: pi.place.id, name: pi.place.name, kind: pi.place.kind, lng: pi.place.lng, lat: pi.place.lat, houses: nh, arrival: pi.arrival, depth: pi.peakDepth, flooded: reached });
          if (!reached) {
            if (!s.next || pi.arrival < s.next.eta) s.next = { name: pi.place.name, eta: pi.arrival };
            continue;
          }
          if (!s.firstHit || pi.arrival < s.firstHit.t) s.firstHit = { name: pi.place.name, t: pi.arrival };
          if (pi.hazard > s.worst) s.worst = pi.hazard as HazardClass;
          s.placesFlooded++;
          s.people += pi.place.population ?? 0;
        }
        s.list.sort((a, b) => Number(b.flooded) - Number(a.flooded) || (a.flooded ? b.arrival - a.arrival : a.arrival - b.arrival));
      }
      for (let i = 0; i < houses.n; i++) {
        const w = houses.wetAt[i];
        const inFocus = houses.district[i] === focus;
        if (inFocus) s.houses++;
        if (w < 0 || w > t) continue;
        tot.housesFlooded++;
        const c = houses.collapseAt[i];
        const dead = c >= 0 && c <= t;
        if (dead) tot.housesDestroyed++;
        if (!inFocus) continue;
        s.housesFlooded++;
        if (dead) s.housesDestroyed++;
        else if (houses.zOff[i] <= -0.3) s.housesUnderwater++;
      }
      geo.set({ stats: s, totals: hasRun ? tot : null, zones });
    };

    const iv = setInterval(tick, 150);
    const unUi = useUi.subscribe((a, b) => {
      if (a.showDistrictRisk !== b.showDistrictRisk || a.riskMap !== b.riskMap) tick();
      if (a.hover !== b.hover) syncHover(false);
    });
    const unEns = useEnsemble.subscribe((a, b) => { if (a.version !== b.version) dirty.current = true; });
    const unGeo = useGeo.subscribe((a, b) => { if (a.focusIdx !== b.focusIdx) dirty.current = true; });
    return () => { clearInterval(iv); unUi(); unGeo(); unEns(); };
  }, []);

  return { riskTex, housesVersion, geoVersion };
}
