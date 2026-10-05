/* DAM SYSTEM Basin 2D Map: a flat lon/lat plan map of the whole Ganga basin,
   the 2D peer of src/basin/basinView.js.

   basinView.js renders the routing in three dimensions; this renders the same
   BasinData geometry and the same BasinCore state as a map: a shaded relief
   backdrop from the basin DEM, the reach network coloured by how much each
   reach's peak discharge exceeds its own baseflow, the routed surge drawn as a
   travelling band on each polyline, towns by hazard class, structures, and the
   Rishiganga local domain footprint that the local 2D map also uses.

   It is a canvas renderer, so it needs no three.js and no network: the basin
   datasets arrive through window.GANGA_DATA via BasinData.load(). */
(function (root) {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmt = (v, d) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });

  /* Inner edge of a side panel, or the viewport edge when it is not on screen.
     Visibility comes from computed style, not `offsetParent`: these panels are
     `position: fixed`, and offsetParent is null for every fixed element whether
     or not it is shown. */
  function panelShown(sel) {
    const el = $(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    return el.getBoundingClientRect().width > 0;
  }
  function panelRight(sel) { return panelShown(sel) ? $(sel).getBoundingClientRect().right + 16 : 16; }
  function panelLeft(sel) { return panelShown(sel) ? $(sel).getBoundingClientRect().left - 16 : window.innerWidth - 16; }

  // equirectangular about the basin's mid-latitude: at 26 degrees north this is
  // within a fraction of a percent of a Mercator projection over this extent,
  // and it keeps the river geometry honest without a projection library
  const LAT0 = 26.4 * Math.PI / 180, KX = Math.cos(LAT0);
  const B = { lon0: 77.5, lon1: 89.5, lat0: 21.3, lat1: 31.5 };
  const px = (lon) => (lon - B.lon0) * KX;
  const py = (lat) => -(lat - B.lat0);
  // Absolute extents, in projected units per screen pixel terms: py() runs
  // backwards (north is up, so y decreases with latitude), which would make
  // SPAN_Y negative and hand the whole map a negative, mirrored scale.
  const SPAN_X = Math.abs(px(B.lon1) - px(B.lon0));
  const SPAN_Y = Math.abs(py(B.lat1) - py(B.lat0));

  // the same box src/basin/basinView.js draws in 3D, so the two basin views
  // mark the local domain identically
  const LOCAL_DOMAIN_BOX = { lon0: 79.40, lat0: 30.35, lon1: 79.80, lat1: 30.70 };

  const HAZ_COL = { H0: '#79c99a', H1: '#8fd3e8', H2: '#8fd3e8', H3: '#e8b04a', H4: '#e8b04a', H5: '#f06a52', H6: '#d92f18' };

  // same landcover palette src/basin/basinView.js paints on its 3D terrain, in
  // absolute metres so both basin views shade the DEM identically
  const LAND = [
    [0, [0.32, 0.46, 0.36]], [150, [0.47, 0.46, 0.34]], [1000, [0.27, 0.36, 0.22]],
    [2600, [0.52, 0.50, 0.44]], [4200, [0.90, 0.93, 0.96]],
  ];
  function landCol(e) {
    if (e <= LAND[0][0]) return LAND[0][1];
    for (let i = 1; i < LAND.length; i++) {
      if (e <= LAND[i][0]) {
        const a = LAND[i - 1], b = LAND[i], u = (e - a[0]) / (b[0] - a[0] || 1);
        return [a[1][0] + (b[1][0] - a[1][0]) * u, a[1][1] + (b[1][1] - a[1][1]) * u, a[1][2] + (b[1][2] - a[1][2]) * u];
      }
    }
    return LAND[LAND.length - 1][1];
  }

  const Basin2DView = {
    el: null, canvas: null, g: null, active: false, inited: false,

    init: function (containerEl) {
      if (this.inited) return;
      this.el = containerEl;
      const cv = document.createElement('canvas');
      cv.className = 'b2d-canvas';
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', 'Two dimensional map of the Ganga basin: river network, surge extent and town hazard classes');
      this.el.appendChild(cv);
      this.canvas = cv; this.g = cv.getContext('2d');
      this.buildChrome();
      this.relief = null;
      this.v = { x: (px(B.lon0) + px(B.lon1)) / 2, y: (py(B.lat0) + py(B.lat1)) / 2 };
      this.zoom = 1;
      this.W = this.el.clientWidth; this.H = this.el.clientHeight; // safe() needs these
      this.bind();
      this.inited = true;
      this.startLoop();
      window.addEventListener('resize', () => this.resize());
    },

    setActive: function (on) {
      this.active = !!on;
      if (on) { this.resize(); this.render(); }
    },

    // Own rAF loop, like basinView.js. The local 2D map is driven by app.js's
    // frame loop (which also steps its physics), but the basin map has no
    // physics of its own to share a loop with.
    startLoop: function () {
      if (this.looping) return;
      this.looping = true;
      const self = this;
      function anim() {
        requestAnimationFrame(anim);
        if (self.inited && self.active) self.render();
      }
      anim();
    },

    data: function () { return root.BasinData; },

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

    // Fit to the clear band between the basin view's own side panels, and centre
    // on it, for the same reason as map2d.js: the basin story panel and the
    // attenuation panel are both wide, and the Himalaya head of the network sits
    // exactly where the story panel would cover it.
    safe: function () {
      const W = this.W || (this.el ? this.el.clientWidth : 0), H = this.H || (this.el ? this.el.clientHeight : 0);
      if (W >= 901) {
        const l = panelRight('.basin-story-panel'), r = panelLeft('.basin-intel-panel');
        return { x: l, y: 76, w: Math.max(120, r - l), h: Math.max(120, H - 76 - 88) };
      }
      return { x: 8, y: 64, w: Math.max(120, W - 16), h: Math.max(120, H - 64 - 150) };
    },
    cx: function () { const a = this.safe(); return a.x + a.w / 2; },
    cy: function () { const a = this.safe(); return a.y + a.h / 2; },

    /* Zoom as a multiple of fit, like map2d.js, so the scale is always derived
       from the current clear band rather than a scale cached at init. */
    fitScale: function () { const a = this.safe(); return Math.min(a.w / SPAN_X, a.h / SPAN_Y); },
    scale: function () { return this.fitScale() * this.zoom; },
    // ground span across the clear band at zoom 1, in projected units. Measured
    // rather than assumed to be the basin's full extent, because the fit is
    // whichever of width or height binds.
    unitsAtFit: function () { return this.safe().w / this.fitScale(); },
    clampZoom: function (z) { return clamp(z, this.MIN_ZOOM, this.MAX_ZOOM); },
    fit: function () { this.zoom = 1; this.v.x = (px(B.lon0) + px(B.lon1)) / 2; this.v.y = (py(B.lat0) + py(B.lat1)) / 2; },
    // Same "relative to the view centre" transform as map2d.js. The basin's
    // extent must not enter it, or the whole basin lands off-centre.
    sx: function (lon) { return this.cx() + (px(lon) - this.v.x) * this.scale(); },
    sy: function (lat) { return this.cy() + (py(lat) - this.v.y) * this.scale(); },
    invX: function (p) { return this.v.x + (p - this.cx()) / this.scale(); },
    invY: function (p) { return this.v.y + (p - this.cy()) / this.scale(); },
    invLon: function (p) { return this.invX(p) / KX + B.lon0; },
    invLat: function (p) { return -this.invY(p) + B.lat0; },

    /* Zoom limits, as multiples of fit. The ceiling stops the map magnifying the
       basin DEM (64x64 over 12x10 degrees) past the point where a cell is wider
       than a useful map feature. */
    MIN_ZOOM: 0.8, MAX_ZOOM: 8,

    // spanLon = ground width to frame, in degrees of longitude
    focusLonLat: function (lon, lat, spanLon) {
      this.fly = { fx: this.v.x, fy: this.v.y, fz2: this.zoom, tx: px(lon), ty: py(lat), tz2: this.clampZoom(this.unitsAtFit() / (spanLon * KX)), t0: performance.now(), dur: 520 };
    },

    /* ---- interaction ---- */
    bind: function () {
      const cv = this.canvas;
      let drag = null;
      cv.addEventListener('pointerdown', e => { const r = cv.getBoundingClientRect(); drag = { x: e.clientX, y: e.clientY, vx: this.v.x, vy: this.v.y, moved: 0 }; this.fly = null; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => {
        const r = cv.getBoundingClientRect();
        this.hover = { mx: e.clientX - r.left, my: e.clientY - r.top, lon: this.invLon(e.clientX - r.left), lat: this.invLat(e.clientY - r.top) };
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
        this.v.x = drag.vx - dx / this.scale(); this.v.y = drag.vy - dy / this.scale();
        this.clampView();
      });
      cv.addEventListener('pointerup', e => { if (drag && drag.moved < 4) this.pick(e); drag = null; });
      cv.addEventListener('pointercancel', () => { drag = null; });
      cv.addEventListener('pointerleave', () => { this.hover = null; });
      cv.addEventListener('wheel', e => {
        e.preventDefault();
        const r = cv.getBoundingClientRect();
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const bl = this.invLon(mx), ba = this.invLat(my);
        this.fly = null;
        this.zoom = this.clampZoom(this.zoom * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.02 : 0.0016)));
        this.v.x = px(bl) - (mx - this.cx()) / this.scale();
        this.v.y = py(ba) - (my - this.cy()) / this.scale();
        this.clampView();
      }, { passive: false });
      cv.addEventListener('dblclick', e => {
        const r = cv.getBoundingClientRect();
        // double click closes in by half the current ground width
        this.focusLonLat(this.invLon(e.clientX - r.left), this.invLat(e.clientY - r.top), (this.safe().w / this.scale()) / KX * 0.5);
      });
    },
    clampView: function () {
      const s = this.scale(), hw = (this.W * 0.5) / s, hh = (this.H * 0.5) / s;
      this.v.x = clamp(this.v.x, px(B.lon0) - hw * 0.3, px(B.lon1) + hw * 0.3);
      this.v.y = clamp(this.v.y, py(B.lat1) - hh * 0.3, py(B.lat0) + hh * 0.3);
    },
    pick: function (e) {
      const BD = this.data(); if (!BD || !BD.towns) return;
      const r = this.canvas.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = null, bd = 12;
      BD.towns.forEach(t => {
        const d = Math.hypot(this.sx(t.lon) - mx, this.sy(t.lat) - my);
        if (d < bd) { bd = d; best = t; }
      });
      BD.structures.forEach(s => {
        const d = Math.hypot(this.sx(s.lon) - mx, this.sy(s.lat) - my);
        if (d < bd) { bd = d; best = s; }
      });
      this.sel = best;
      if (best) { this.focusLonLat(best.lon, best.lat, 5); this.render(); }
    },

    buildChrome: function () {
      const wrap = document.createElement('div');
      wrap.className = 'b2d-chrome';
      wrap.innerHTML =
        '<div class="b2d-head"><b>2D basin map</b><span>Ganga main stem, 77.5 to 89.5 E</span></div>' +
        '<div class="b2d-bar"><button class="b2d-l" data-fit="1">Whole basin</button><button class="b2d-l" data-fit="local">Rishiganga domain</button><button class="b2d-l" data-fit="haridwar">Haridwar to Delhi</button><button class="b2d-l" data-fit="delta">Delta</button></div>' +
        '<div class="b2d-zoom"><button class="b2d-z" data-z="in" aria-label="Zoom in">+</button><button class="b2d-z" data-z="out" aria-label="Zoom out">&minus;</button></div>' +
        '<div class="b2d-legend" id="b2dLegend"></div>' +
        '<div class="b2d-scale" id="b2dScale"><i></i><span></span></div>' +
        '<div class="b2d-tip" id="b2dTip" hidden></div>';
      this.el.appendChild(wrap);
      this.tip = wrap.querySelector('#b2dTip');
      this.legendEl = wrap.querySelector('#b2dLegend');
      this.scaleEl = wrap.querySelector('#b2dScale');
      wrap.querySelectorAll('[data-fit]').forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.fit;
        if (k === 'local') this.focusLonLat((LOCAL_DOMAIN_BOX.lon0 + LOCAL_DOMAIN_BOX.lon1) / 2, (LOCAL_DOMAIN_BOX.lat0 + LOCAL_DOMAIN_BOX.lat1) / 2, 0.9);
        else if (k === 'haridwar') this.focusLonLat(78.4, 28.6, 4);
        else if (k === 'delta') this.focusLonLat(88.1, 22.4, 3);
        else this.fit();
        b.setAttribute('aria-pressed', 'true');
      }));
      wrap.querySelectorAll('.b2d-z').forEach(b => b.addEventListener('click', () => {
        const acrossDeg = (this.safe().w / this.scale()) / KX;
        this.focusLonLat(this.invLon(this.cx()), this.invLat(this.cy()), acrossDeg * (b.dataset.z === 'in' ? 0.55 : 1.8));
      }));
    },

    /* ---- shaded relief from the basin DEM ---- */
    buildRelief: function () {
      const BD = this.data(), dem = BD && BD.dem;
      if (!dem || !dem.elevations) return null;
      const nx = dem.nx, nz = dem.nz;
      const cv = document.createElement('canvas'); cv.width = nx; cv.height = nz;
      const g2 = cv.getContext('2d');
      const img = g2.createImageData(nx, nz), p = img.data;
      const Lx = -0.55, Ly = 0.72, Lz = -0.42;
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const e = dem.elevations[j] ? (dem.elevations[j][i] || 0) : 0;
        const el = i > 0 ? (dem.elevations[j][i - 1] || e) : e;
        const er = i < nx - 1 ? (dem.elevations[j][i + 1] || e) : e;
        const eu = j > 0 ? (dem.elevations[j - 1] ? dem.elevations[j - 1][i] : e) : e;
        const ed = j < nz - 1 ? (dem.elevations[j + 1] ? dem.elevations[j + 1][i] : e) : e;
        const dLon = (B.lon1 - B.lon0) / nx, dLat = (B.lat1 - B.lat0) / nz;
        const gx = (er - el) / (2 * dLon * 111320 * KX), gz = -(ed - eu) / (2 * dLat * 110540);
        const nl = Math.sqrt(gx * gx + 1 + gz * gz);
        const shade = clamp(((-gx * Lx - gz * Lz + Ly) / nl), 0, 1) * 0.8 + 0.32;
        const c = landCol(e);
        const s = 1 + (shade - 0.72) * 0.6;
        const k = (j * nx + i) * 4;
        p[k] = clamp(c[0] * s * 255, 0, 255);
        p[k + 1] = clamp(c[1] * s * 255, 0, 255);
        p[k + 2] = clamp(c[2] * s * 255, 0, 255);
        p[k + 3] = 210;
      }
      g2.putImageData(img, 0, 0);
      return cv;
    },

    drawScaleBar: function () {
      if (!this.scaleEl) return;
      // visible ground width in km, so the bar is a real map scale at any zoom
      const s = this.scale();
      const kmAcross = (this.safe().w / s) * KX * 111.32;
      const steps = [25, 50, 100, 200, 500, 1000, 2000];
      let pick = steps[0];
      for (const k of steps) if (k < kmAcross * 0.35) pick = k;
      this.scaleEl.querySelector('i').style.width = (pick / (KX * 111.32) * s).toFixed(1) + 'px';
      this.scaleEl.querySelector('span').textContent = pick + ' km';
    },

    /* ---- main draw ---- */
    render: function () {
      if (!this.inited || !this.active) return;
      const BD = this.data(), BC = root.BasinCore;
      if (!BD || !BD.isLoaded) return;
      if (!this.relief) this.relief = this.buildRelief();
      if (this.fly) {
        const f = this.fly, t = clamp((performance.now() - f.t0) / f.dur, 0, 1);
        const e = 1 - Math.pow(1 - t, 3);
        this.v.x = f.fx + (f.tx - f.fx) * e;
        this.v.y = f.fy + (f.ty - f.fy) * e;
        this.zoom = f.fz2 + (f.tz2 - f.fz2) * e;
        if (t >= 1) this.fly = null;
      }
      this.resize();
      this.drawScaleBar();

      const g = this.g;
      g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      g.fillStyle = '#0d1a20'; g.fillRect(0, 0, this.W, this.H);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';

      // Relief backdrop. The DEM is 64x64 over a 12 x 10.2 degree box, i.e. one
      // cell is roughly 20 km across, so it is a coarse hint of where the
      // Himalaya, the plains and the delta are, not a usable basemap - it is
      // drawn once as a backdrop and the vector network carries the detail.
      if (this.relief) {
        const s = this.scale();
        g.globalAlpha = 0.9;
        g.drawImage(this.relief, this.sx(B.lon0), this.sy(B.lat1), SPAN_X * s, SPAN_Y * s);
        g.globalAlpha = 1;
      }
      this.drawGraticule(g);
      this.drawRivers(g, BC);
      this.drawStructures(g, BC);
      this.drawTowns(g, BC);
      this.drawFootprint(g);
      this.drawTip(g, BC);
    },

    drawGraticule: function (g) {
      g.save();
      g.strokeStyle = 'rgba(200,222,232,0.13)'; g.lineWidth = 1;
      g.font = '10px Archivo, sans-serif'; g.fillStyle = 'rgba(200,222,232,0.4)';
      for (let lon = 78; lon <= 89; lon += 2) { const x = this.sx(lon); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, this.H); g.stroke(); }
      for (let lat = 22; lat <= 31; lat += 2) { const y = this.sy(lat); g.beginPath(); g.moveTo(0, y); g.lineTo(this.W, y); g.stroke(); }
      g.restore();
    },

    // Stroke a polyline, optionally only the first `frac` of it measured by
    // length. rivers.json gives 2-5 vertices per reach, so cutting the wave front
    // at a vertex index would jump it in 33-50% steps; interpolating along the
    // segment makes it advance smoothly.
    strokePoly: function (g, poly, frac) {
      const f = frac === undefined ? 1 : clamp(frac, 0, 1);
      g.beginPath();
      g.moveTo(this.sx(poly[0][0]), this.sy(poly[0][1]));
      if (f >= 1) { for (let i = 1; i < poly.length; i++) g.lineTo(this.sx(poly[i][0]), this.sy(poly[i][1])); return null; }
      let total = 0;
      for (let i = 1; i < poly.length; i++) total += Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
      if (total <= 0) return null;
      let want = total * f;
      for (let i = 1; i < poly.length; i++) {
        const seg = Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]);
        if (want <= seg) {
          const t = seg > 0 ? want / seg : 0;
          const lon = poly[i - 1][0] + (poly[i][0] - poly[i - 1][0]) * t;
          const lat = poly[i - 1][1] + (poly[i][1] - poly[i - 1][1]) * t;
          g.lineTo(this.sx(lon), this.sy(lat));
          return [lon, lat];
        }
        g.lineTo(this.sx(poly[i][0]), this.sy(poly[i][1]));
        want -= seg;
      }
      return null;
    },

    drawRivers: function (g, BC) {
      const BD = this.data();
      const ST = BC ? BC.ST : null;
      const now = ST ? (ST.currentTime || 0) : 0;
      // Ground distance per pixel at this zoom, so a reach's real channel width in
      // metres becomes its real width on screen. Derived from the live scale
      // rather than the fit scale, otherwise zooming in would not widen the river.
      const kmPerPx = (this.safe().w / this.scale()) * KX * 111.32 / 1000;
      g.save(); g.lineJoin = g.lineCap = 'round';
      BD.rivers.reaches.forEach(r => {
        const st = ST ? ST.reaches[r.id] : null;
        const surge = st && st.baseflow ? st.peakQ / st.baseflow : 1;
        const col = surge > 5 ? '#f06a52' : surge > 2 ? '#e8b04a' : '#4fa3d8';
        const lw = clamp(r.width_m / 1000 / kmPerPx, 1.1, 18);
        this.strokePoly(g, r.polyline);
        g.strokeStyle = 'rgba(6,16,22,0.55)'; g.lineWidth = lw + 2.2; g.stroke();
        g.strokeStyle = col; g.lineWidth = lw; g.stroke();

        // the routed surge, drawn up to wherever the timeline has reached on this
        // reach: arrival -> peak, so the band grows as the wave passes
        if (st && st.tArrivalSec >= 0 && st.peakQ > st.baseflow + 50) {
          const tA = st.tArrivalSec, tP = st.tPeakSec > 0 ? st.tPeakSec : tA + 1;
          const prog = clamp((now - tA) / Math.max(1, tP - tA), 0, 1);
          if (prog > 0.001) {
            const head = this.strokePoly(g, r.polyline, prog);
            g.strokeStyle = 'rgba(255,120,90,0.9)'; g.lineWidth = lw + 1.2; g.stroke();
            if (prog < 1 && head) {
              g.fillStyle = '#ff8a6b';
              g.beginPath(); g.arc(this.sx(head[0]), this.sy(head[1]), Math.max(2.5, lw * 0.6), 0, 7); g.fill();
            }
          }
        }
      });
      // Reach names, thinned by zoom and placed with a simple occupied-box test.
      // At basin-wide zoom all 17 reaches fit on screen at once, and drawing
      // every name produced a pile of overlapping text over the delta.
      if (this.zoom > 1.2) {
        g.font = '600 10.5px Archivo, sans-serif'; g.textAlign = 'center';
        const boxes = [];
        BD.rivers.reaches.forEach(r => {
          if (r.polyline.length < 3) return;
          const mid = r.polyline[Math.floor(r.polyline.length / 2)];
          const x = this.sx(mid[0]), y = this.sy(mid[1]) - 6;
          if (x < 40 || y < 20 || x > this.W - 40 || y > this.H - 20) return;
          const label = r.name.length > 26 ? r.name.slice(0, 24) + '...' : r.name;
          const w = g.measureText(label).width + 6;
          const box = [x - w / 2, y - 9, x + w / 2, y + 3];
          if (boxes.some(b2 => box[0] < b2[2] && box[2] > b2[0] && box[1] < b2[3] && box[3] > b2[1])) return;
          boxes.push(box);
          g.fillStyle = 'rgba(224,240,246,0.72)';
          g.fillText(label, x, y);
        });
      }
      g.restore();
    },

    drawStructures: function (g, BC) {
      const BD = this.data();
      g.save();
      BD.structures.forEach(s => {
        const st = BC ? BC.ST.structures[s.id] : null;
        const over = st && st.isOvertopped;
        const x = this.sx(s.lon), y = this.sy(s.lat);
        g.save();
        g.translate(x, y); g.rotate(Math.PI / 4);
        g.fillStyle = over ? 'rgba(217,47,24,0.9)' : 'rgba(20,34,42,0.85)';
        g.strokeStyle = over ? '#ffd0c4' : '#c8d4d9'; g.lineWidth = 1.5;
        const r = s.type === 'dam' ? 4.5 : 3.5;
        g.fillRect(-r, -r, r * 2, r * 2); g.strokeRect(-r, -r, r * 2, r * 2);
        g.restore();
      });
      g.restore();
    },

    drawTowns: function (g, BC) {
      const BD = this.data();
      g.save();
      // Label placement, most-at-risk first: with 26 towns and several sharing a
      // name on screen, the labels that matter in an emergency are the ones that
      // must survive the collision test, not the ones drawn last.
      const order = BD.towns.map(t => ({ t, hz: BC && BC.ST.towns[t.id] ? parseInt(BC.ST.towns[t.id].hazardClass.slice(1), 10) || 0 : 0 }));
      order.sort((a, b2) => b2.hz - a.hz);
      const boxes = [];
      const showLabels = this.zoom > 0.5;
      order.forEach(({ t, hz }) => {
        const st = BC ? BC.ST.towns[t.id] : null;
        const col = HAZ_COL[st ? st.hazardClass : 'H0'] || HAZ_COL.H0;
        const x = this.sx(t.lon), y = this.sy(t.lat);
        const r = clamp(2.4 + Math.sqrt(t.pop) / 34, 2.4, 10);
        g.beginPath(); g.arc(x, y, r, 0, 7);
        g.fillStyle = col; g.globalAlpha = 0.92; g.fill();
        g.globalAlpha = 1; g.lineWidth = 1.2; g.strokeStyle = 'rgba(6,16,22,0.7)'; g.stroke();
        if (!showLabels || t.pop <= 0) return;
        if (x < -40 || y < -20 || x > this.W + 40 || y > this.H + 20) return;
        g.font = '600 10px Archivo, sans-serif';
        const label = t.name;
        const w = g.measureText(label).width;
        const lx = x + r + 3, ly = y + 3.5;
        // try right of the dot, then left, then above
        const tries = [[lx, ly, lx + w + 2, ly + 10], [x - r - 3 - w, ly, x - r - 1, ly + 10], [x - w / 2, y - r - 4, x + w / 2, y - r + 2]];
        for (const [bx0, by0, bx1, by1] of tries) {
          if (bx0 < 0 || bx1 > this.W || by0 < 0 || by1 > this.H) continue;
          if (boxes.some(q => bx0 < q[2] && bx1 > q[0] && by0 < q[3] && by1 > q[1])) continue;
          boxes.push([bx0, by0, bx1, by1]);
          g.textAlign = 'left';
          g.lineWidth = 2.6; g.strokeStyle = 'rgba(8,18,24,0.8)';
          g.strokeText(label, lx, ly);
          g.fillStyle = 'rgba(236,246,250,0.95)';
          g.fillText(label, lx, ly);
          break;
        }
      });
      g.restore();
    },

    drawFootprint: function () {
      const g = this.g, b = LOCAL_DOMAIN_BOX, s = this.scale();
      g.save();
      g.strokeStyle = '#ffd700'; g.lineWidth = 1.6; g.setLineDash([5, 4]);
      g.strokeRect(this.sx(b.lon0), this.sy(b.lat1), (b.lon1 - b.lon0) * KX * s, (b.lat1 - b.lat0) * s);
      g.setLineDash([]);
      g.font = '600 10px Archivo, sans-serif'; g.textAlign = 'left';
      g.lineWidth = 2.6; g.strokeStyle = 'rgba(8,18,24,0.8)';
      g.strokeText('Rishiganga local domain', this.sx(b.lon0) + 3, this.sy(b.lat0) + 12);
      g.fillStyle = '#ffd700';
      g.fillText('Rishiganga local domain', this.sx(b.lon0) + 3, this.sy(b.lat0) + 12);
      g.restore();
    },

    drawTip: function (g, BC) {
      const BD = this.data(); const t = this.tip;
      if (!t || !BD) return;
      const sel = this.sel;
      if (sel && BC) {
        const st = BC.ST.towns[sel.id];
        t.hidden = false;
        t.innerHTML = sel.lat !== undefined && BC.ST.towns[sel.id]
          ? '<b>' + sel.name + '</b><br>population ' + fmt(sel.pop) + '<br>' +
            (st.tArrivalSec >= 0 ? 'arrival day ' + Math.floor(st.tArrivalSec / 86400) + ', +' + ((st.tArrivalSec % 86400) / 3600).toFixed(1) + ' h<br>' : 'no arrival<br>') +
            'peak ' + fmt(st.peakQ) + ' m3/s, ' + fmt(st.peakDepth, 1) + ' m deep<br>hazard ' + st.hazardClass + ', risk ' + st.riskScore + '<br>exposed ' + fmt(st.exposedPop) + ' people'
          : '<b>' + sel.name + '</b><br>' + (sel.height_m ? sel.height_m + ' m ' + sel.type : sel.type) + '<br>storage ' + fmt(sel.storage_Mm3) + ' Mm3';
      } else t.hidden = true;
      // legend is static; only needs filling once
      if (this.legendEl && !this.legendEl.dataset.done) {
        this.legendEl.dataset.done = '1';
        this.legendEl.innerHTML =
          '<span class="b2d-legend-row"><i style="background:#4fa3d8"></i>baseflow</span>' +
          '<span class="b2d-legend-row"><i style="background:#e8b04a"></i>surge 2 to 5x</span>' +
          '<span class="b2d-legend-row"><i style="background:#f06a52"></i>surge over 5x</span>' +
          '<span class="b2d-legend-row"><i style="background:#ff8a6b"></i>routed wave front</span>' +
          '<span class="b2d-legend-row"><i style="background:#79c99a"></i>town H0/H1</span>' +
          '<span class="b2d-legend-row"><i style="background:#e8b04a"></i>town H3/H4</span>' +
          '<span class="b2d-legend-row"><i style="background:#f06a52"></i>town H5/H6</span>' +
          '<span class="b2d-legend-row"><i style="background:#c8d4d9"></i>dam or barrage</span>';
      }
    }
  };

  root.Basin2DView = Basin2DView;
})(typeof window !== 'undefined' ? window : globalThis);
