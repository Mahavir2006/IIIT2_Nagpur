/* DAM SYSTEM 2D Map View (local Rishiganga domain): a genuine top-down plan
   view drawn on a 2D canvas, as a peer rendering of the same simulation the
   three.js scene shows.

   It reads DamCore's state directly (terrain, breach geometry, lake level, the
   2D shallow water depth/velocity fields, the SPH particle array, assets and
   roads) and shares app.js's map-layer selection and peak-envelope toggle, so
   the two views always agree. No physics, no three.js, no network.

   Performance: the terrain hillshade is baked once into an offscreen raster at
   grid resolution (480x240) and only rebuilt when the breach geometry actually
   changes; the water/hazard raster is one putImageData per frame over the
   active cell list. The whole map is then drawn with two scaled drawImage
   calls, so pan and zoom cost nothing extra. */
(function (root) {
  'use strict';

  const C = root.DamCore;
  const $ = (s, r) => (r || document).querySelector(s);
  const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmt = (v, d) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });
  const DA = () => root.DamApp; // app.js publishes the shared UI state

  /* Colour ramps mirror the ramp5() calls in the 3D water shader so the two
     views read as one product rather than two different palettes. */
  const RAMP_DEPTH = [[0.80, 0.93, 0.97], [0.45, 0.76, 0.90], [0.18, 0.50, 0.78], [0.16, 0.27, 0.60], [0.30, 0.10, 0.45]];
  const RAMP_SPEED = [[1.00, 0.95, 0.70], [0.98, 0.78, 0.40], [0.93, 0.49, 0.25], [0.80, 0.20, 0.20], [0.45, 0.05, 0.18]];
  const RAMP_ARR = [[0.85, 0.15, 0.15], [0.95, 0.55, 0.15], [0.95, 0.85, 0.30], [0.45, 0.75, 0.45], [0.25, 0.50, 0.80]];
  const RAMP_HAZ = [[0.45, 0.75, 0.45], [0.95, 0.85, 0.30], [0.95, 0.55, 0.15], [0.85, 0.20, 0.15], [0.50, 0.05, 0.15]];
  const LAKE_COL = [0.24, 0.44, 0.56];

  // terrain paint: elevation stops, low valley floor to snowline
  const LAND = [
    [0.00, [0.40, 0.39, 0.33]], [0.06, [0.31, 0.34, 0.25]], [0.22, [0.21, 0.29, 0.20]],
    [0.38, [0.30, 0.34, 0.23]], [0.55, [0.40, 0.39, 0.32]], [0.70, [0.40, 0.37, 0.33]],
    [0.80, [0.31, 0.29, 0.27]], [0.88, [0.58, 0.61, 0.65]], [1.00, [0.92, 0.95, 0.97]],
  ];
  const DEBRIS = [0.24, 0.19, 0.15], NOTCH = [0.72, 0.21, 0.15];

  function ramp(stops, t) {
    t = clamp(t, 0, 1);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i], u = (t - a[0]) / (b[0] - a[0] || 1);
        return [a[1][0] + (b[1][0] - a[1][0]) * u, a[1][1] + (b[1][1] - a[1][1]) * u, a[1][2] + (b[1][2] - a[1][2]) * u];
      }
    }
    return stops[stops.length - 1][1];
  }
  function ramp5(t, r) {
    t = clamp(t, 0, 1) * 4;
    const i = Math.min(3, t | 0), u = t - i;
    return [r[i][0] + (r[i + 1][0] - r[i][0]) * u, r[i][1] + (r[i + 1][1] - r[i][1]) * u, r[i][2] + (r[i + 1][2] - r[i][2]) * u];
  }

  /* Inner edge of a side panel, or the viewport edge when the panel is not on
     screen. Visibility has to be read from computed style, not `offsetParent`:
     these panels are `position: fixed`, and offsetParent is null for every
     fixed element whether or not it is shown. Getting that wrong silently
     returned the full viewport width and drew the map underneath the panels. */
  function panelShown(sel) {
    const el = $(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    return el.getBoundingClientRect().width > 0;
  }
  function panelRight(sel) { return panelShown(sel) ? $(sel).getBoundingClientRect().right + 16 : 16; }
  function panelLeft(sel) { const W = window.innerWidth; return panelShown(sel) ? $(sel).getBoundingClientRect().left - 16 : W - 16; }

  const Map2DView = {
    el: null, canvas: null, g: null, active: false, inited: false,

    /* ---- lifecycle ---- */
    init: function (containerEl) {
      if (this.inited) return;
      this.el = containerEl;
      const cv = document.createElement('canvas');
      cv.className = 'm2d-canvas';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', 'Two dimensional plan map of the Rishiganga valley: terrain, flood depth, settlements and the debris dam');
      this.el.appendChild(cv);
      this.canvas = cv;
      this.g = cv.getContext('2d');

      this.buildChrome();
      this.base = document.createElement('canvas');
      this.base.width = C.NX; this.base.height = C.NZ;
      this.baseG = this.base.getContext('2d');
      this.baseImg = this.baseG.createImageData(C.NX, C.NZ);
      this.shade = new Float32Array(C.N); // per cell hillshade gain, reused by paintDam
      this.eMin = 0; this.eSpan = 1;
      this.basePr = 0;
      this.rebuildBase();

      this.flood = document.createElement('canvas');
      this.flood.width = C.NX; this.flood.height = C.NZ;
      this.floodG = this.flood.getContext('2d');
      this.floodImg = this.floodG.createImageData(C.NX, C.NZ);
      this.floodData = this.floodImg.data;
      this.floodData.fill(0);

      this.wMap = new Int32Array(C.N).fill(-1);
      C.actList.forEach((k, q) => { this.wMap[k] = q; });

      this.v = { x: C.LX * 0.5, z: C.LZ * 0.5 };
      this.zoom = 1; // 1 = whole domain across the clear band; scale() derives px/m from it
      this.W = this.el.clientWidth; this.H = this.el.clientHeight; // safe() needs these
      this.bind();
      this.inited = true;
      // No refit on resize: the zoom multiple and centre are both in world units,
      // so the map re-frames correctly against whatever the clear band becomes.
      window.addEventListener('resize', () => this.resize());
    },

    setActive: function (on) {
      this.active = !!on;
      if (on) { this.resize(); this.render(); }
    },

    resize: function () {
      if (!this.canvas) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = this.el.clientWidth, h = this.el.clientHeight;
      if (!w || !h) return;
      if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
        this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      }
      this.dpr = dpr; this.W = w; this.H = h;
    },

    /* ---- terrain base raster (hillshade + landcover) ----
       Split in two on purpose. The hillshade and landcover are a function of
       b0, the original terrain, which never changes: that pass is O(N) with a
       square root and a ramp per cell, so it runs once per scenario, not per
       frame. Only the debris dam and its breach notch actually move, and they
       live in C.NEARDAM, so those cells are recoloured on their own. Doing the
       whole N-cell shading pass every frame instead cost ~56 ms per frame
       during playback, which was most of the map's frame budget. */
    rebuildBase: function () {
      const N = C.N, NX = C.NX, DX = C.DX, b0 = C.b0, dC = C.dC;
      const px = this.baseImg.data;
      let eMin = Infinity, eMax = -Infinity;
      for (let k = 0; k < N; k++) { const e = b0[k]; if (e < eMin) eMin = e; if (e > eMax) eMax = e; }
      const span = Math.max(1, eMax - eMin);
      this.eMin = eMin; this.eSpan = span;
      // sun from the north west, low enough to rake the ridges
      const Lx = -0.55, Ly = 0.72, Lz = -0.42;
      for (let k = 0; k < N; k++) {
        const i = k % NX, j = (k / NX) | 0;
        const e = b0[k];
        const xm = i > 0 ? k - 1 : k, xp = i < NX - 1 ? k + 1 : k;
        const zm = j > 0 ? k - NX : k, zp = j < C.NZ - 1 ? k + NX : k;
        const gx = (b0[xp] - b0[xm]) / (2 * DX), gz = (b0[zp] - b0[zm]) / (2 * DX);
        const nl = Math.sqrt(gx * gx + 1 + gz * gz);
        const shade = clamp(((-gx * Lx - gz * Lz + Ly) / nl), 0, 1) * 0.85 + 0.30;
        this.shade[k] = 1 + (shade - 0.75) * 0.62;
        // write the cell now: this is the only pass that paints the 99% of the
        // domain that is not the dam, so it cannot be deferred to paintDam()
        this.writeCell(k, ramp(LAND, (e - eMin) / span), dC[k] < 70);
      }
      this.basePr = C.ST.breach ? C.ST.breach.pr : 0;
      this.paintDam();
    },

    // Recolour just the debris dam and the breach notch, using the shading
    // already computed in rebuildBase(). NEARDAM is a few thousand cells, so
    // this is cheap enough to follow the breach carving every frame.
    paintDam: function () {
      const L = C.NEARDAM;
      if (!L) return;
      for (let m = 0; m < L.length; m++) {
        const k = L[m], e = C.b[k], b0v = C.b0[k];
        const raised = e - b0v, cut = b0v - e;
        let c;
        if (cut > 0.8) { const t = clamp(cut / 18, 0, 1); c = [NOTCH[0] + (0.36 - NOTCH[0]) * t, NOTCH[1] + (0.34 - NOTCH[1]) * t, NOTCH[2] + (0.30 - NOTCH[2]) * t]; }
        else if (raised > 0.5) { const t = clamp(raised / 45, 0, 1); c = [DEBRIS[0] + (0.42 - DEBRIS[0]) * t, DEBRIS[1] + (0.39 - DEBRIS[1]) * t, DEBRIS[2] + (0.34 - DEBRIS[2]) * t]; }
        else c = ramp(LAND, (b0v - this.eMin) / this.eSpan);
        this.writeCell(k, c, C.dC[k] < 70);
      }
      this.baseG.putImageData(this.baseImg, 0, 0);
    },
    writeCell: function (k, c, wet) {
      const px = this.baseImg.data, s = this.shade[k];
      if (wet) c = [c[0] * 0.72 + 0.10, c[1] * 0.72 + 0.11, c[2] * 0.70 + 0.11];
      px[k * 4] = clamp(c[0] * s * 255, 0, 255);
      px[k * 4 + 1] = clamp(c[1] * s * 255, 0, 255);
      px[k * 4 + 2] = clamp(c[2] * s * 255, 0, 255);
      px[k * 4 + 3] = 255;
    },

    /* ---- per frame water / flood raster ---- */
    rebuildFlood: function () {
      const A = DA() ? DA().app : { view: 0, env: false };
      const env = A.env || A.view === 3, mode = A.view | 0, S = C.ST;
      const px = this.floodData;
      px.fill(0);

      // blockage lake, still there before anything moves
      if (C.P.mode !== 'hindcast') {
        const lv = DA() ? DA().lakeLevel() : C.ST.zL;
        const L = C.LAKECELLS;
        if (L) for (let m = 0; m < L.length; m++) {
          const k = L[m], bed = C.bDam[k];
          if (bed >= lv) continue;
          const deep = clamp((lv - bed) / 45, 0, 1);
          const o = k * 4;
          px[o] = (LAKE_COL[0] + (0.14 - LAKE_COL[0]) * deep) * 255;
          px[o + 1] = (LAKE_COL[1] + (0.32 - LAKE_COL[1]) * deep) * 255;
          px[o + 2] = (LAKE_COL[2] + (0.42 - LAKE_COL[2]) * deep) * 255;
          px[o + 3] = 150 + 70 * deep;
        }
      }

      // the 2D solver's own field
      const act = C.actList;
      for (let q = 0; q < act.length; q++) {
        const k = act[q];
        const dep = env ? C.maxd[k] : C.d[k];
        if (dep < 0.03) continue;
        const sp = env ? C.maxv[k] : Math.hypot(C.u[k], C.w[k]);
        let c;
        if (mode === 0) {
          const t = clamp((dep - 0.3) / 5.7, 0, 1);
          c = [0.60 + (0.33 - 0.60) * t, 0.53 + (0.28 - 0.53) * t, 0.43 + (0.22 - 0.43) * t];
          const foam = clamp((sp - 4) / 9, 0, 1) * 0.75 + (1 - clamp(dep / 5, 0, 1)) * 0.20;
          if (foam > 0) { c = [c[0] + (0.94 - c[0]) * foam, c[1] + (0.92 - c[1]) * foam, c[2] + (0.89 - c[2]) * foam]; }
        } else if (mode === 1) c = ramp5(dep / 12, RAMP_DEPTH);
        else if (mode === 2) c = ramp5(sp / 20, RAMP_SPEED);
        else if (mode === 3) {
          const m = C.arr[k]; if (m < 0) continue;
          c = ramp5((m / 60) / 60, RAMP_ARR);
          const band = Math.abs(((m / 60) % 5) - 2.5);      // 5 minute arrival contours
          const k2 = 0.55 + 0.45 * clamp(band / 0.4, 0, 1);
          c = [c[0] * k2, c[1] * k2, c[2] * k2];
        } else c = ramp5(((env ? C.hzd[k] : dep * sp) - 0.5) / 20, RAMP_HAZ);

        const o = k * 4;
        px[o] = clamp(c[0], 0, 1) * 255;
        px[o + 1] = clamp(c[1], 0, 1) * 255;
        px[o + 2] = clamp(c[2], 0, 1) * 255;
        px[o + 3] = 236 * clamp((dep - 0.03) / 0.22, 0, 1);
      }
      this.floodG.putImageData(this.floodImg, 0, 0);
    },

    /* ---- view transform ----
       Screen position is purely "where is this world point relative to the view
       centre". The domain extent must NOT appear in it: subtracting a
       (viewport - domainSize)/2 term puts the view centre on the top-left
       quadrant instead of the middle, which drew the whole 26 km domain into a
       quarter-width, off-centre rectangle. */
    // The clear rectangle between the story panel (left) and intel panel (right),
    // in CSS px, recomputed on every resize because those panels are responsive.
    // Everything that frames the map (fit, focus, zoom, scale bar) goes through
    // this, so the readable part of the valley is never under a panel.
    safe: function () {
      const W = this.W || (this.el ? this.el.clientWidth : 0), H = this.H || (this.el ? this.el.clientHeight : 0);
      if (W >= 901) {
        const l = panelRight('.story'), r = panelLeft('#intel');
        return { x: l, y: 76, w: Math.max(120, r - l), h: Math.max(120, H - 76 - 88) };
      }
      return { x: 8, y: 64, w: Math.max(120, W - 16), h: Math.max(120, H - 64 - 150) };
    },
    /* The stored state is a zoom MULTIPLE of fit, not an absolute px-per-metre
       scale. fit depends on the clear band between the panels, which is not
       known until the UI has laid out and changes on every resize; caching an
       absolute scale meant the map kept the scale it was built with and came out
       two-and-a-half times too large once the panels appeared. Deriving the
       scale from a live fit() every frame makes that impossible. */
    fitScale: function () { const a = this.safe(); return Math.min(a.w / C.LX, a.h / C.LZ); },
    // screen scale for the current zoom multiple
    scale: function () { return this.fitScale() * this.zoom; },
    // Ground width, in metres, that the clear band spans at zoom 1. This is NOT
    // the domain's 26 km: the fit is whichever of width or height binds, so it
    // has to be measured. Dividing a requested span by the domain width instead
    // made every "frame 9 km" preset compute a zoom below 1, i.e. zoom OUT, which
    // is why jumping to the breach showed a wider view than the overview did.
    metresAtFit: function () { return this.safe().w / this.fitScale(); },
    clampZoom: function (z) { return clamp(z, this.MIN_ZOOM, this.MAX_ZOOM); },
    fit: function () { this.zoom = 1; this.v.x = C.LX * 0.5; this.v.z = C.LZ * 0.5; },
    // centre of the clear band
    cx: function () { const a = this.safe(); return a.x + a.w / 2; },
    cy: function () { const a = this.safe(); return a.y + a.h / 2; },
    sx: function (x) { return this.cx() + (x - this.v.x) * this.scale(); },
    sy: function (z) { return this.cy() + (z - this.v.z) * this.scale(); },
    wx: function (p) { return this.v.x + (p - this.cx()) / this.scale(); },
    wz: function (p) { return this.v.z + (p - this.cy()) / this.scale(); },
    // ground width currently across the clear band, in metres
    metresAcross: function () { return this.safe().w / this.scale(); },

    /* Zoom limits, as multiples of "whole domain across the clear band". The
       ceiling is the important one: the terrain and flood rasters are the
       solver's 480x240 grid, one cell per 54 m, so past roughly 6x a cell is
       wider than 20 px and further zoom only magnifies interpolation. */
    MIN_ZOOM: 0.8, MAX_ZOOM: 6,

    // frame a ground width, in metres, centred on a world point
    focus: function (x, z, metres) {
      this.fly = { fx: this.v.x, fz: this.v.z, fz2: this.zoom, tx: x, tz: z, tz2: this.clampZoom(this.metresAtFit() / metres), t0: performance.now(), dur: 520 };
    },
    preset: function (name) {
      const S = C.SITE;
      const at = s => { const c = C.lineAt(C.MAIN, s); return [c[0], c[1]]; };
      if (name === 'overview') { this.fly = { fx: this.v.x, fz: this.v.z, fz2: this.zoom, tx: C.LX * 0.5, tz: C.LZ * 0.5, tz2: 1, t0: performance.now(), dur: 520 }; return; }
      // span = ground width to frame, in metres
      const m = { breach: [at(S.dam), 9000], raini: [at(S.raini), 9000], tapovan: [at(S.tapovan), 9000], joshimath: [at(S.joshimath), 11000], lake: [DA() ? DA().app.lakeXZ : [C.LX * 0.2, C.LZ * 0.5], 9000] }[name];
      if (m) this.focus(m[0][0], m[0][1], m[1]);
    },

    /* ---- interaction ---- */
    bind: function () {
      const cv = this.canvas;
      let drag = null;
      cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, vx: this.v.x, vz: this.v.z, moved: 0 }; this.fly = null; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => {
        const r = cv.getBoundingClientRect();
        // only report a hover when the pointer is genuinely over the canvas, not
        // over one of the floating control panels drawn on top of it
        const over = e.target === cv;
        this.hover = over ? { x: this.wx(e.clientX - r.left), z: this.wz(e.clientY - r.top) } : null;
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        this.v.x = drag.vx - dx / this.scale(); this.v.z = drag.vz - dy / this.scale();
        this.clampView();
      });
      const end = e => { if (drag && drag.moved < 4) this.pick(e); drag = null; };
      cv.addEventListener('pointerup', end);
      cv.addEventListener('pointercancel', () => { drag = null; });
      cv.addEventListener('pointerleave', () => { this.hover = null; });
      cv.addEventListener('wheel', e => {
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const bx = this.wx(mx), bz = this.wz(my);
        const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.02 : 0.0016));
        this.fly = null;
        this.zoom = this.clampZoom(this.zoom * f);
        this.v.x = bx - (mx - this.cx()) / this.scale();
        this.v.z = bz - (my - this.cy()) / this.scale();
        this.clampView();
      }, { passive: false });
      cv.addEventListener('dblclick', e => {
        const r = cv.getBoundingClientRect();
        // double click closes in by half the current ground width
        this.focus(this.wx(e.clientX - r.left), this.wz(e.clientY - r.top), this.metresAcross() * 0.5);
      });
    },
    clampView: function () {
      const s = this.scale(), halfW = (this.W * 0.5) / s, halfH = (this.H * 0.5) / s;
      this.v.x = clamp(this.v.x, -halfW * 0.35, C.LX + halfW * 0.35);
      this.v.z = clamp(this.v.z, -halfH * 0.35, C.LZ + halfH * 0.35);
    },
    pick: function (e) {
      // nearest asset marker within 14 px, otherwise the gauge under the cursor
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = null, bd = 18;
      C.ASSETS.forEach((a, i) => {
        const d = Math.hypot(this.sx(a.x) - mx, this.sy(a.z) - my);
        if (d < bd) { bd = d; best = { kind: 'asset', i }; }
      });
      this.sel = best || null;
      if (best) { const a = C.ASSETS[best.i]; this.focus(a.x, a.z, 5000); this.render(); }
    },

    /* ---- the map's own floating chrome ---- */
    buildChrome: function () {
      const wrap = document.createElement('div');
      wrap.className = 'm2d-chrome';
      wrap.innerHTML =
        '<div class="m2d-head"><b>2D plan map</b><span id="m2dSub">Rishiganga domain, 26 x 13 km</span></div>' +
        '<div class="m2d-bar" id="m2dLayers" role="group" aria-label="Map layer">' +
        ['Water', 'Depth', 'Speed', 'Arrival', 'Hazard'].map((n, i) => `<button class="m2d-l" data-v="${i}" aria-pressed="${i === 0}">${n}</button>`).join('') +
        '</div>' +
        '<label class="m2d-chk"><input type="checkbox" id="m2dEnv"> Peak envelope</label>' +
        '<div class="m2d-bar" id="m2dCams" role="group" aria-label="Jump to site">' +
        [['overview', 'Valley'], ['lake', 'Lake'], ['breach', 'Breach'], ['raini', 'Raini'], ['tapovan', 'Tapovan'], ['joshimath', 'Joshimath']]
          .map(c => `<button class="m2d-l" data-cam="${c[0]}">${c[1]}</button>`).join('') +
        '</div>' +
        '<div class="m2d-zoom"><button class="m2d-z" data-z="in" aria-label="Zoom in">+</button><button class="m2d-z" data-z="out" aria-label="Zoom out">&minus;</button><button class="m2d-z" data-z="fit" aria-label="Fit domain">&#9633;</button></div>' +
        '<div class="m2d-legend" id="m2dLegend"></div>' +
        '<div class="m2d-scale" id="m2dScale"><i></i><span></span></div>' +
        '<div class="m2d-tip" id="m2dTip" hidden></div>' +
        '<div class="m2d-note">Depth, speed, arrival and hazard read the same 2D solver as the 3D scene. Depth is drawn at true scale here.</div>';
      this.el.appendChild(wrap);
      this.tip = wrap.querySelector('#m2dTip');
      this.legendEl = wrap.querySelector('#m2dLegend');
      this.scaleEl = wrap.querySelector('#m2dScale');
      wrap.querySelectorAll('#m2dLayers .m2d-l').forEach(b => b.addEventListener('click', () => {
        if (DA()) DA().setView(+b.dataset.v);
        this.syncChrome();
      }));
      wrap.querySelector('#m2dEnv').addEventListener('change', e => { if (DA()) DA().setEnv(e.target.checked); });
      wrap.querySelectorAll('#m2dCams .m2d-l').forEach(b => b.addEventListener('click', () => this.preset(b.dataset.cam)));
      wrap.querySelectorAll('.m2d-z').forEach(b => b.addEventListener('click', () => {
        if (b.dataset.z === 'fit') this.preset('overview');
        else this.focus(this.v.x, this.v.z, this.metresAcross() * (b.dataset.z === 'in' ? 0.55 : 1.8));
      }));
      this.wrappers = wrap;
    },

    syncChrome: function () {
      const A = DA() ? DA().app : { view: 0, env: false };
      this.wrappers.querySelectorAll('#m2dLayers .m2d-l').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === A.view ? 'true' : 'false'));
      const env = this.wrappers.querySelector('#m2dEnv');
      if (env && env.checked !== !!A.env) env.checked = !!A.env;
      const S = C.ST;
      const sub = $('#m2dSub');
      if (sub) sub.textContent = S.done
        ? 'Peak envelope, run complete'
        : (A.started ? 'Live solver, ' + (S.n > 0 ? fmt(S.n) + ' SPH particles live' : '2D propagation') : 'Idle, breach not started');
      const g = ['', 'linear-gradient(90deg,#cceef7,#73c2e6,#2e80c7,#29459a,#4d1a73)', 'linear-gradient(90deg,#fff2b3,#f9c766,#ed7d40,#cc3333,#730d2e)', 'linear-gradient(90deg,#d92626,#f28c26,#f2d94d,#73bf73,#4080cc)', 'linear-gradient(90deg,#73bf73 0 20%,#f2d94d 20% 40%,#f28c26 40% 60%,#d93326 60% 80%,#800d26 80%)'][A.view];
      const r = ['', ['0 m', '12 m'], ['0', '20 m/s'], ['T+0', 'T+60 min'], ['safe', 'depth x speed, to 20 m2/s']][A.view];
      this.legendEl.innerHTML = A.view === 0
        ? '<span>Sediment laden water, foam where it runs fast</span>'
        : '<span>' + r[0] + '</span><span class="m2d-ramp" style="background:' + g + '"></span><span>' + r[1] + '</span>';
    },

    drawScaleBar: function () {
      if (!this.scaleEl) return;
      const km = [1, 2, 5, 10, 20, 50];
      let pick = km[0];
      const s = this.scale();
      for (const k of km) if (k * 1000 * s < 150) pick = k;
      const w = pick * 1000 * s;
      this.scaleEl.querySelector('i').style.width = w.toFixed(1) + 'px';
      this.scaleEl.querySelector('span').textContent = pick + ' km';
    },

    /* ---- main draw ---- */
    render: function () {
      if (!this.inited || !this.active) return;
      if (this.fly) {
        const f = this.fly, t = clamp((performance.now() - f.t0) / f.dur, 0, 1);
        const e = 1 - Math.pow(1 - t, 3);
        this.v.x = f.fx + (f.tx - f.fx) * e;
        this.v.z = f.fz + (f.tz - f.fz) * e;
        this.zoom = f.fz2 + (f.tz2 - f.fz2) * e;
        if (t >= 1) this.fly = null;
      }
      // The dam block and its notch are the only part of the terrain raster that
      // moves, and only while the breach is actually progressing, so the map
      // follows it without redoing the static hillshade pass.
      if (C.ST.breach && Math.abs(C.ST.breach.pr - this.basePr) > 0.004) {
        this.basePr = C.ST.breach.pr;
        this.paintDam();
      }
      this.rebuildFlood();
      this.resize();
      this.syncChrome();
      this.drawScaleBar();

      const g = this.g, S = C.ST, A = DA() ? DA().app : { view: 0, env: false, started: false, washed: {} };
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.clearRect(0, 0, this.W, this.H);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';

      const s = this.scale();
      const x0 = this.sx(0), y0 = this.sy(0), wm = C.LX * s, hm = C.LZ * s;

      // terrain
      g.drawImage(this.base, x0, y0, wm, hm);
      // 5 km graticule
      g.save(); g.beginPath(); g.rect(x0, y0, wm, hm); g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1;
      for (let x = 5000; x < C.LX; x += 5000) { g.beginPath(); g.moveTo(this.sx(x), y0); g.lineTo(this.sx(x), y0 + hm); g.stroke(); }
      for (let z = 5000; z < C.LZ; z += 5000) { g.beginPath(); g.moveTo(x0, this.sy(z)); g.lineTo(x0 + wm, this.sy(z)); g.stroke(); }
      // water + flood
      g.drawImage(this.flood, x0, y0, wm, hm);
      g.restore();

      this.drawRiver(g);
      this.drawRoads(g, A);
      this.drawHandoff(g);
      this.drawFront(g, A);
      this.drawParticles(g);
      this.drawGauges(g);
      this.drawAssets(g);
      this.drawFrame(g);
      this.drawTip(g);
    },

    drawRiver: function (g) {
      const w = clamp(this.scale() * 22, 1.2, 9);
      g.save(); g.lineJoin = g.lineCap = 'round';
      g.strokeStyle = 'rgba(14,32,40,0.35)'; g.lineWidth = w * 1.7;
      this.strokeLine(g, C.MAIN, C.S_IN + 40, C.S_OUT - 20);
      this.strokeLine(g, C.TRIB, 300, C.TRIB.L - 40);
      g.strokeStyle = 'rgba(150,206,224,0.95)'; g.lineWidth = w;
      this.strokeLine(g, C.MAIN, C.S_IN + 40, C.S_OUT - 20);
      g.strokeStyle = 'rgba(140,196,214,0.85)'; g.lineWidth = w * 0.6;
      this.strokeLine(g, C.TRIB, 300, C.TRIB.L - 40);
      g.restore();
    },
    strokeLine: function (g, line, s0, s1) {
      g.beginPath();
      let first = true;
      for (let s = s0; s <= s1; s += 200) {
        const c = C.lineAt(line, s);
        const x = this.sx(c[0]), y = this.sy(c[1]);
        if (first) { g.moveTo(x, y); first = false; } else g.lineTo(x, y);
      }
      g.stroke();
    },

    drawRoads: function (g, A) {
      const pts = DA() ? DA().roadPts : null;
      if (!pts || !pts.length) return;
      const cutAt = i => {
        const p = pts[i];
        if (p.k >= 0) return C.b[p.k] + C.maxd[p.k] > p.e - 1;
        return !!A.washed.bridge_raini;
      };
      const s = this.scale();
      g.save(); g.lineJoin = g.lineCap = 'round'; g.lineWidth = Math.max(1.4, s * 12);
      let cut = false;
      g.beginPath();
      pts.forEach((p, i) => { const x = this.sx(p.x), y = this.sy(p.z); i ? g.lineTo(x, y) : g.moveTo(x, y); if (cutAt(i)) cut = true; });
      g.strokeStyle = 'rgba(20,24,26,0.5)'; g.stroke();
      g.strokeStyle = cut ? 'rgba(215,70,50,0.95)' : 'rgba(240,228,192,0.9)';
      g.lineWidth = Math.max(1, s * 9);
      g.setLineDash([]);
      g.stroke();
      g.restore();
    },

    drawHandoff: function (g) {
      if (!C.ST.n) return;
      const c = C.lineAt(C.MAIN, C.SITE.hand), t = C.lineTan(C.MAIN, C.SITE.hand);
      const nx = -t[1], nz = t[0], half = 1300;
      g.save();
      g.strokeStyle = 'rgba(143,211,232,0.9)'; g.lineWidth = 2; g.setLineDash([6, 4]);
      g.beginPath();
      g.moveTo(this.sx(c[0] - nx * half), this.sy(c[1] - nz * half));
      g.lineTo(this.sx(c[0] + nx * half), this.sy(c[1] + nz * half));
      g.stroke();
      g.setLineDash([]);
      if (this.zoom > 0.9) {
        g.font = '600 11px Archivo, sans-serif'; g.fillStyle = 'rgba(233,247,251,0.95)';
        g.textAlign = 'left';
        g.fillText('SPH to 2D handoff', this.sx(c[0] - nx * half) + 6, this.sy(c[1] - nz * half) - 6);
      }
      g.restore();
    },

    drawFront: function (g, A) {
      const S = C.ST;
      if (!A.started || S.frontS <= C.SITE.hand + 100) return;
      const c = C.lineAt(C.MAIN, S.frontS), t = C.lineTan(C.MAIN, S.frontS);
      const nx = -t[1], nz = t[0], half = 900;
      const x = this.sx(c[0]), y = this.sy(c[1]);
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(this.sx(c[0] - nx * half), this.sy(c[1] - nz * half));
      g.lineTo(this.sx(c[0] + nx * half), this.sy(c[1] + nz * half));
      g.stroke();
      g.fillStyle = '#8fd3e8';
      g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
      if (this.zoom > 0.9) {
        g.font = '700 11px Archivo, sans-serif'; g.textAlign = 'left';
        const tx = fmt((S.frontS - C.SITE.dam) / 1000, 1) + ' km, ' + fmt(S.frontV * 3.6) + ' km/h';
        g.lineWidth = 3; g.strokeStyle = 'rgba(10,26,34,0.75)';
        g.strokeText(tx, x + 8, y - 8); g.fillStyle = '#eaf7fb'; g.fillText(tx, x + 8, y - 8);
      }
      g.restore();
    },

    drawParticles: function (g) {
      const n = C.ST.n;
      if (!n) return;
      const px = C.px, pz = C.pz, pvx = C.pvx, pvz = C.pvz, page = C.page;
      const r = clamp(this.scale() * 18, 0.8, 3.4);
      for (let i = 0; i < n; i++) {
        const sp = Math.hypot(pvx[i], pvz[i]);
        const foam = clamp((sp - 8) / 18, 0, 1) * 0.75 + (1 - clamp(page[i] / 5, 0, 1)) * 0.35;
        g.fillStyle = 'rgb(' + Math.round((0.50 + (0.95 - 0.50) * foam) * 255) + ',' + Math.round((0.43 + (0.93 - 0.43) * foam) * 255) + ',' + Math.round((0.34 + (0.89 - 0.34) * foam) * 255) + ')';
        g.beginPath(); g.arc(this.sx(px[i]), this.sy(pz[i]), r, 0, 7); g.fill();
      }
    },

    drawGauges: function (g) {
      const S = C.ST;
      const band = this.safe();
      C.GAUGES.forEach((G, i) => {
        if (i === 0) return; // the handoff gauge sits on the dashed line already
        const c = C.lineAt(C.MAIN, G.s), t = C.lineTan(C.MAIN, G.s);
        const x = this.sx(c[0] - t[1] * 260), y = this.sy(c[1] + t[0] * 260);
        g.save();
        g.fillStyle = 'rgba(12,26,32,0.8)'; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1; g.stroke();
        if (this.zoom > 0.9) {
          const q = S.gauges[i] && S.gauges[i].length ? S.gauges[i][S.gauges[i].length - 1] : 0;
          g.font = '600 10.5px Archivo, sans-serif'; g.textAlign = 'left';
          const tx = G.name + '  ' + fmt(q) + ' m3/s';
          if (x + 6 + g.measureText(tx).width <= band.x + band.w) {
            g.lineWidth = 3; g.strokeStyle = 'rgba(10,20,26,0.7)';
            g.strokeText(tx, x + 6, y + 3.5);
            g.fillStyle = '#dcecef'; g.fillText(tx, x + 6, y + 3.5);
          }
        }
        g.restore();
      });
    },

    drawAssets: function (g) {
      const A = DA() ? DA().app : { washed: {} };
      const stat = DA() ? DA().assetStatus : null;
      const sel = this.sel && this.sel.kind === 'asset' ? this.sel.i : -1;
      // Drawn worst-first so that, when two markers are close enough to collide,
      // it is the one that is already flooding that keeps its label. Tapovan
      // alone has three sites within a few hundred metres.
      const order = C.ASSETS.map((a, i) => ({ a, i, rank: stat ? { hit: 0, warn: 1, ok: 2 }[stat(i).state] : 2 }));
      order.sort((p, q) => p.rank - q.rank);
      const boxes = [];
      order.forEach(({ a, i }) => {
        const s = stat ? stat(i) : { state: 'ok', t: -1, depth: 0 };
        const col = s.state === 'hit' ? '#f06a52' : s.state === 'warn' ? '#e8b04a' : '#79c99a';
        const x = this.sx(a.x), y = this.sy(a.z);
        const r = clamp(3.4 + Math.sqrt(a.pop) * 0.22, 3.4, 11);
        g.save();
        g.beginPath(); g.arc(x, y, r, 0, 7);
        g.fillStyle = s.state === 'hit' ? 'rgba(240,106,82,0.55)' : 'rgba(12,26,32,0.62)'; g.fill();
        g.lineWidth = sel === i ? 2.6 : 1.8; g.strokeStyle = col; g.stroke();
        if (a.kind === 'hydro') { g.beginPath(); g.rect(x - 2.2, y - 2.2, 4.4, 4.4); g.fillStyle = col; g.fill(); }
        if (this.zoom > 0.9) {
          g.font = '650 11px Archivo, sans-serif'; g.textAlign = 'center';
          const band = this.safe();
          const w = g.measureText(a.name).width;
          const ty = y - r - 6;
          const box = [x - w / 2 - 3, ty - 11, x + w / 2 + 3, ty + 4];
          // reject anything that would spill out of the clear band or land on a
          // label already placed; the marker itself still draws either way
          const inBand = box[0] >= band.x && box[2] <= band.x + band.w;
          const free = inBand && !boxes.some(q => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]);
          if (free) {
            boxes.push(box);
            g.lineWidth = 3.2; g.strokeStyle = 'rgba(10,20,26,0.78)';
            g.strokeText(a.name, x, ty); g.fillStyle = '#eaf1f3'; g.fillText(a.name, x, ty);
            if (this.zoom > 2.2) {
              g.font = '600 10px Archivo, sans-serif';
              const sub = s.state === 'hit' ? 'flooded T+' + Math.round(s.t / 60) + ' min' : s.state === 'warn' ? 'expected T+' + Math.round(s.t / 60) + ' min' : fmt(a.pop) + ' people';
              g.strokeText(sub, x, ty + 12);
              g.fillStyle = col; g.fillText(sub, x, ty + 12);
              boxes.push([x - g.measureText(sub).width / 2 - 3, ty + 1, x + g.measureText(sub).width / 2 + 3, ty + 15]);
            }
          }
        }
        g.restore();
      });
      // the debris dam itself
      if (C.P.mode !== 'hindcast') {
        const c = C.lineAt(C.MAIN, C.SITE.dam), t = C.lineTan(C.MAIN, C.SITE.dam);
        const nx = -t[1], nz = t[0];
        g.save();
        g.strokeStyle = '#efb28c'; g.lineWidth = 3; g.setLineDash([9, 5]);
        g.beginPath();
        g.moveTo(this.sx(c[0] - nx * 700), this.sy(c[1] - nz * 700));
        g.lineTo(this.sx(c[0] + nx * 700), this.sy(c[1] + nz * 700));
        g.stroke(); g.setLineDash([]);
        if (this.zoom > 0.9) {
          g.font = '700 11px Archivo, sans-serif'; g.textAlign = 'center';
          g.lineWidth = 3; g.strokeStyle = 'rgba(10,20,26,0.78)';
          const t2 = C.ST.breach.pr > 0 ? 'breach ' + fmt(C.ST.breach.B) + ' m wide' : C.P.Hd + ' m debris dam';
          const lx = this.sx(c[0]), ly = this.sy(c[1]) - 16;
          g.strokeText(t2, lx, ly); g.fillStyle = '#f4dcc8'; g.fillText(t2, lx, ly);
        }
        g.restore();
      }
    },

    drawFrame: function (g) {
      g.save();
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 1;
      g.strokeRect(this.sx(0) + 0.5, this.sy(0) + 0.5, C.LX * this.scale(), C.LZ * this.scale());
      g.restore();
    },

    drawTip: function (g) {
      const t = this.tip;
      if (!t) return;
      const sel = this.sel && this.sel.kind === 'asset' ? this.sel.i : -1;
      if (sel >= 0) {
        const a = C.ASSETS[sel], s = DA().assetStatus(sel);
        t.hidden = false;
        t.innerHTML = '<b>' + a.name + '</b><br>' + a.note + '<br>' +
          (s.state === 'hit' ? 'Flooded T+' + Math.round(s.t / 60) + ' min, ' + fmt(s.depth, 1) + ' m deep'
            : s.state === 'warn' ? 'Expected T+' + Math.round(s.t / 60) + ' min' : 'Above the flood line') +
          '<br>' + fmt(a.pop) + ' people' + (a.te > 0 ? ', ' + a.te + ' min to safety' : ', no road out');
      } else if (this.hover) {
        if (this.hover.x < 0 || this.hover.x > C.LX || this.hover.z < 0 || this.hover.z > C.LZ) { t.hidden = true; return; }
        const k = C.cellAt(this.hover.x, this.hover.z);
        const dep = C.d[k], mx = C.maxd[k], sp = Math.hypot(C.u[k], C.w[k]);
        t.hidden = false;
        t.innerHTML = '<b>' + fmt(this.hover.x / 1000, 2) + ', ' + fmt(this.hover.z / 1000, 2) + ' km</b><br>' +
          'ground ' + fmt(C.b[k], 0) + ' m<br>depth now ' + fmt(dep, 2) + ' m' + (dep > 0.05 ? ', ' + fmt(sp, 1) + ' m/s' : '') +
          '<br>peak depth ' + fmt(mx, 2) + ' m';
      } else t.hidden = true;
    }
  };

  root.Map2DView = Map2DView;
})(typeof window !== 'undefined' ? window : globalThis);
