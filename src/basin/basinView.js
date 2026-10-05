/* DAM SYSTEM Basin View: Three.js r147 3D scene rendering the full Ganga Basin
   (from Himalayan headwaters down to Bengal delta), glowing river network, moving wave pulse,
   3D town markers, dam/barrage structures, heatmap overlays, and local domain footprint. */
(function (root) {
  'use strict';

  let scene, camera, controls, renderer, hostEl;
  let terrainMesh, riverGroup, townGroup, structureGroup, pulseGroup, footprintMesh;
  let isMounted = false;
  let isVisible = false; // whether this scene is the one currently on screen
  let VE = 25; // Vertical exaggeration factor

  const BasinView = {
    activeLayer: 'depth', // 'depth', 'hazard', 'arrival', 'peak'

    init: function (containerEl) {
      if (isMounted) return;
      hostEl = containerEl;

      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(hostEl.clientWidth, hostEl.clientHeight);
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true;

      hostEl.appendChild(renderer.domElement);

      scene = new THREE.Scene();
      // Matches the fog color so the terrain fades into "sky" at the horizon
      // instead of dropping to the renderer's default black past the DEM's edge.
      scene.background = new THREE.Color(0x9cb8c9);
      scene.fog = new THREE.FogExp2(0x9cb8c9, 0.0018);

      camera = new THREE.PerspectiveCamera(45, hostEl.clientWidth / hostEl.clientHeight, 1, 3000);
      camera.position.set(0, 320, 240);

      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.maxPolarAngle = 1.48;
      controls.minDistance = 20;
      controls.maxDistance = 650;
      controls.target.set(0, 0, -20);

      // Lights
      scene.add(new THREE.HemisphereLight(0xd9eaf5, 0x4a4035, 1.1));
      const sun = new THREE.DirectionalLight(0xfff4e6, 1.3);
      sun.position.set(-100, 220, 150).normalize();
      scene.add(sun);

      buildBasinTerrain();
      buildRiverNetwork();
      buildStructures();
      buildTowns();
      buildLocalFootprint();

      window.addEventListener('resize', this.onResize.bind(this));
      isMounted = true;

      // The render loop is driven by this scene's own rAF rather than the local
      // view's, so it has to know whether it is the visible scene: rendering an
      // off-screen basin scene (or the basin 2D map) every frame is pure waste,
      // and on a laptop it competes with the scene that is actually on screen for
      // the GPU. `isVisible` is set by ViewManager.mountStages().
      const self = this;
      function anim() {
        requestAnimationFrame(anim);
        if (isMounted && isVisible) {
          self.render();
        }
      }
      anim();
    },

    setVE: function (val) {
      VE = val;
      if (terrainMesh) {
        scene.remove(terrainMesh);
        buildBasinTerrain();
      }
      this.updateData();
    },

    onResize: function () {
      if (!hostEl || !renderer) return;
      camera.aspect = hostEl.clientWidth / hostEl.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(hostEl.clientWidth, hostEl.clientHeight);
    },

    updateData: function () {
      if (!root.BasinCore || !root.BasinCore.ST) return;
      updateRiverFlows();
      updateTownMarkers();
      updateWavePulse();
    },

    render: function () {
      if (!renderer || !scene || !camera) return;
      controls.update();
      renderer.render(scene, camera);
    },

    destroy: function () {
      if (renderer && renderer.domElement) {
        renderer.domElement.remove();
      }
      isMounted = false;
    },

    getLocalDomainAnchor: function () { return getLocalDomainAnchor(); },

    setVisible: function (on) {
      isVisible = !!on;
      // the camera's matrices go stale while hidden, so update once on becoming
      // visible rather than letting the first drawn frame jump
      if (isVisible && controls && camera) { controls.update(); this.render(); }
    },

    get camera() { return camera; },
    get controls() { return controls; },
    get isMounted() { return isMounted; },
    get scene() { return scene; }
  };

  // 1. BASIN TERRAIN MESH
  function buildBasinTerrain() {
    const dem = root.BasinData.dem;
    if (!dem) return;

    const nx = dem.nx, nz = dem.nz;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(nx * nz * 3);
    const col = new Float32Array(nx * nz * 3);
    const idx = [];

    const BD = root.BasinData;
    for (let j = 0; j < nz; j++) {
      const lat = dem.lat_max - (j / (nz - 1)) * (dem.lat_max - dem.lat_min);
      for (let i = 0; i < nx; i++) {
        const lon = dem.lon_min + (i / (nx - 1)) * (dem.lon_max - dem.lon_min);
        const k = j * nx + i;
        const e = dem.elevations[j][i];

        pos[k * 3] = BD.lonToX(lon);
        pos[k * 3 + 1] = BD.elevationToY(e, VE);
        pos[k * 3 + 2] = BD.latToZ(lat);

        // Landcover color styling: Snow top (>3500m), Forest/Hill (1000-3500m), Plains (50-1000m), Delta (0-50m)
        let c = [0.3, 0.45, 0.25];
        if (e > 3800) c = [0.92, 0.95, 0.98];        // Snow
        else if (e > 2000) c = [0.45, 0.42, 0.35];   // Rock/Meadow
        else if (e > 800) c = [0.28, 0.38, 0.22];    // Himalayan Forest
        else if (e > 100) c = [0.55, 0.52, 0.38];    // Gangetic Plains Cropland
        else c = [0.38, 0.52, 0.40];                 // Delta / Wetland

        col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      }
    }

    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }

    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.05
    });

    terrainMesh = new THREE.Mesh(geo, mat);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);
  }

  function sampleElev(lon, lat) {
    const BD = root.BasinData;
    if (!BD || !BD.dem) return 20;
    const dem = BD.dem;
    const fx = (lon - dem.lon_min) / (dem.lon_max - dem.lon_min);
    const fy = (dem.lat_max - lat) / (dem.lat_max - dem.lat_min);
    const ix = Math.max(0, Math.min(dem.nx - 1, Math.floor(fx * dem.nx)));
    const iy = Math.max(0, Math.min(dem.nz - 1, Math.floor(fy * dem.nz)));
    return dem.elevations[iy] ? (dem.elevations[iy][ix] || 20) : 20;
  }

  // 2. RIVER NETWORK GLOWING LINES
  function buildRiverNetwork() {
    riverGroup = new THREE.Group();
    const BD = root.BasinData;
    if (!BD.rivers || !BD.rivers.reaches) return;

    BD.rivers.reaches.forEach(r => {
      const pos = [];
      r.polyline.forEach(pt => {
        const lon = pt[0], lat = pt[1];
        const e = sampleElev(lon, lat);
        pos.push(BD.lonToX(lon), BD.elevationToY(e, VE) + 0.8, BD.latToZ(lat));
      });

      const pts3 = [];
      for (let i = 0; i < pos.length; i += 3) {
        pts3.push(new THREE.Vector3(pos[i], pos[i + 1], pos[i + 2]));
      }
      if (pts3.length < 2) return;

      const curve = new THREE.CatmullRomCurve3(pts3);
      const rad = Math.max(0.35, Math.min(1.2, r.width_m / 1200));
      const tubeGeo = new THREE.TubeGeometry(curve, 32, rad, 6, false);
      const tubeMat = new THREE.MeshBasicMaterial({ color: 0x2e80c7, transparent: true, opacity: 0.85 });
      const mesh = new THREE.Mesh(tubeGeo, tubeMat);
      mesh.name = r.id;
      riverGroup.add(mesh);
    });

    scene.add(riverGroup);
  }

  function updateRiverFlows() {
    if (!riverGroup || !root.BasinCore) return;
    riverGroup.children.forEach(mesh => {
      const rSt = root.BasinCore.getReachState(mesh.name);
      if (rSt && mesh.material) {
        const ratio = rSt.peakQ / Math.max(1, rSt.baseflow);
        if (ratio > 5.0) mesh.material.color.setHex(0xb8321f);      // Extreme surge red
        else if (ratio > 2.0) mesh.material.color.setHex(0xa86a00); // High flow amber
        else mesh.material.color.setHex(0x2e80c7);                  // Normal baseline blue
      }
    });
  }

  // 3. TOWN MARKERS
  function buildTowns() {
    townGroup = new THREE.Group();
    const BD = root.BasinData;
    if (!BD.towns) return;

    const sphereGeo = new THREE.SphereGeometry(1.0, 12, 12);
    BD.towns.forEach(t => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x2f7d55, roughness: 0.3 });
      const mesh = new THREE.Mesh(sphereGeo, mat);
      const scale = Math.max(0.8, Math.min(2.0, Math.log10(t.pop + 1) / 3.0));
      mesh.scale.set(scale, scale, scale);
      const e = sampleElev(t.lon, t.lat);
      mesh.position.copy(BD.posV3(t.lon, t.lat, e + 50, VE));
      mesh.name = t.id;
      townGroup.add(mesh);
    });

    scene.add(townGroup);
  }

  function updateTownMarkers() {
    if (!townGroup || !root.BasinCore) return;
    townGroup.children.forEach(mesh => {
      const tSt = root.BasinCore.getTownState(mesh.name);
      if (tSt && mesh.material) {
        const hc = tSt.hazardClass;
        if (hc === 'H5' || hc === 'H6') mesh.material.color.setHex(0xb8321f);      // Red
        else if (hc === 'H3' || hc === 'H4') mesh.material.color.setHex(0xa86a00); // Amber
        else if (hc === 'H1' || hc === 'H2') mesh.material.color.setHex(0x1b7fa1); // Ice blue
        else mesh.material.color.setHex(0x2f7d55);                                 // Safe green
      }
    });
  }

  // 4. STRUCTURES (Dams & Barrages)
  function buildStructures() {
    structureGroup = new THREE.Group();
    const BD = root.BasinData;
    if (!BD.structures) return;

    const damGeo = new THREE.BoxGeometry(2.0, 4.0, 2.0);
    const damMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.4, metalness: 0.3 });

    BD.structures.forEach(s => {
      const mesh = new THREE.Mesh(damGeo, damMat);
      const e = sampleElev(s.lon, s.lat);
      mesh.position.copy(BD.posV3(s.lon, s.lat, e + 60, VE));
      mesh.name = s.id;
      structureGroup.add(mesh);
    });

    scene.add(structureGroup);
  }

  // 5. LOCAL RISHIGANGA DOMAIN FOOTPRINT
  // Bounding box centered on Rishiganga / Joshimath (30.55N, 79.56E). Kept as one
  // constant so the drawn footprint and the zoom-flight anchor never drift apart.
  const LOCAL_DOMAIN_BOX = { lon0: 79.40, lat0: 30.35, lon1: 79.80, lat1: 30.70 };

  function buildLocalFootprint() {
    const BD = root.BasinData;
    const b = LOCAL_DOMAIN_BOX;
    const e1 = sampleElev(b.lon0, b.lat0);
    const p1 = BD.posV3(b.lon0, b.lat0, e1 + 100, VE);
    const p2 = BD.posV3(b.lon1, b.lat0, e1 + 100, VE);
    const p3 = BD.posV3(b.lon1, b.lat1, e1 + 100, VE);
    const p4 = BD.posV3(b.lon0, b.lat1, e1 + 100, VE);

    const points = [p1, p2, p3, p4, p1];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffd700, linewidth: 3 });

    footprintMesh = new THREE.Line(geo, mat);
    scene.add(footprintMesh);
  }

  // World-space anchor for the local domain's centre, at valley-floor elevation
  // plus a small clearance. Used by ViewManager as the starting camera point for
  // the zoom-out flight, so the flight always starts "at" the real Rishiganga
  // location instead of a hardcoded guess.
  //
  // Elevation is a fixed ~1900m (Joshimath / Vishnuprayag valley floor), not
  // sampleElev(): the basin DEM is only a 64x64 grid over the whole 77.5-89.5E,
  // 21.3-31.5N box (~20 km per cell), so a single sample this close to the
  // Himalayan front can land on a nearby ridge instead of the valley, sending
  // the flight's starting height thousands of metres too high.
  const LOCAL_DOMAIN_VALLEY_ELEV_M = 1900;

  function getLocalDomainAnchor() {
    const BD = root.BasinData;
    const b = LOCAL_DOMAIN_BOX;
    const lon = (b.lon0 + b.lon1) / 2, lat = (b.lat0 + b.lat1) / 2;
    return BD.posV3(lon, lat, LOCAL_DOMAIN_VALLEY_ELEV_M + 40, VE);
  }

  function updateWavePulse() {
    // Pulse animation logic
  }

  root.BasinView = BasinView;

})(typeof window !== 'undefined' ? window : globalThis);
