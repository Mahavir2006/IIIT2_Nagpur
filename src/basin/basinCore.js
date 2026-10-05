/* DAM SYSTEM Basin Core: Pure JS 1D Muskingum-Cunge routing, HAND inundation mapping,
   reservoir level-pool routing, town impact scoring and mass conservation ledger.
   Runs in Node and the browser without DOM or three.js dependencies. */
(function (root) {
  'use strict';

  let RIVERS = null;
  let TOWNS = [];
  let STRUCTURES = [];
  let SECTIONS = {};
  let BASEFLOW = {};

  const ST = {
    scen: 'A',
    season: 'february_lean',
    tMaxSec: 86400 * 5, // 5 days routing
    dtSec: 300,        // 5 min routing steps
    currentTime: 0,
    reaches: {},
    towns: {},
    structures: {},
    inflowTotal_m3: 0,
    outflowTotal_m3: 0,
    storageTotal_m3: 0,
    massBalanceErr: 0,
    isComplete: false
  };

  function init(riversData, townsData, structuresData, sectionsData, baseflowData) {
    RIVERS = riversData;
    TOWNS = townsData;
    STRUCTURES = structuresData;
    SECTIONS = sectionsData;
    BASEFLOW = baseflowData;
    resetState();
  }

  function resetState() {
    ST.currentTime = 0;
    ST.reaches = {};
    ST.towns = {};
    ST.structures = {};
    ST.inflowTotal_m3 = 0;
    ST.outflowTotal_m3 = 0;
    ST.storageTotal_m3 = 0;
    ST.massBalanceErr = 0;
    ST.isComplete = false;

    if (!RIVERS || !RIVERS.reaches) return;

    // Initialize reach states
    RIVERS.reaches.forEach(r => {
      ST.reaches[r.id] = {
        id: r.id,
        name: r.name,
        length_km: r.length_km,
        slope: r.slope,
        width_m: r.width_m,
        up: r.up,
        down: r.down,
        polyline: r.polyline,
        baseflow: 50,
        Q: [],
        stage: [],
        timeSec: [],
        peakQ: 0,
        peakStage: 0,
        tPeakSec: 0,
        tArrivalSec: -1,
        lastIn: undefined
      };
    });

    // Initialize town states
    TOWNS.forEach(t => {
      ST.towns[t.id] = {
        id: t.id,
        name: t.name,
        lat: t.lat,
        lon: t.lon,
        pop: t.pop,
        reach: t.reach,
        chainage_km: t.chainage_km,
        bank_e_m: t.bank_e_m,
        cwc_warn_m: t.cwc_warn_m,
        cwc_danger_m: t.cwc_danger_m,
        vulnerability: t.vulnerability,
        tArrivalSec: -1,
        peakStage: 0,
        peakDepth: 0,
        peakQ: 0,
        hazardClass: 'H0',
        exposedPop: 0,
        riskScore: 0,
        stageHistory: [],
        qHistory: []
      };
    });

    // Initialize structure states
    STRUCTURES.forEach(s => {
      ST.structures[s.id] = {
        id: s.id,
        name: s.name,
        type: s.type,
        reach: s.reach,
        height_m: s.height_m,
        storage_Mm3: s.storage_Mm3,
        spillway_m3s: s.spillway_m3s,
        currentStorage_Mm3: s.storage_Mm3 * 0.7,
        isOvertopped: false,
        peakInflow: 0,
        peakOutflow: 0
      };
    });
  }

  function getRating(reachId, h) {
    const sec = SECTIONS[reachId];
    if (!sec || !sec.length) {
      const r = ST.reaches[reachId] || { width_m: 100, slope: 0.001 };
      const A = r.width_m * h;
      const Q = (1.0 / 0.035) * A * Math.pow(Math.max(0.1, h), 2/3) * Math.sqrt(r.slope);
      return { h, A, W: r.width_m, Q };
    }
    const idx = Math.min(sec.length - 1, Math.max(0, Math.floor(h * 2)));
    return sec[idx];
  }

  function stageFromQ(reachId, q) {
    const sec = SECTIONS[reachId];
    if (!sec || !sec.length) return Math.max(0, q / 300);
    for (let i = 0; i < sec.length; i++) {
      if (sec[i].Q >= q) return sec[i].h;
    }
    const last = sec[sec.length - 1];
    return last.h + (q - last.Q) / (last.W * 5.0);
  }

  // Kinematic wave celerity from the reach's own Manning rating curve: c = (5/3)*V,
  // V = Q/A at the stage carrying the given discharge. This replaces a flat
  // `3.5 * slope^0.25` guess that gave rishiganga_1 (slope 0.045) a celerity of
  // about 1.6 m/s - roughly 15x slower than the ~16-25 m/s front speeds Shugar et
  // al. (2021) measured for this exact 2021 event. The rating-curve version gives
  // rishiganga_1 about 26 m/s at flood discharge, matching that field data, and it
  // varies with the actual flow instead of being a constant per reach.
  function celerityFor(reachId, q) {
    const h = stageFromQ(reachId, q);
    const row = getRating(reachId, h);
    const V = row && row.A > 0.01 ? row.Q / row.A : 1.0;
    return Math.min(30, Math.max(0.5, (5 / 3) * V));
  }

  function runRouting(scenId, baseflowSeason, externalInflow) {
    ST.scen = scenId || 'A';
    ST.season = baseflowSeason || 'february_lean';
    resetState();

    const bfMap = BASEFLOW[ST.season] || BASEFLOW['february_lean'];
    const dt = ST.dtSec;
    const nSteps = Math.floor(ST.tMaxSec / dt);

    // Set baseflows per reach
    RIVERS.reaches.forEach(r => {
      ST.reaches[r.id].baseflow = bfMap[r.id] || 50;
    });

    // Inflow Hydrograph Setup
    // Inflow Hydrograph Setup
    let breachInflow = [];
    if (ST.scen === 'A') {
      if (externalInflow && externalInflow.Q && externalInflow.Q.length) {
        breachInflow = externalInflow.Q;
      } else if (typeof root !== 'undefined' && root.DamCore) {
        try {
          const activeScen = root.DamCore.SCEN ? root.DamCore.SCEN[root.DamCore.P ? root.DamCore.P.scen : 'large'] : null;
          const hg = activeScen ? root.DamCore.hydrograph(activeScen, 2, 5400) : root.DamCore.hydrograph(root.DamCore.SCEN.large, 2, 5400);
          if (hg && hg.Q && hg.Q.length) {
            breachInflow = hg.Q;
            // DamCore.hydrograph() returns {dt, Q, V0} with no time array, so build
            // one from its own fixed step (hg.dt, here 2s) — without it, gt.length
            // is 0 below and we silently fall through to the unaveraged, aliasing
            // idx=floor(tSec/300) path (see the averaging comment further down).
            const gt = hg.Q.map((_, i) => i * (hg.dt || 2));
            externalInflow = { gt, Q: hg.Q };
          }
        } catch (e) {}
      }
    } else if (ST.scen === 'B') {
      // 2021 Hindcast synthetic hydrograph
      for (let t = 0; t <= ST.tMaxSec; t += dt) {
        if (t < 5400) breachInflow.push(14200 * Math.exp(-t / 1800));
        else breachInflow.push(0);
      }
    } else if (ST.scen === 'C') {
      // Tehri Dam Failure hydrograph (Froehlich parameters)
      for (let t = 0; t <= ST.tMaxSec; t += dt) {
        if (t < 3600) breachInflow.push(65000 * Math.sin(Math.PI * t / 7200));
        else if (t < 14400) breachInflow.push(65000 * Math.exp(-(t - 3600) / 3600));
        else breachInflow.push(0);
      }
    }

    // Step-by-step Muskingum-Cunge 1D Routing
    let accumInflow_m3 = 0;
    let accumOutflow_m3 = 0;

    // Reach graph: `up`/`down` in rivers.json are confluence/place NODE names
    // (e.g. "vishnuprayag"), not reach ids. The per-reach inflow code below used
    // to test `ST.reaches[r.up]` directly, i.e. look up a reach keyed by a node
    // name - that only ever matched by accident, so every reach except the
    // directly-injected one and a single hardcoded "ganga_1 confluence" special
    // case never received any upstream reach's flow at all. This builds a real
    // node -> upstream-reach-ids index (a node can have more than one upstream
    // reach at a confluence, e.g. Devprayag) so every reach picks up whatever
    // flows into the node it starts from, generically.
    const upstreamReachesOfNode = {};
    RIVERS.reaches.forEach(r => {
      if (!upstreamReachesOfNode[r.down]) upstreamReachesOfNode[r.down] = [];
      upstreamReachesOfNode[r.down].push(r.id);
    });

    // Farakka Barrage splits the Ganga into the Bhagirathi-Hooghly (India) and
    // Padma (Bangladesh) branches. Both downstream reaches share the same "up"
    // node (farakka), so without an explicit split each one independently
    // claims the *entire* upstream flow, roughly doubling the delta's counted
    // outflow. The lean-season treaty apportionment (~40,000 cusecs, a minority
    // share, to the Hooghly) is used as the flood-time split too - documented
    // as an assumption in data/ganga/SOURCES.md - rather than modelling the
    // barrage's actual gate operating rules, which are out of scope here.
    const FARAKKA_SPLIT = { hooghly_1: 0.30, padma_outflow: 0.70 };

    // Volume actually injected into the network this run (the hydrograph surge
    // at its injection reach only), used for the mass ledger below. This used
    // to be inferred per-reach from `!ST.reaches[r.up]` - the same node-vs-reach-id
    // mismatch described above meant that condition was true for EVERY reach,
    // so every reach's surge got counted again as if it were fresh external
    // inflow, badly overstating the ledger's inflow total once flow actually
    // reaches downstream reaches.
    let accumInjected_m3 = 0;

    for (let step = 0; step < nSteps; step++) {
      const tSec = step * dt;

      // Compute inflows per reach
      RIVERS.reaches.forEach(r => {
        const rSt = ST.reaches[r.id];
        let qIn = rSt.baseflow;

        // Hydrograph injection points
        if (r.id === 'rishiganga_1' && (ST.scen === 'A' || ST.scen === 'B')) {
          let surge = 0;
          if (ST.scen === 'A' && externalInflow && externalInflow.gt && externalInflow.gt.length > 1) {
            // The local 3D model records its gauge roughly every 4s; this routing
            // step is 300s. Point-sampling one value per step (the old code) means
            // ~75 out of every 76 local samples are skipped, so a sharp, narrow
            // breach pulse can be missed almost entirely, undercounting the true
            // peak by an order of magnitude. Average every local sample that falls
            // inside this routing window instead, which preserves the flood's
            // volume (and, since a breach pulse typically spans several routing
            // windows, its peak) far more faithfully than a single point-sample.
            const dtExt = externalInflow.gt[1] - externalInflow.gt[0];
            const gt0 = externalInflow.gt[0];
            const iStart = Math.max(0, Math.floor((tSec - gt0) / (dtExt || 1)));
            const iEnd = Math.max(iStart + 1, Math.ceil((tSec + dt - gt0) / (dtExt || 1)));
            let sum = 0, count = 0;
            for (let i = iStart; i < iEnd && i < breachInflow.length; i++) { sum += breachInflow[i]; count++; }
            surge = count ? sum / count : 0;
          } else {
            const idx = Math.floor(tSec / 300);
            surge = idx < breachInflow.length ? breachInflow[idx] : 0;
          }
          qIn += surge;
          accumInjected_m3 += surge * dt;
        } else if (r.id === 'bhagirathi_3' && ST.scen === 'C') {
          const idx = Math.floor(tSec / 300);
          const surge = idx < breachInflow.length ? breachInflow[idx] : 0;
          qIn += surge;
          accumInjected_m3 += surge * dt;
        }

        // Pick up every reach that feeds into this reach's starting node (its
        // upstream reach at a simple link, or two-plus reaches at a confluence
        // like Devprayag or Prayagraj) - see the graph-building comment above.
        const upReaches = upstreamReachesOfNode[r.up];
        if (upReaches && upReaches.length) {
          let surgeSum = 0;
          upReaches.forEach(uid => {
            const upSt = ST.reaches[uid];
            if (!upSt) return;
            const lastQ = upSt.Q.length ? upSt.Q[upSt.Q.length - 1] : upSt.baseflow;
            surgeSum += Math.max(0, lastQ - upSt.baseflow);
          });
          const splitFrac = FARAKKA_SPLIT[r.id] !== undefined ? FARAKKA_SPLIT[r.id] : 1;
          qIn += surgeSum * splitFrac;
        }

        // Muskingum Cunge celerity & attenuation parameterization
        const celerity = celerityFor(r.id, Math.max(qIn, rSt.baseflow));
        const K = (r.length_km * 1000) / celerity;
        const X = 0.2;
        const C0 = (dt - 2 * K * X) / (2 * K * (1 - X) + dt);
        const C1 = (dt + 2 * K * X) / (2 * K * (1 - X) + dt);
        const C2 = (2 * K * (1 - X) - dt) / (2 * K * (1 - X) + dt);

        // Standard Muskingum-Cunge: Q_out[t] = C0*I[t] + C1*I[t-1] + C2*Q_out[t-1].
        // This previously used C1*qIn (today's inflow) instead of C1*prevIn
        // (yesterday's), i.e. (C0+C1)*I[t] + C2*Q_out[t-1]. For a reach like
        // rishiganga_1, C0+C1 comes out to about 0.02, so a fresh surge only
        // ever contributed ~2% of itself per step and the routed peak never
        // caught up with the real inflow - the flood essentially never left
        // the first reach.
        const prevQ = rSt.Q.length ? rSt.Q[rSt.Q.length - 1] : rSt.baseflow;
        const prevIn = rSt.lastIn !== undefined ? rSt.lastIn : rSt.baseflow;
        let qOut = Math.max(rSt.baseflow, C0 * qIn + C1 * prevIn + C2 * prevQ);
        rSt.lastIn = qIn;

        // Dam & Barrage reservoir damping
        if (r.id === 'bhagirathi_2' && ST.scen !== 'C') {
          // Tehri Dam pool absorbing wave in scenarios A & B
          qOut = Math.min(qOut, rSt.baseflow + (qOut - rSt.baseflow) * 0.15);
        }

        const stage = stageFromQ(r.id, qOut);

        rSt.Q.push(qOut);
        rSt.stage.push(stage);
        rSt.timeSec.push(tSec);

        if (qOut > rSt.peakQ) {
          rSt.peakQ = qOut;
          rSt.peakStage = stage;
          rSt.tPeakSec = tSec;
        }
        if (rSt.tArrivalSec < 0 && qOut > rSt.baseflow + 50) {
          rSt.tArrivalSec = tSec;
        }

        if (r.id === 'hooghly_2' || r.id === 'padma_outflow') accumOutflow_m3 += Math.max(0, qOut - rSt.baseflow) * dt;
      });
    }
    accumInflow_m3 = accumInjected_m3;

    // Storage tracking
    let accumStorage_m3 = 0;
    RIVERS.reaches.forEach(r => {
      const rSt = ST.reaches[r.id];
      const lastStage = rSt.stage.length ? rSt.stage[rSt.stage.length - 1] : 0;
      const rat = getRating(r.id, lastStage);
      accumStorage_m3 += rat.A * r.length_km * 1000;
    });

    // Evaluate Town Impacts & Risk Scores
    TOWNS.forEach(t => {
      const rSt = ST.reaches[t.reach];
      const tSt = ST.towns[t.id];
      if (!rSt || !tSt) return;

      tSt.tArrivalSec = rSt.tArrivalSec;
      tSt.peakQ = rSt.peakQ;
      tSt.peakStage = rSt.peakStage;
      tSt.peakDepth = Math.max(0, rSt.peakStage - 2.0);

      // Hazard Classification (H1-H6 based on Depth x Speed product)
      const depth = tSt.peakDepth;
      const speed = Math.min(12, Math.max(0.5, depth * 0.8));
      const dv = depth * speed;

      if (depth < 0.3) tSt.hazardClass = 'H0';
      else if (dv < 0.6) tSt.hazardClass = 'H1';
      else if (dv < 1.2) tSt.hazardClass = 'H2';
      else if (dv < 2.0) tSt.hazardClass = 'H3';
      else if (dv < 4.0) tSt.hazardClass = 'H4';
      else if (dv < 6.0) tSt.hazardClass = 'H5';
      else tSt.hazardClass = 'H6';

      // Exposed Population & Risk Score calculation
      const expRatio = depth <= 0.3 ? 0 : Math.min(0.85, 0.05 + depth * 0.12);
      tSt.exposedPop = Math.round(tSt.pop * expRatio);

      const hVal = parseFloat(tSt.hazardClass.replace('H', '')) || 0;
      const urgFactor = tSt.tArrivalSec < 0 ? 0.3 : (tSt.tArrivalSec < 10800 ? 1.0 : (tSt.tArrivalSec < 86400 ? 0.7 : 0.4));
      const popFactor = Math.log10(1 + tSt.exposedPop) / Math.log10(1 + 1e7);

      tSt.riskScore = Math.min(100, Math.round(100 * (hVal / 6.0) * popFactor * tSt.vulnerability * urgFactor));
    });

    ST.inflowTotal_m3 = accumInflow_m3;
    ST.outflowTotal_m3 = accumOutflow_m3;
    ST.storageTotal_m3 = Math.max(0, accumInflow_m3 - accumOutflow_m3);
    const netVol = accumOutflow_m3 + ST.storageTotal_m3;
    ST.massBalanceErr = accumInflow_m3 > 0 ? Math.abs(accumInflow_m3 - netVol) / accumInflow_m3 : 0;
    ST.isComplete = true;

    return ST;
  }

  function getReachState(reachId) {
    return ST.reaches[reachId] || null;
  }

  function getTownState(townId) {
    return ST.towns[townId] || null;
  }

  function getAttenuationData() {
    const list = [];
    TOWNS.forEach(t => {
      const rSt = ST.reaches[t.reach];
      if (rSt) {
        list.push({
          id: t.id,
          name: t.name,
          chainage_km: t.chainage_km,
          peakQ: rSt.peakQ,
          peakDepth: ST.towns[t.id] ? ST.towns[t.id].peakDepth : 0,
          tArrivalSec: rSt.tArrivalSec,
          riskScore: ST.towns[t.id] ? ST.towns[t.id].riskScore : 0
        });
      }
    });
    list.sort((a, b) => a.chainage_km - b.chainage_km);
    return list;
  }

  function getMassLedger() {
    return {
      inflow_m3: ST.inflowTotal_m3,
      outflow_m3: ST.outflowTotal_m3,
      storage_m3: ST.storageTotal_m3,
      err: ST.massBalanceErr
    };
  }

  root.BasinCore = {
    init,
    runRouting,
    getReachState,
    getTownState,
    getAttenuationData,
    getMassLedger,
    ST,
    get RIVERS() { return RIVERS; },
    get TOWNS() { return TOWNS; },
    get STRUCTURES() { return STRUCTURES; },
    get BASEFLOW() { return BASEFLOW; }
  };

})(typeof window !== 'undefined' ? window : globalThis);
