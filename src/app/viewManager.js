/* DAM SYSTEM View Manager: Orchestrates the four peer views of the prototype —
   local 3D valley, local 2D plan map, basin 3D, basin 2D — plus the continuous
   zoom out/in camera transition, the shared simulation clock, live hydrograph
   coupling, and breadcrumb updates.

   The two dimensions are orthogonal and kept in separate variables on purpose:
   `currentView` is which domain is mounted (local vs basin) and `currentDim` is
   how that domain is drawn (three.js scene vs flat 2D canvas). Any combination
   is reachable, and either top bar button changes one of them without
   disturbing the other, so the 2D map of a domain is always the same simulation
   as its 3D scene rather than a separate model. */
(function (root) {
  'use strict';

  let currentView = 'local'; // 'local' or 'basin'
  let currentDim = '3d';     // '3d' or '2d'
  let isTransitioning = false;
  let localStageEl, basinStageEl, local2dStageEl, basin2dStageEl;
  let sharedClockTimeSec = 0;
  let syncTimer = null;
  let flightToken = 0; // bumped on every switchView() call to cancel a stale in-flight animation

  const reduceMotion = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mkStage(id, cls) {
    const el = document.createElement('div');
    el.id = id; el.className = cls;
    el.style.cssText = 'position:fixed;inset:0;opacity:0;pointer-events:none;z-index:2;transition:opacity 0.8s ease;';
    document.body.appendChild(el);
    return el;
  }

  // Show exactly one stage, fade the other three out. Every stage is a full
  // viewport layer, so the crossfade is a plain opacity swap on each of them.
  function mountStages(durMs) {
    const want = {
      local: currentView === 'local' && currentDim === '3d' ? localStageEl : null,
      basin: currentView === 'basin' && currentDim === '3d' ? basinStageEl : null,
      local2d: currentView === 'local' && currentDim === '2d' ? local2dStageEl : null,
      basin2d: currentView === 'basin' && currentDim === '2d' ? basin2dStageEl : null
    };
    for (const el of [localStageEl, basinStageEl, local2dStageEl, basin2dStageEl]) {
      if (!el) continue;
      const on = el === want.local || el === want.basin || el === want.local2d || el === want.basin2d;
      el.style.transition = 'opacity ' + durMs + 'ms ease';
      el.style.opacity = on ? '1' : '0';
      el.style.pointerEvents = on ? 'auto' : 'none';
    }
    // The 3D basin scene drives its own rAF loop, so it has to be told when to
    // stop drawing. The two maps are drawn from the local view's frame loop and
    // only need an active flag.
    if (root.BasinView && root.BasinView.setVisible) root.BasinView.setVisible(!!want.basin);
    if (root.Map2DView) root.Map2DView.setActive(!!want.local2d);
    if (root.Basin2DView) root.Basin2DView.setActive(!!want.basin2d);
  }

  // The local chrome (top bar, story, intel, chapter rail) belongs to the local
  // domain, so the basin view hides it. The 3D-only pieces (projected labels,
  // the orbit hint) additionally hide for the local 2D map, which draws its own
  // on-canvas annotations and has its own drag/zoom gesture instead.
  function mountLocalChrome() {
    const isBasin = currentView === 'basin';
    const is2D = currentDim === '2d';
    const top = $('.top'), story = $('.story'), intel = $('#intel'), rail = $('#rail');
    if (top) top.style.display = isBasin ? 'none' : 'flex';
    if (story) story.style.display = isBasin ? 'none' : 'flex';
    if (intel) intel.style.display = isBasin ? 'none' : 'block';
    if (rail) rail.style.display = isBasin ? 'none' : 'flex';
    const labels = $('#labels'), hint = $('#hint');
    if (labels) labels.style.display = (isBasin || is2D) ? 'none' : 'block';
    if (hint) {
      hint.style.display = (isBasin || is2D) ? 'none' : 'flex';
      if (!isBasin && !is2D) {
        const i = $('.hint');
        if (i && i.textContent.indexOf('Drag to orbit') < 0) i.textContent = 'Drag to orbit, scroll to zoom, right drag to pan. Space runs or pauses.';
      }
    }
  }

  const ViewManager = {
    init: function () {
      localStageEl = $('#stage');
      basinStageEl = mkStage('basinStage', 'basin-stage');
      local2dStageEl = mkStage('map2dStage', 'map2d-stage');
      basin2dStageEl = mkStage('basin2dStage', 'basin2d-stage');

      // Initialize Basin Components
      if (root.BasinData) root.BasinData.load();
      if (root.BasinView) root.BasinView.init(basinStageEl);
      if (root.BasinUI) root.BasinUI.init(document.body);
      if (root.BasinCore && root.BasinData.isLoaded) {
        root.BasinCore.init(
          root.BasinData.rivers,
          root.BasinData.towns,
          root.BasinData.structures,
          root.BasinData.sections,
          root.BasinData.baseflow
        );
      }

      // 2D map views. They read DamCore / BasinData directly and need no three.js.
      if (root.Map2DView) root.Map2DView.init(local2dStageEl);
      if (root.Basin2DView) root.Basin2DView.init(basin2dStageEl);

      this.addTopBarButtons();
      this.bindOrbitZoomTrigger();
      this.startClockSync();
    },

    addTopBarButtons: function () {
      const clockBox = $('.clock');
      if (!clockBox) return;
      if (!$('#btnWholeGanga')) {
        const btn = document.createElement('button');
        btn.id = 'btnWholeGanga';
        btn.className = 'btn';
        btn.style.cssText = 'margin-left:8px;font-weight:700;background:var(--panel-2);';
        btn.addEventListener('click', () => this.switchView(currentView === 'local' ? 'basin' : 'local'));
        clockBox.appendChild(btn);
      }
      if (!$('#btn2D')) {
        const b2 = document.createElement('button');
        b2.id = 'btn2D';
        b2.className = 'btn';
        b2.style.cssText = 'font-weight:700;';
        b2.addEventListener('click', () => this.toggleDim());
        clockBox.appendChild(b2);
      }
      this.syncButtons();
    },

    // One button per dimension, so the user always knows which representation of
    // the current domain they are looking at and what the next click will do.
    syncButtons: function () {
      const g = $('#btnWholeGanga'), b = $('#btn2D');
      const isBasin = currentView === 'basin';
      if (g) { g.textContent = isBasin ? 'Focus Valley' : 'Whole Ganga Map'; g.setAttribute('aria-pressed', isBasin ? 'true' : 'false'); }
      if (b) {
        b.textContent = currentDim === '3d' ? '2D Map' : '3D View';
        b.setAttribute('aria-pressed', currentDim === '2d' ? 'true' : 'false');
        b.setAttribute('aria-label', currentDim === '3d' ? 'Show this domain as a flat 2D map' : 'Show this domain in 3D');
        b.title = currentDim === '3d'
          ? 'Same simulation, drawn flat: terrain, flood depth, settlements'
          : 'Back to the three.js valley scene';
      }
    },

    toggleDim: function () {
      this.switchDim(currentDim === '3d' ? '2d' : '3d');
    },

    bindOrbitZoomTrigger: function () {
      // Check local camera orbit distance continuously
      setInterval(() => {
        if (currentView !== 'local' || currentDim !== '3d' || isTransitioning) return;
        if (root.DamCore && root.DamCore.controls) {
          const dist = root.DamCore.controls.getDistance();
          if (dist > 115) {
            this.switchView('basin');
          }
        }
      }, 500);
    },

    startClockSync: function () {
      syncTimer = setInterval(() => {
        if (root.DamCore && root.DamCore.ST) {
          sharedClockTimeSec = root.DamCore.ST.t;
          // Coupled Hydrograph Handoff to Basin Model
          if (root.DamCore.getOutletHydrograph && root.BasinCore) {
            const outHg = root.DamCore.getOutletHydrograph();
            if (outHg && outHg.Q && outHg.Q.length) {
              root.BasinCore.runRouting(root.BasinCore.ST.scen, root.BasinCore.ST.season, outHg);
              if (root.BasinUI) root.BasinUI.updateUI();
              if (root.BasinView) root.BasinView.updateData();
            }
          }
        }
      }, 1000);
    },

    // Domain switch (local <-> basin). Keeps the current dimension, so going to
    // the basin from the 2D plan map lands on the basin's 2D map.
    //
    // currentView is set immediately, before the crossfade timeout, because
    // mountStages() and the app.js frame loop both read it to decide which
    // renderer owns the frame. The camera fly-out below deliberately does NOT
    // read it: it keys off `myFlight`, so a later switchView() supersedes an
    // in-flight animation without the stale value cancelling its own first
    // frame.
    switchView: function (targetView, durMs) {
      if (isTransitioning || targetView === currentView) return;
      isTransitioning = true;
      durMs = reduceMotion ? 300 : (durMs || 1200);
      currentView = targetView;

      const isToBasin = targetView === 'basin';
      const myFlight = ++flightToken; // any earlier fly() loop still running sees a stale token and stops

      if (isToBasin) {
        const basinOverlay = $('#basinOverlay');

        // Camera Flyout setup: start at the real Rishiganga location (from BasinView's
        // own georeferenced anchor, not a guessed coordinate) and ease back to the
        // whole-basin framing. The loop keys off `myFlight`, not `currentView`, because
        // `currentView` itself only flips to 'basin' after this same `durMs` timeout —
        // gating on it made the very first animation frame cancel itself immediately.
        // Only the 3D basin scene has a camera to fly; the 2D map has its own
        // eased pan, driven from render() once the transition has settled.
        if (currentDim === '3d' && root.BasinView && root.BasinView.camera) {
          const anchor = root.BasinView.getLocalDomainAnchor
            ? root.BasinView.getLocalDomainAnchor()
            : { x: 0, y: 40, z: 0 };
          const startPos = { x: anchor.x, y: anchor.y + 35, z: anchor.z + 40 };
          const startTarget = { x: anchor.x, y: anchor.y, z: anchor.z };
          const endPos = { x: 0, y: 320, z: 240 };
          const endTarget = { x: 0, y: 0, z: -20 };

          root.BasinView.camera.position.set(startPos.x, startPos.y, startPos.z);
          root.BasinView.controls.target.set(startTarget.x, startTarget.y, startTarget.z);
          root.BasinView.controls.update();

          const startTime = performance.now();
          const flyDuration = 2200;
          function fly() {
            if (myFlight !== flightToken) return; // superseded by a later switchView() call
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / flyDuration);
            const ease = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress;
            root.BasinView.camera.position.x = startPos.x + (endPos.x - startPos.x) * ease;
            root.BasinView.camera.position.y = startPos.y + (endPos.y - startPos.y) * ease;
            root.BasinView.camera.position.z = startPos.z + (endPos.z - startPos.z) * ease;
            root.BasinView.controls.target.x = startTarget.x + (endTarget.x - startTarget.x) * ease;
            root.BasinView.controls.target.y = startTarget.y + (endTarget.y - startTarget.y) * ease;
            root.BasinView.controls.target.z = startTarget.z + (endTarget.z - startTarget.z) * ease;
            root.BasinView.controls.update();
            if (progress < 1) requestAnimationFrame(fly);
          }
          requestAnimationFrame(fly);
        }

        if (basinOverlay) basinOverlay.style.display = 'block';
      } else {
        const basinOverlay = $('#basinOverlay');
        if (basinOverlay) basinOverlay.style.display = 'none';
      }

      this.syncButtons();
      mountStages(durMs);
      mountLocalChrome();

      setTimeout(() => { isTransitioning = false; }, durMs);
    },

    // Dimension switch (3D scene <-> 2D map) within the current domain.
    //
    // Unlike switchView, currentDim is set immediately rather than after the
    // crossfade timeout: both new scenes have to start drawing during the fade
    // for the crossfade to show anything, and both the app.js frame loop and
    // mountStages() read currentDim to decide which renderer owns the frame.
    switchDim: function (targetDim, durMs) {
      if (isTransitioning || targetDim === currentDim) return;
      isTransitioning = true;
      durMs = reduceMotion ? 300 : (durMs || 1200);
      currentDim = targetDim;

      if (currentDim === '2d') {
        if (currentView === 'local' && root.Map2DView) {
          // the plan map opens on the valley, not the whole domain, because the
          // breach and the settlements are the readable subject at this scale
          root.Map2DView.preset('overview');
        } else if (currentView === 'basin' && root.Basin2DView) {
          root.Basin2DView.fit();
        }
      }

      this.syncButtons();
      mountStages(durMs);
      mountLocalChrome();

      setTimeout(() => { isTransitioning = false; }, durMs);
    },

    get currentView() { return currentView; },
    get currentDim() { return currentDim; },
    // exposed so a transition can never silently wedge the view: while this is
    // true every switchView()/switchDim() call is a no-op by design
    get isTransitioning() { return isTransitioning; }
  };

  const $ = (s, r) => (r || document).querySelector(s);
  root.ViewManager = ViewManager;

})(typeof window !== 'undefined' ? window : globalThis);
