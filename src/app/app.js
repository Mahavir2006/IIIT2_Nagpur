/* DAM SYSTEM prototype: 3D rendering, chapters, charts, evacuation, validation and CAP warnings.
   Depends on THREE (r147 UMD), THREE.OrbitControls and window.DamCore (src/core/damcore.js). */
(function () {
'use strict';
const C = window.DamCore;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const SC = C.LX / 64, VE = 1.3, EREF = 1300;
const wy = e => (e - EREF) * VE / SC, wx = x => x / SC - 32, wz = z => z / SC - 16;
const V3 = (x, z, e) => new THREE.Vector3(wx(x), wy(e), wz(z));
const fmt = (v, d) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });
const clock = s => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return 'T+' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0'); };
const mins = s => s < 0 ? 'not reached' : 'T+' + Math.round(s / 60) + ' min';
const mmss = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const app = { ch: 0, playing: false, view: 0, env: false, WX: 3, scen: 'large', sur: {}, mc: null, calib: null, qHist: [], started: false, done: false, follow: false, lakeMode: 'none', days: 21, frame: 0, fps: 60, simRate: 0, washed: {}, tour: null };
const OBS = { hp1: 25, hp2: 16 };

/* ================= boot ================= */
function boot() {
  $('#loadMsg').textContent = 'Building terrain, river network and lake storage tables';
  setTimeout(() => {
    try {
      C.init();
      for (const id of ['small', 'medium', 'large', 'extreme', 'hindcast']) app.sur[id] = rapid(C.SCEN[id]);
      C.setScenario(C.SCEN[app.scen]);
      buildScene();
      buildUI();
      if (window.ViewManager) window.ViewManager.init();
      goChapter(0, true);
      $('#loader').style.opacity = 0; setTimeout(() => $('#loader').remove(), 700);
      requestAnimationFrame(frame);
    } catch (err) { $('#loadMsg').textContent = 'The prototype failed to start: ' + err.message + '. Reload the page to try again.'; console.error(err); }
  }, 60);
}
function restoreDam() { const P = C.P; C.buildDam(P.mode === 'hindcast' ? 12 : P.Hd); }
function rapid(p) { const r = C.runScenarioSurrogate(p); restoreDam(); return r; }

/* ================= scene ================= */
let renderer, scene, camera, controls, sun, terrain, tPos, tCol, baseCol, water, wPos, wA, wF, lake, river, pts, handoff, houses, roofs, houseList = [], boulders, boulderList = [], bridges = {}, road, roadPts = [], upstream = null;
const uniCommon = { uTime: { value: 0 }, uSun: { value: new THREE.Vector3(-0.55, 0.62, 0.55).normalize() }, uSky: { value: new THREE.Color('#bcd3e2') }, uFog: { value: new THREE.Color('#cbd8e0') }, uFogR: { value: new THREE.Vector2(55, 190) } };

function buildScene() {
  const host = $('#stage');
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcbd8e0, 55, 190);
  camera = new THREE.PerspectiveCamera(42, host.clientWidth / host.clientHeight, 0.05, 900);
  camera.position.set(-10, 34, 42);
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  if (C) { C.controls = controls; C.camera = camera; }
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = 1.48; controls.minDistance = 0.6; controls.maxDistance = 140; controls.target.set(0, 4, 0);
  controls.addEventListener('start', () => { app.cam = null; app.tour = null; if (app.follow) setFollow(false); const h = $('#hint'); if (h) h.style.display = 'none'; });

  scene.add(new THREE.HemisphereLight(0xdbe8f2, 0x5e5040, 0.75));
  sun = new THREE.DirectionalLight(0xfff0dc, 2.3);
  sun.position.copy(uniCommon.uSun.value).multiplyScalar(80);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 30, bottom: -30, near: 1, far: 220 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);

  // sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { uSun: uniCommon.uSun },
    vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }',
    fragmentShader: 'uniform vec3 uSun; varying vec3 vD; void main(){ float h=max(vD.y,0.0); vec3 zen=vec3(0.36,0.57,0.78); vec3 hor=vec3(0.80,0.85,0.88); vec3 c=mix(hor,zen,pow(h,0.55)); float s=max(dot(normalize(vD),uSun),0.0); c+=vec3(1.0,0.93,0.8)*(pow(s,700.0)*1.2+pow(s,12.0)*0.12); if(vD.y<0.0) c=hor; gl_FragColor=vec4(c,1.0); }'
  }));
  sky.renderOrder = -10; scene.add(sky);

  buildTerrain(); buildRiver(); buildLake(); buildWater(); buildParticles(); buildStructures(); buildLabels();
  window.addEventListener('resize', onResize);
}
function onResize() { const h = $('#stage'); camera.aspect = h.clientWidth / h.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(h.clientWidth, h.clientHeight); }

/* ----- terrain ----- */
const lin = c => Math.pow(c, 2.2);
function hex3(h) { const n = parseInt(h.slice(1), 16); return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)]; }
const PAL = { gravel: hex3('#8e877b'), forest: hex3('#3b4731'), forest2: hex3('#55603f'), meadow: hex3('#7f7a52'), rock: hex3('#72695f'), rock2: hex3('#4f4a44'), snow: hex3('#f1f4f6'), debris: hex3('#382d24'), damCrest: hex3('#aa9885'), debrisCut: hex3('#70422d'), silt: hex3('#8a8272') };
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function buildTerrain() {
  const { NX, NZ, N, DX } = C;
  const g = new THREE.BufferGeometry();
  tPos = new Float32Array(N * 3); tCol = new Float32Array(N * 3); baseCol = new Float32Array(N * 3);
  for (let k = 0; k < N; k++) { const i = k % NX, j = (k / NX) | 0; tPos[k * 3] = wx((i + 0.5) * DX); tPos[k * 3 + 1] = wy(C.b[k]); tPos[k * 3 + 2] = wz((j + 0.5) * DX); }
  const idx = new Uint32Array((NX - 1) * (NZ - 1) * 6); let p = 0;
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1; idx[p++] = a; idx[p++] = c; idx[p++] = b; idx[p++] = b; idx[p++] = c; idx[p++] = d; }
  g.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const nrm = g.attributes.normal.array;
  for (let k = 0; k < N; k++) {
    const x = (k % NX + 0.5) * DX, z = ((k / NX | 0) + 0.5) * DX, e = C.b0[k], ny = nrm[k * 3 + 1];
    const n = C.fbm(x / 650, z / 650, 3), n2 = C.fbm(x / 160 + 9, z / 160, 2);
    const dmin = Math.min(C.dC[k], C.dT[k]);
    let col;
    if (dmin < 110 && ny > 0.8) col = mix3(PAL.gravel, PAL.rock, 0.25 + n2 * 0.3);
    else {
      const forest = mix3(PAL.forest, PAL.forest2, clamp(0.5 + n * 1.2, 0, 1));
      const low = mix3(forest, PAL.meadow, sstep(3350, 3750, e + n * 250));
      const rock = mix3(PAL.rock, PAL.rock2, clamp(0.5 + n2, 0, 1));
      col = mix3(low, rock, 1 - sstep(0.52, 0.72, ny));
      const sl = 4250 + n * 260; const sn = sstep(sl, sl + 350, e) * sstep(0.5, 0.72, ny) + sstep(sl + 900, sl + 1300, e) * 0.5;
      col = mix3(col, PAL.snow, clamp(sn, 0, 1));
    }
    const v = 1 + n2 * 0.12; baseCol[k * 3] = col[0] * v; baseCol[k * 3 + 1] = col[1] * v; baseCol[k * 3 + 2] = col[2] * v;
  }
  tCol.set(baseCol);
  terrain = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97, metalness: 0 }));
  terrain.castShadow = true; terrain.receiveShadow = true; scene.add(terrain);
  syncDam(true);
}
function syncDam(normals) {
  const L = C.NEARDAM; if (!L) return;
  const zc = C.DAM.zc;
  for (let q = 0; q < L.length; q++) {
    const k = L[q]; tPos[k * 3 + 1] = wy(C.b[k]);
    const bDamVal = C.bDam[k], bVal = C.b[k], b0Val = C.b0[k];
    const raised = bVal - b0Val, carved = bDamVal - bVal;
    if (carved > 0.8) {
      const t = clamp(carved / 20, 0, 1);
      const c = mix3(PAL.debrisCut, PAL.gravel, 0.2 + 0.5 * t);
      tCol[k * 3] = c[0]; tCol[k * 3 + 1] = c[1]; tCol[k * 3 + 2] = c[2];
    } else if (raised > 0.5) {
      const distFromCrest = Math.abs(bVal - zc);
      let c = distFromCrest < 3.0 ? mix3(PAL.damCrest, PAL.debris, 0.35) : mix3(PAL.debris, PAL.rock2, 0.15 + 0.35 * C.vnoise(k * 0.37, 1.3));
      tCol[k * 3] = c[0]; tCol[k * 3 + 1] = c[1]; tCol[k * 3 + 2] = c[2];
    } else if (bDamVal - b0Val > 0.5) {
      const c = mix3(PAL.silt, PAL.gravel, 0.5);
      tCol[k * 3] = c[0]; tCol[k * 3 + 1] = c[1]; tCol[k * 3 + 2] = c[2];
    } else {
      tCol[k * 3] = baseCol[k * 3]; tCol[k * 3 + 1] = baseCol[k * 3 + 1]; tCol[k * 3 + 2] = baseCol[k * 3 + 2];
    }
  }
  terrain.geometry.attributes.position.needsUpdate = true; terrain.geometry.attributes.color.needsUpdate = true;
  if (normals) terrain.geometry.computeVertexNormals();
}
function paintSilt() {
  const L = C.actList;
  for (let q = 0; q < L.length; q++) { const k = L[q], m = C.maxd[k]; if (m < 0.3) continue; const t = Math.min(0.85, m / 2.5); const c = mix3([baseCol[k * 3], baseCol[k * 3 + 1], baseCol[k * 3 + 2]], PAL.silt, t); tCol[k * 3] = c[0]; tCol[k * 3 + 1] = c[1]; tCol[k * 3 + 2] = c[2]; }
  terrain.geometry.attributes.color.needsUpdate = true;
}
function resetSilt() { const L = C.actList; for (let q = 0; q < L.length; q++) { const k = L[q]; tCol[k * 3] = baseCol[k * 3]; tCol[k * 3 + 1] = baseCol[k * 3 + 1]; tCol[k * 3 + 2] = baseCol[k * 3 + 2]; } terrain.geometry.attributes.color.needsUpdate = true; }

/* ----- shaders ----- */
const NOISE_GLSL = 'float h21(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); } float vn(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),u.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),u.x),u.y); }';
const WATER_VS = 'attribute vec4 aW; attribute vec2 aF; varying vec4 vW; varying vec2 vF; varying vec3 vP; varying float vDepth; void main(){ vW=aW; vF=aF; vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz; vec4 mv=viewMatrix*wp; vDepth=-mv.z; gl_Position=projectionMatrix*mv; }';
const WATER_FS = `uniform float uTime; uniform float uMode; uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uFog; uniform vec2 uFogR;
varying vec4 vW; varying vec2 vF; varying vec3 vP; varying float vDepth; ${NOISE_GLSL}
vec3 ramp5(float t, vec3 a, vec3 b, vec3 c, vec3 d, vec3 e){ t=clamp(t,0.0,1.0)*4.0; if(t<1.0) return mix(a,b,t); if(t<2.0) return mix(b,c,t-1.0); if(t<3.0) return mix(c,d,t-2.0); return mix(d,e,t-3.0); }
void main(){
  float d=vW.x; if(d<0.03) discard;
  vec3 N=normalize(cross(dFdx(vP),dFdy(vP))); if(N.y<0.0) N=-N;
  float sp=length(vF); vec2 dir= sp>0.05 ? vF/sp : vec2(1.0,0.0);
  vec2 q=vP.xz*10.0; float adv=uTime*min(sp,25.0)*0.30;
  float n1=vn(q-dir*adv); float n2=vn(q*2.7-dir*adv*1.7+7.3);
  N=normalize(N+vec3((n1-0.5)*0.55,0.0,(n2-0.5)*0.55));
  vec3 V=normalize(cameraPosition-vP);
  float fr=pow(1.0-max(dot(N,V),0.0),3.0); float dif=max(dot(N,uSun),0.0);
  vec3 col; float a; int m=int(uMode+0.5);
  if(m==0){
    col=mix(vec3(0.60,0.53,0.43),vec3(0.33,0.28,0.22),smoothstep(0.3,6.0,d));
    float foam=smoothstep(4.0,13.0,sp)*smoothstep(0.48,0.85,n1*0.55+n2*0.55);
    foam+=(1.0-smoothstep(0.05,0.9,d))*0.45*n2;
    col=mix(col,vec3(0.92,0.90,0.86),clamp(foam,0.0,1.0)*0.85);
    col*=0.58+0.52*dif; col=mix(col,uSky,fr*0.45);
    vec3 H=normalize(uSun+V); col+=vec3(1.0,0.95,0.85)*pow(max(dot(N,H),0.0),90.0)*0.7;
    a=smoothstep(0.03,0.5,d)*0.96;
  } else {
    if(m==1) col=ramp5(d/12.0,vec3(0.80,0.93,0.97),vec3(0.45,0.76,0.90),vec3(0.18,0.50,0.78),vec3(0.16,0.27,0.60),vec3(0.30,0.10,0.45));
    else if(m==2) col=ramp5(vW.y/20.0,vec3(1.0,0.95,0.70),vec3(0.98,0.78,0.40),vec3(0.93,0.49,0.25),vec3(0.80,0.20,0.20),vec3(0.45,0.05,0.18));
    else if(m==3){ if(vW.z<0.0) discard; col=ramp5(vW.z/60.0,vec3(0.85,0.15,0.15),vec3(0.95,0.55,0.15),vec3(0.95,0.85,0.30),vec3(0.45,0.75,0.45),vec3(0.25,0.50,0.80)); float c=abs(fract(vW.z/5.0)-0.5); col*=mix(0.45,1.0,smoothstep(0.0,0.08,c)); }
    else { float hz=vW.w; col= hz<0.5 ? vec3(0.45,0.75,0.45) : (hz<1.5 ? vec3(0.95,0.85,0.30) : (hz<7.0 ? vec3(0.95,0.55,0.15) : (hz<20.0 ? vec3(0.85,0.20,0.15) : vec3(0.50,0.05,0.15)))); }
    col*=0.72+0.35*dif; a=0.93*smoothstep(0.03,0.25,d);
  }
  float f=smoothstep(uFogR.x,uFogR.y,vDepth); col=mix(col,uFog,f);
  gl_FragColor=vec4(col,a);
}`;

/* ----- river ribbon (base flow) ----- */
function ribbon(line, s0, s1, halfW, pos, idx) {
  const base = pos.length / 3;
  let n = 0;
  for (let s = s0; s <= s1; s += 60) {
    const c = C.lineAt(line, s), t = C.lineTan(line, s), nx = -t[1], nz = t[0];
    for (const side of [-1, 1]) { const x = c[0] + nx * halfW * side, z = c[1] + nz * halfW * side; const e = Math.min(C.sampleArr(C.b0, c[0], c[1]), C.sampleArr(C.b0, x, z)) + 1.2; pos.push(wx(x), wy(e), wz(z)); }
    n++;
  }
  for (let i = 0; i < n - 1; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
}
function buildRiver() {
  const pos = [], idx = [];
  ribbon(C.MAIN, C.S_IN + 40, C.S_OUT - 20, 24, pos, idx);
  ribbon(C.TRIB, 300, C.TRIB.L - 40, 18, pos, idx);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  river = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: uniCommon, extensions: { derivatives: true },
    vertexShader: 'varying vec3 vP; varying float vDepth; void main(){ vec4 wp=modelMatrix*vec4(position,1.0); vP=wp.xyz; vec4 mv=viewMatrix*wp; vDepth=-mv.z; gl_Position=projectionMatrix*mv; }',
    fragmentShader: `uniform float uTime; uniform vec3 uSky; uniform vec3 uFog; uniform vec2 uFogR; varying vec3 vP; varying float vDepth; ${NOISE_GLSL}
      void main(){ float n=vn(vP.xz*40.0+uTime*0.6)*0.6+vn(vP.xz*90.0-uTime*0.9)*0.4; vec3 c=mix(vec3(0.44,0.60,0.64),vec3(0.80,0.88,0.90),smoothstep(0.62,0.9,n)); c=mix(c,uFog,smoothstep(uFogR.x,uFogR.y,vDepth)); gl_FragColor=vec4(c,0.92); }`
  }));
  river.renderOrder = 1; scene.add(river);
}

/* ----- lake ----- */
function buildLake() {
  const { NX, N, DX } = C; const set = new Int32Array(N).fill(-1); const list = [];
  for (const k of C.LAKECELLS) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const q = k + dj * NX + di; if (q >= 0 && q < N && set[q] < 0) { set[q] = list.length; list.push(q); } }
  const pos = new Float32Array(list.length * 3), msk = new Float32Array(list.length);
  list.forEach((k, v) => { pos[v * 3] = wx((k % NX + 0.5) * DX); pos[v * 3 + 1] = 0; pos[v * 3 + 2] = wz(((k / NX | 0) + 0.5) * DX); msk[v] = C.lakeCell[k]; });
  const idx = [];
  list.forEach(k => { const a = set[k], b = set[k + 1], c = set[k + NX], d = set[k + NX + 1]; if (a >= 0 && b >= 0 && c >= 0 && d >= 0) idx.push(a, c, b, b, c, d); });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aM', new THREE.BufferAttribute(msk, 1)); g.setIndex(idx);
  const u = Object.assign({ uLevel: { value: 0 } }, uniCommon);
  lake = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, uniforms: u, extensions: { derivatives: true },
    vertexShader: 'uniform float uLevel; attribute float aM; varying float vM; varying vec3 vP; varying float vDepth; void main(){ vM=aM; vec4 wp=modelMatrix*vec4(position.x,uLevel,position.z,1.0); vP=wp.xyz; vec4 mv=viewMatrix*wp; vDepth=-mv.z; gl_Position=projectionMatrix*mv; }',
    fragmentShader: `uniform float uTime; uniform vec3 uSun; uniform vec3 uSky; uniform vec3 uFog; uniform vec2 uFogR; varying float vM; varying vec3 vP; varying float vDepth; ${NOISE_GLSL}
      void main(){ if(vM<0.35) discard; float n1=vn(vP.xz*24.0+vec2(uTime*0.15,0.0)), n2=vn(vP.xz*55.0-vec2(0.0,uTime*0.2)); vec3 N=normalize(vec3((n1-0.5)*0.25,1.0,(n2-0.5)*0.25)); vec3 V=normalize(cameraPosition-vP);
      float fr=pow(1.0-max(dot(N,V),0.0),4.0); vec3 c=mix(vec3(0.33,0.50,0.52),vec3(0.20,0.33,0.36),0.5+0.5*n1); c=mix(c,uSky,fr*0.6); vec3 H=normalize(uSun+V); c+=vec3(1.0,0.96,0.88)*pow(max(dot(N,H),0.0),120.0)*0.8;
      c=mix(c,uFog,smoothstep(uFogR.x,uFogR.y,vDepth)); gl_FragColor=vec4(c,0.93*smoothstep(0.35,0.9,vM)); }`
  }));
  lake.renderOrder = 2; scene.add(lake);
}

/* ----- flood water ----- */
let wMap;
function buildWater() {
  const { NX, N, DX } = C, act = C.actList; wMap = new Int32Array(N).fill(-1); act.forEach((k, q) => wMap[k] = q);
  const n = act.length; wPos = new Float32Array(n * 3); wA = new Float32Array(n * 4); wF = new Float32Array(n * 2);
  for (let q = 0; q < n; q++) { const k = act[q]; wPos[q * 3] = wx((k % NX + 0.5) * DX); wPos[q * 3 + 1] = wy(C.b[k]) - 0.1; wPos[q * 3 + 2] = wz(((k / NX | 0) + 0.5) * DX); }
  const idx = [];
  for (let q = 0; q < n; q++) { const k = act[q]; if (k % NX === NX - 1) continue; const a = q, b = wMap[k + 1], c = wMap[k + NX], d = wMap[k + NX + 1]; if (b >= 0 && c >= 0 && d >= 0) idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(wPos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aW', new THREE.BufferAttribute(wA, 4).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aF', new THREE.BufferAttribute(wF, 2).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(idx);
  const u = Object.assign({ uMode: { value: 0 } }, uniCommon);
  water = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, uniforms: u, vertexShader: WATER_VS, fragmentShader: WATER_FS, extensions: { derivatives: true } }));
  water.frustumCulled = false; water.renderOrder = 3; scene.add(water);
}
let wSurf = null;
function updateWater() {
  const act = C.actList, n = act.length, env = app.env || app.view === 3, WX = app.WX, NX = C.NX;
  if (!wSurf) wSurf = new Float32Array(n);
  for (let q = 0; q < n; q++) {
    const k = act[q], dd = env ? C.maxd[k] : C.d[k];
    const sp = env ? C.maxv[k] : Math.hypot(C.u[k], C.w[k]);
    wSurf[q] = dd > 0.03 ? wy(C.b[k] + dd * WX) + 0.004 : -1e9;
    wA[q * 4] = dd; wA[q * 4 + 1] = sp; wA[q * 4 + 2] = C.arr[k] >= 0 ? C.arr[k] / 60 : -1; wA[q * 4 + 3] = env ? C.hzd[k] : dd * sp;
    wF[q * 2] = env ? 0 : C.u[k]; wF[q * 2 + 1] = env ? 0 : C.w[k];
  }
  // dry vertices next to wet ones carry the neighbouring surface, so the terrain clips a natural shoreline
  for (let q = 0; q < n; q++) {
    if (wSurf[q] > -1e8) { wPos[q * 3 + 1] = wSurf[q]; continue; }
    const k = act[q]; let s = -1e9, a = -1;
    const nb = [wMap[k - 1], wMap[k + 1], wMap[k - NX], wMap[k + NX]];
    for (const j of nb) if (j >= 0 && wSurf[j] > s) { s = wSurf[j]; a = j; }
    if (a >= 0) { wPos[q * 3 + 1] = s; wA[q * 4] = Math.max(0.35, wA[a * 4] * 0.6); wA[q * 4 + 1] = wA[a * 4 + 1]; wA[q * 4 + 2] = wA[a * 4 + 2]; wA[q * 4 + 3] = wA[a * 4 + 3]; }
    else wPos[q * 3 + 1] = wy(C.b[k]) - 0.08;
  }
  const at = water.geometry.attributes; at.position.needsUpdate = true; at.aW.needsUpdate = true; at.aF.needsUpdate = true;
}

/* ----- SPH particles ----- */
function buildParticles() {
  const NP = C.NP; const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(NP), 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(NP), 1).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  pts = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: Object.assign({ uScale: { value: 800 }, uSize: { value: 36 / SC } }, uniCommon),
    vertexShader: 'uniform float uScale; uniform float uSize; attribute float aS; attribute float aA; varying float vS; varying float vA; void main(){ vS=aS; vA=aA; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=clamp(uSize*uScale/-mv.z,1.5,90.0); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'varying float vS; varying float vA; void main(){ vec2 c=gl_PointCoord-0.5; float r=length(c); if(r>0.5) discard; float a=smoothstep(0.5,0.08,r); vec3 mud=vec3(0.50,0.43,0.34); vec3 foam=vec3(0.95,0.93,0.89); vec3 col=mix(mud,foam,clamp(smoothstep(8.0,26.0,vS)*0.75+(1.0-smoothstep(0.0,5.0,vA))*0.35,0.0,1.0)); col*=0.78+0.4*(0.5-c.y); gl_FragColor=vec4(col,a*0.88); }'
  }));
  pts.frustumCulled = false; pts.renderOrder = 4; scene.add(pts);
}
function updateParticles() {
  const n = C.ST.n, g = pts.geometry, p = g.attributes.position.array, s = g.attributes.aS.array, a = g.attributes.aA.array;
  for (let i = 0; i < n; i++) { p[i * 3] = wx(C.px[i]); p[i * 3 + 1] = wy(C.py[i] + 4); p[i * 3 + 2] = wz(C.pz[i]); s[i] = Math.hypot(C.pvx[i], C.pvy[i], C.pvz[i]); a[i] = C.page[i]; }
  g.setDrawRange(0, n); g.attributes.position.needsUpdate = true; g.attributes.aS.needsUpdate = true; g.attributes.aA.needsUpdate = true;
  pts.material.uniforms.uScale.value = renderer.domElement.clientHeight / (2 * Math.tan(camera.fov * Math.PI / 360));
}

/* ----- structures ----- */
function riverPt(s, eAdd) { const c = C.lineAt(C.MAIN, s), k = C.riverCellAt(s); return { x: c[0], z: c[1], e: C.b0[k] + (eAdd || 0), t: C.lineTan(C.MAIN, s) }; }
function orientedBox(w, h, l, mat, s, eBase, side, off) {
  const r = riverPt(s); const n = [-r.t[1], r.t[0]]; const x = r.x + n[0] * (off || 0) * (side || 1), z = r.z + n[1] * (off || 0) * (side || 1);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w / SC, h * VE / SC, l / SC), mat);
  m.position.set(wx(x), wy(eBase + h / 2), wz(z)); m.rotation.y = -Math.atan2(r.t[1], r.t[0]); m.castShadow = true; m.receiveShadow = true; return m;
}
function buildStructures() {
  const concrete = new THREE.MeshStandardMaterial({ color: 0xc8c4bb, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.7 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8c9296, roughness: 0.5, metalness: 0.4 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x566b7a, roughness: 0.6 });
  const grp = new THREE.Group(); scene.add(grp);
  // Rishiganga HEP barrage and powerhouse
  const s1 = C.SITE.raini - 620, r1 = riverPt(s1);
  grp.add(orientedBox(14, 13, 130, concrete, s1, r1.e));
  for (let g = -2; g <= 2; g++) grp.add(orientedBox(16, 6, 14, dark, s1, r1.e + 9, 1, g * 22));
  const hp1 = C.ASSETS.find(a => a.id === 'hp1'); const ph1 = new THREE.Mesh(new THREE.BoxGeometry(45 / SC, 16 * VE / SC, 26 / SC), concrete); ph1.position.copy(V3(hp1.x, hp1.z, hp1.y + 8)); ph1.rotation.y = -Math.atan2(r1.t[1], r1.t[0]); ph1.castShadow = true; grp.add(ph1);
  const rf1 = new THREE.Mesh(new THREE.BoxGeometry(47 / SC, 2 * VE / SC, 28 / SC), roofMat); rf1.position.copy(V3(hp1.x, hp1.z, hp1.y + 17)); rf1.rotation.y = ph1.rotation.y; grp.add(rf1);
  // Tapovan Vishnugad barrage
  const s2 = C.SITE.tapovan - 200, r2 = riverPt(s2);
  grp.add(orientedBox(22, 22, 300, concrete, s2, r2.e));
  for (let g = -4; g <= 4; g++) grp.add(orientedBox(24, 8, 18, dark, s2, r2.e + 16, 1, g * 28));
  grp.add(orientedBox(60, 8, 50, concrete, s2 + 180, r2.e + 2, 1, 170));
  const tu = C.ASSETS.find(a => a.id === 'tunnel'); const portal = new THREE.Mesh(new THREE.BoxGeometry(22 / SC, 14 * VE / SC, 22 / SC), dark); portal.position.copy(V3(tu.x, tu.z, tu.y + 7)); grp.add(portal);
  // bridges
  for (const rd of C.ROADS) if (rd.kind === 'bridge') {
    const r = riverPt(rd.s0); const deck = r.e + rd.h;
    const bg = new THREE.Group();
    bg.add(orientedBox(10, 3, 190, steel, rd.s0, deck - 3));
    for (const o of [-45, 45]) bg.add(orientedBox(6, rd.h - 2, 6, concrete, rd.s0, r.e, 1, o));
    grp.add(bg); bridges[rd.id] = bg;
  }
  // houses
  const rng = C.mulberry32(11); const places = [];
  const addCluster = (x0, z0, e0, count, rad, tol, tag) => {
    let tries = 0, made = 0;
    while (made < count && tries < count * 60) {
      tries++; const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * rad; const x = x0 + Math.cos(a) * r, z = z0 + Math.sin(a) * r;
      if (x < 100 || z < 100 || x > C.LX - 100 || z > C.LZ - 100) continue;
      const e = C.sampleArr(C.b0, x, z); if (Math.abs(e - e0) > tol) continue;
      const gx = (C.sampleArr(C.b0, x + 25, z) - C.sampleArr(C.b0, x - 25, z)) / 50, gz = (C.sampleArr(C.b0, x, z + 25) - C.sampleArr(C.b0, x, z - 25)) / 50;
      if (Math.hypot(gx, gz) > 0.55) continue;
      const k = C.cellAt(x, z); if (C.dC[k] < 45) continue;
      places.push({ x, z, e, w: 12 + rng() * 7, d: 9 + rng() * 5, h: 6 + rng() * 3, rot: rng() * Math.PI, tag }); made++;
    }
  };
  C.ASSETS.forEach((a, i) => {
    if (a.kind === 'village') addCluster(a.x, a.z, a.y, Math.min(34, Math.max(9, Math.round(a.pop / 12))), 260, 22, i);
    if (a.kind === 'town') addCluster(a.x, a.z, a.y, 90, 900, 170, i);
  });
  // upstream villages on the Dhauliganga road, reached through Raini bridge
  { const s = C.TRIB.L * 0.42, c = C.lineAt(C.TRIB, s), t = C.lineTan(C.TRIB, s), n = [-t[1], t[0]], bed = C.sampleArr(C.b0, c[0], c[1]); let o = 0; for (; o < 2500; o += 10) if (C.sampleArr(C.b0, c[0] + n[0] * o, c[1] + n[1] * o) > bed + 45) break; o += 40; upstream = { x: c[0] + n[0] * o, z: c[1] + n[1] * o }; upstream.e = C.sampleArr(C.b0, upstream.x, upstream.z); addCluster(upstream.x, upstream.z, upstream.e, 26, 320, 25, -1); }
  const HS = 1.7, nH = places.length;
  houses = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9 }), nH);
  const rg = new THREE.ConeGeometry(0.74, 1, 4); rg.rotateY(Math.PI / 4);
  roofs = new THREE.InstancedMesh(rg, new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.2 }), nH);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), col = new THREE.Color();
  const walls = ['#d9d2c3', '#bfb4a3', '#e6e1d6', '#a99d8b'], tin = ['#3e6c8d', '#9c3b2f', '#56704f', '#6c6d72', '#2f5877'];
  places.forEach((h, i) => {
    Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.rot);
    P.set(wx(h.x), wy(h.e + h.h / 2), wz(h.z)); S.set(h.w * HS / SC, h.h * HS * VE / SC, h.d * HS / SC); M.compose(P, Q, S); houses.setMatrixAt(i, M);
    col.set(walls[i % walls.length]); houses.setColorAt(i, col);
    P.set(wx(h.x), wy(h.e + h.h + 2.2), wz(h.z)); S.set(h.w * HS * 1.1 / SC, 4.4 * HS * VE / SC, h.d * HS * 1.1 / SC); M.compose(P, Q, S); roofs.setMatrixAt(i, M);
    col.set(tin[(i * 7) % tin.length]); roofs.setColorAt(i, col);
    houseList.push({ k: h.tag >= 0 ? C.ASSETS[h.tag].cell : -1, e: h.e, flooded: false, wall: walls[i % walls.length] });
  });
  houses.castShadow = roofs.castShadow = true; houses.receiveShadow = true; scene.add(houses); scene.add(roofs);
  // boulders on the debris dam
  const bg = new THREE.IcosahedronGeometry(1, 0);
  boulders = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: 0x6e665d, roughness: 1, flatShading: true }), 220); boulders.castShadow = true; scene.add(boulders);
  placeBoulders();
  // road
  const rp = [];
  for (let s = C.SITE.raini + 260; s <= C.SITE.joshimath + 400; s += 120) { const r = riverPt(s), n = [-r.t[1], r.t[0]]; let o = 0; for (; o < 1500; o += 8) if (C.sampleArr(C.b0, r.x + n[0] * o, r.z + n[1] * o) >= r.e + 16) break; const x = r.x + n[0] * o, z = r.z + n[1] * o; rp.push({ x, z, e: C.sampleArr(C.b0, x, z), k: C.riverCellAt(s), s }); }
  for (let s = C.TRIB.L - 250; s >= C.TRIB.L * 0.42; s -= 120) { const c = C.lineAt(C.TRIB, s), t = C.lineTan(C.TRIB, s), n = [t[1], -t[0]], bed = C.sampleArr(C.b0, c[0], c[1]); let o = 0; for (; o < 1500; o += 8) if (C.sampleArr(C.b0, c[0] + n[0] * o, c[1] + n[1] * o) >= bed + 20) break; const x = c[0] + n[0] * o, z = c[1] + n[1] * o; rp.unshift({ x, z, e: C.sampleArr(C.b0, x, z), k: -1, s: -1 }); }
  roadPts = rp;
  const pos = new Float32Array(rp.length * 3), rc = new Float32Array(rp.length * 3);
  rp.forEach((p, i) => { pos[i * 3] = wx(p.x); pos[i * 3 + 1] = wy(p.e) + 0.02; pos[i * 3 + 2] = wz(p.z); rc[i * 3] = 0.93; rc[i * 3 + 1] = 0.86; rc[i * 3 + 2] = 0.66; });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); lg.setAttribute('color', new THREE.BufferAttribute(rc, 3));
  road = new THREE.Line(lg, new THREE.LineBasicMaterial({ vertexColors: true })); scene.add(road);
  // handoff plane between SPH near field and the 2D solver
  const rh = riverPt(C.SITE.hand);
  handoff = new THREE.Mesh(new THREE.PlaneGeometry(1500 / SC, 420 * VE / SC), new THREE.MeshBasicMaterial({ color: 0x8fd3e8, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false }));
  handoff.position.copy(V3(rh.x, rh.z, rh.e + 170)); handoff.rotation.y = Math.atan2(rh.t[0], rh.t[1]);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(handoff.geometry), new THREE.LineBasicMaterial({ color: 0x8fd3e8, transparent: true, opacity: 0.8 })); handoff.add(edge);
  handoff.visible = false; scene.add(handoff);
  buildDamOverlay();
}
let damGroup, damCrestLine;
function buildDamOverlay() {
  if (damGroup) scene.remove(damGroup);
  damGroup = new THREE.Group();
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(10 * 3), 3).setUsage(THREE.DynamicDrawUsage));
  damCrestLine = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  damGroup.add(damCrestLine);
  scene.add(damGroup);
  updateDamOverlay();
}
function updateDamOverlay() {
  if (!damCrestLine) return;
  if (C.P.mode === 'hindcast') { damCrestLine.visible = false; return; }
  damCrestLine.visible = true;
  const zc = C.DAM.zc, zb = C.ST.breach ? C.ST.breach.zb : zc, B = C.ST.breach ? C.ST.breach.B : 4;
  const damCenter = riverPt(C.SITE.dam), n = [-damCenter.t[1], damCenter.t[0]];
  const pos = damCrestLine.geometry.attributes.position.array, col = damCrestLine.geometry.attributes.color.array;
  const halfB = B * 0.5, lEnd = [damCenter.x - n[0] * 320, damCenter.z - n[1] * 320], rEnd = [damCenter.x + n[0] * 320, damCenter.z + n[1] * 320];
  const lNotch = [damCenter.x - n[0] * halfB, damCenter.z - n[1] * halfB], rNotch = [damCenter.x + n[0] * halfB, damCenter.z + n[1] * halfB];
  pos[0] = wx(lEnd[0]); pos[1] = wy(zc + 4); pos[2] = wz(lEnd[1]); pos[3] = wx(lNotch[0]); pos[4] = wy(zc + 4); pos[5] = wz(lNotch[1]);
  pos[6] = wx(lNotch[0]); pos[7] = wy(zc + 4); pos[8] = wz(lNotch[1]); pos[9] = wx(lNotch[0]); pos[10] = wy(zb + 1.5); pos[11] = wz(lNotch[1]);
  pos[12] = wx(lNotch[0]); pos[13] = wy(zb + 1.5); pos[14] = wz(lNotch[1]); pos[15] = wx(rNotch[0]); pos[16] = wy(zb + 1.5); pos[17] = wz(rNotch[1]);
  pos[18] = wx(rNotch[0]); pos[19] = wy(zb + 1.5); pos[20] = wz(rNotch[1]); pos[21] = wx(rNotch[0]); pos[22] = wy(zc + 4); pos[23] = wz(rNotch[1]);
  pos[24] = wx(rNotch[0]); pos[25] = wy(zc + 4); pos[26] = wz(rNotch[1]); pos[27] = wx(rEnd[0]); pos[28] = wy(zc + 4); pos[29] = wz(rEnd[1]);
  for (let i = 0; i < 10; i++) {
    const isNotch = (i >= 1 && i <= 3);
    col[i * 3] = isNotch ? 0.98 : 0.94; col[i * 3 + 1] = isNotch ? 0.35 : 0.72; col[i * 3 + 2] = isNotch ? 0.22 : 0.35;
  }
  damCrestLine.geometry.attributes.position.needsUpdate = true; damCrestLine.geometry.attributes.color.needsUpdate = true;
}
function placeBoulders() {
  boulderList = []; const rng = C.mulberry32(5); const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  const cand = Array.from(C.NEARDAM).filter(k => C.bDam[k] > C.b0[k] + 6);
  for (let i = 0; i < 220; i++) {
    if (!cand.length) { M.makeScale(0, 0, 0); boulders.setMatrixAt(i, M); continue; }
    const k = cand[Math.floor(rng() * cand.length)]; const x = (k % C.NX + rng()) * C.DX, z = ((k / C.NX | 0) + rng()) * C.DX; const r = 4 + rng() * rng() * 16;
    boulderList.push({ k, x, z, r, rot: rng() * 6 });
    Q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, 0)); P.set(wx(x), wy(C.bDam[k] + r * 0.3), wz(z)); S.set(r / SC, r * 0.8 * VE / SC, r * 0.9 / SC); M.compose(P, Q, S); boulders.setMatrixAt(i, M);
  }
  boulders.instanceMatrix.needsUpdate = true;
}
function updateBoulders() {
  const M = new THREE.Matrix4(); let ch = false;
  boulderList.forEach((b, i) => { if (!b.gone && C.b[b.k] < C.bDam[b.k] - 3) { b.gone = true; M.makeScale(0, 0, 0); boulders.setMatrixAt(i, M); ch = true; } });
  if (ch) boulders.instanceMatrix.needsUpdate = true;
}
function updateSettlements() {
  const col = new THREE.Color(); let ch = false;
  houseList.forEach((h, i) => { if (h.k < 0) return; const f = C.b[h.k] + C.maxd[h.k] > h.e + 0.5; if (f !== h.flooded) { h.flooded = f; col.set(f ? '#6f6352' : h.wall); houses.setColorAt(i, col); ch = true; } });
  if (ch) houses.instanceColor.needsUpdate = true;
  for (const rd of C.ROADS) if (rd.kind === 'bridge') { const k = C.riverCellAt(rd.s0); const over = C.b[k] + C.maxd[k] - (C.b0[k] + rd.h); if (over > 1.5 && !app.washed[rd.id]) { app.washed[rd.id] = C.ST.t; bridges[rd.id].visible = false; } }
  const rc = road.geometry.attributes.color.array; roadPts.forEach((p, i) => { let cut = false; if (p.k >= 0) cut = C.b[p.k] + C.maxd[p.k] > p.e - 1; else cut = !!app.washed.bridge_raini; const c = cut ? [0.94, 0.33, 0.25] : [0.93, 0.86, 0.66]; rc[i * 3] = c[0]; rc[i * 3 + 1] = c[1]; rc[i * 3 + 2] = c[2]; });
  road.geometry.attributes.color.needsUpdate = true;
}

/* ================= labels ================= */
const labels = [];
function mkLabel(id, title, pos, opts) {
  const el = document.createElement('div'); el.className = 'lab'; el.innerHTML = '<div class="stem"><i class="dot"></i></div><div class="box"><b></b><small></small></div>';
  el.querySelector('b').textContent = title; $('#labels').appendChild(el);
  const L = Object.assign({ id, el, pos, sub: el.querySelector('small'), title: el.querySelector('b'), vis: true, cls: '' }, opts || {}); labels.push(L); return L;
}
function setLab(L, sub, cls) { if (L.sub.textContent !== sub) L.sub.textContent = sub; const c = 'lab ' + (cls || ''); if (L.el.className !== c) L.el.className = c; }
function buildLabels() {
  let cx = 0, cz = 0; for (const k of C.LAKECELLS) { cx += (k % C.NX + 0.5) * C.DX; cz += ((k / C.NX | 0) + 0.5) * C.DX; } cx /= C.LAKECELLS.length; cz /= C.LAKECELLS.length;
  app.lakeXZ = [cx, cz];
  mkLabel('lake', 'Blockage lake', () => V3(cx, cz, lakeLevel() + 30), { show: () => lake.visible });
  const rd = riverPt(C.SITE.dam + 30); mkLabel('dam', 'Debris dam, Ronti Gad confluence', () => V3(rd.x, rd.z, C.DAM.zc + 40), { show: () => C.P.mode !== 'hindcast' });
  C.ASSETS.forEach((a, i) => mkLabel('a' + i, a.name, V3(a.x, a.z, a.y + 25), { asset: i }));
  C.ROADS.forEach((r, i) => { if (r.kind !== 'bridge') return; const p = riverPt(r.s0); mkLabel('r' + i, r.name, V3(p.x, p.z, p.e + r.h + 10), { road: i }); });
  mkLabel('up', 'Upstream villages', V3(upstream.x, upstream.z, upstream.e + 25), { upstream: true });
  const h = riverPt(C.SITE.hand); mkLabel('hand', 'SPH to 2D handoff', V3(h.x, h.z, h.e + 380), { show: () => handoff.visible });
  mkLabel('front', 'Flood front', () => { const p = riverPt(Math.max(C.ST.frontS, C.SITE.hand)); return V3(p.x, p.z, p.e + 60); }, { show: () => app.started && C.ST.frontS > C.SITE.hand + 200 && C.ST.frontS < C.SITE.joshimath + 600 });
}
function assetStatus(i) {
  const st = C.ST.assetState[i], r = app.sur[app.scen], a = C.ASSETS[i];
  if (st.tFlood >= 0) return { state: 'hit', t: st.tFlood, depth: st.maxDepth, src: '2D' };
  if (app.done || C.P.mode === 'hindcast') return { state: 'ok', t: -1, depth: st.maxDepth, src: '2D' };
  if (r && r.assetT[i] >= 0) return { state: 'warn', t: r.assetT[i], depth: r.assetD[i], src: 'rapid' };
  return { state: 'ok', t: -1, depth: r ? r.assetD[i] : 0, src: 'rapid' };
}
function evacPlan(i) {
  const a = C.ASSETS[i], s = assetStatus(i); if (s.state === 'ok' || a.te <= 0) return null;
  const leave = s.t - (a.te + 2) * 60; return { leave, t: s.t, te: a.te, src: s.src };
}
function updateLabels() {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight, v = new THREE.Vector3(), t = C.ST.t, cand = [];
  for (const L of labels) {
    let show = L.show ? L.show() : true;
    if (show && L.asset !== undefined) {
      const a = C.ASSETS[L.asset], s = assetStatus(L.asset);
      if (app.ch === 7) { const p = evacPlan(L.asset); if (!p) setLab(L, a.te <= 0 ? 'Above the flood line' : 'Not in the flood zone', 'ok'); else if (s.state === 'hit') setLab(L, 'Flooded ' + mins(s.t), 'hit'); else if (!app.started) setLab(L, p.leave > 0 ? 'Leave within ' + mmss(p.leave) + ' of breach' : 'Needs early warning', p.leave > 0 ? 'warn' : 'hit'); else if (t < p.leave) setLab(L, 'Leave within ' + mmss(p.leave - t), 'warn'); else setLab(L, 'Too late for the road, climb now', 'hit'); }
      else if (s.state === 'hit') setLab(L, 'Flooded ' + mins(s.t) + ', ' + fmt(s.depth, 1) + ' m', 'hit');
      else if (s.state === 'warn') setLab(L, 'Expected ' + mins(s.t) + ', ' + a.pop + ' people', 'warn');
      else setLab(L, a.h > 60 ? 'Above the flood line' : 'Not expected to flood', 'ok');
    } else if (show && L.road !== undefined) { const r = C.ROADS[L.road], st = C.ST.roadState[L.road]; if (app.washed[r.id] !== undefined) setLab(L, 'Washed out ' + mins(app.washed[r.id]), 'hit'); else if (st.tClose >= 0) setLab(L, 'Overtopped ' + mins(st.tClose), 'warn'); else { const pr = app.sur[app.scen] ? app.sur[app.scen].roadT[L.road] : -1; setLab(L, pr >= 0 && !app.done ? 'Expected cut ' + mins(pr) : 'Open', pr >= 0 && !app.done ? 'warn' : 'ok'); } }
    else if (show && L.upstream) { const cut = app.washed.bridge_raini !== undefined || C.ST.roadState[0].tClose >= 0; setLab(L, cut ? 'Cut off by road: helicopter or high ground' : 'Road access through Raini bridge', cut ? 'hit' : ''); }
    else if (show && L.id === 'lake') setLab(L, fmt(lakeLevel(), 0) + ' m level, ' + fmt(lakeVolShown() / 1e6, 1) + ' million m³', '');
    else if (show && L.id === 'dam') setLab(L, app.started ? 'Breach ' + fmt(C.ST.breach.B, 0) + ' m wide, crest down ' + fmt(C.DAM.zc - C.ST.breach.zb, 0) + ' m' : C.P.Hd + ' m high natural blockage', app.started ? 'hit' : 'warn');
    else if (show && L.id === 'front') setLab(L, fmt((C.ST.frontS - C.SITE.dam) / 1000, 1) + ' km from dam, ' + fmt(C.ST.frontV * 3.6, 0) + ' km/h', 'front');
    else if (show && L.id === 'hand') setLab(L, 'Particles become 2D volume here', 'front');
    if (!show) { L.el.style.transform = 'translate(-9999px,-9999px)'; continue; }
    v.copy(typeof L.pos === 'function' ? L.pos() : L.pos).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { L.el.style.transform = 'translate(-9999px,-9999px)'; continue; }
    const cl = L.el.className; const pri = cl.includes('front') ? 5 : cl.includes('hit') ? 4 : cl.includes('warn') ? 3 : (L.id === 'dam' || L.id === 'lake') ? 3 : 1;
    cand.push({ L, x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h - 30, pri, z: v.z });
  }
  cand.sort((p, q) => q.pri - p.pri || p.z - q.z); const placed = [];
  for (const c of cand) {
    const bw = 200, bh = 46; const r = [c.x - 4, c.y - bh, c.x + bw, c.y + 4];
    if (placed.some(p => r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1])) { c.L.el.style.transform = 'translate(-9999px,-9999px)'; continue; }
    placed.push(r); c.L.el.style.transform = 'translate(' + c.x.toFixed(1) + 'px,' + c.y.toFixed(1) + 'px)';
  }
}

/* ================= lake display ================= */
function obsArea(day) { const Amax = C.lakeArea(C.DAM.zc - C.P.free); return Amax * (1 - Math.exp(-day / 5.5)); }
function levelForArea(A) { const L = C.LAKE; for (let q = 0; q < L.n; q++) if (L.A[q] >= A) return L.z[q]; return L.z[L.n - 1]; }
function lakeLevel() {
  if (C.P.mode === 'hindcast') return C.DAM.zbase;
  if (app.started) return C.ST.zL;
  if (app.lakeMode === 'days') return levelForArea(obsArea(app.days));
  if (app.lakeMode === 'none') return C.DAM.zbase - 20;
  return C.ST.zL;
}
function lakeVolShown() { return C.lakeV(lakeLevel()); }

/* ================= camera ================= */
function camPreset(name) {
  const S = C.SITE; const at = (sT, sF, side, up, tUp) => { const t = riverPt(sT), f = riverPt(sF), n = [-f.t[1], f.t[0]]; return { tgt: V3(t.x, t.z, t.e + (tUp || 40)), pos: V3(f.x + n[0] * side, f.z + n[1] * side, f.e + up) }; };
  switch (name) {
    case 'overview': { const m = riverPt((S.dam + S.joshimath) / 2); return { tgt: V3(m.x, m.z - 400, 1900), pos: V3(m.x - 1800, m.z + 11000, 21000) }; }
    case 'lake': return (() => { const rd = riverPt(S.dam - 500), n = [-rd.t[1], rd.t[0]]; return { tgt: V3(app.lakeXZ[0], app.lakeXZ[1], C.DAM.zc - 10), pos: V3(rd.x + n[0] * 500, rd.z + n[1] * 500, C.DAM.zc + 180) }; })();
    case 'breach': return (() => { const rd = riverPt(S.dam), rdF = riverPt(S.dam + 700), n = [-rdF.t[1], rdF.t[0]]; return { tgt: V3(rd.x, rd.z, C.DAM.zc - 15), pos: V3(rdF.x + n[0] * 380, rdF.z + n[1] * 380, C.DAM.zc + 140) }; })();
    case 'raini': return at(S.raini + 400, S.raini - 3000, 350, 2900);
    case 'tapovan': return at(S.tapovan, S.tapovan - 3400, 500, 3000);
    case 'joshimath': return at(S.joshimath, S.joshimath - 3600, -400, 3100);
  }
}
function flyTo(name, dur) {
  app.tour = null; if (app.follow) setFollow(false);
  const p = camPreset(name); if (!p) return;
  if (reduceMotion || dur === 0) { camera.position.copy(p.pos); controls.target.copy(p.tgt); app.cam = null; return; }
  app.cam = { fp: camera.position.clone(), ft: controls.target.clone(), tp: p.pos, tt: p.tgt, t0: performance.now(), dur: dur || 2200 };
}
function tourValley() { app.tour = { list: ['overview', 'breach', 'raini', 'tapovan', 'joshimath', 'overview'], i: 0, next: 0 }; }
function setFollow(on) { app.follow = on; const b = $('#btnFollow'); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (on) app.cam = null; }
function clampCam() { const x = (camera.position.x + 32) * SC, z = (camera.position.z + 16) * SC; if (x < 0 || z < 0 || x > C.LX || z > C.LZ) return; const m = wy(C.sampleArr(C.b, x, z) + 250); if (camera.position.y < m) camera.position.y = m; }
function updateCamera(now) {
  if (app.tour) { const T = app.tour; if (now >= T.next) { if (T.i >= T.list.length) app.tour = null; else { const nm = T.list[T.i++]; const p = camPreset(nm); app.cam = { fp: camera.position.clone(), ft: controls.target.clone(), tp: p.pos, tt: p.tgt, t0: now, dur: 2600 }; T.next = now + 3600; } } }
  if (app.cam) { const k = clamp((now - app.cam.t0) / app.cam.dur, 0, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; camera.position.lerpVectors(app.cam.fp, app.cam.tp, e); controls.target.lerpVectors(app.cam.ft, app.cam.tt, e); if (k >= 1) app.cam = null; }
  else if (app.follow) { const s = clamp(C.ST.frontS, C.SITE.hand, C.SITE.joshimath + 300); const t = riverPt(s), f = riverPt(Math.max(C.SITE.dam, s - 3000)), n = [-f.t[1], f.t[0]]; const tt = V3(t.x, t.z, t.e + 30), tp = V3(f.x + n[0] * 300, f.z + n[1] * 300, f.e + 2700); controls.target.lerp(tt, 0.04); camera.position.lerp(tp, 0.03); }
}

/* ================= simulation control ================= */
function setScenario(id) {
  app.scen = id; app.ff = false; app.env = false; if ($('#chkEnv')) $('#chkEnv').checked = false; app.playing = false; app.started = false; app.done = false; app.qHist = []; app.washed = {};
  C.setScenario(C.SCEN[id]); if (id !== 'hindcast') app.sur[id] = rapid(C.SCEN[id]);
  syncDam(true); updateDamOverlay(); placeBoulders(); resetSilt(); for (const k in bridges) bridges[k].visible = true;
  // The debris dam's height is a scenario parameter, so the 2D plan map's baked
  // terrain raster has to be repainted against the new dam, not just the notch.
  if (window.Map2DView && window.Map2DView.rebuildBase) window.Map2DView.rebuildBase();
  houseList.forEach((h, i) => { h.flooded = true; }); updateSettlements();
  updatePlayBtn(); renderChapter(); refreshLive();
  $('#scenName').textContent = C.SCEN[id].name;
}
function resetRun() { setScenario(app.scen); }
function play(on) {
  if (on && C.ST.done) resetRun();
  if (!on) app.ff = false;
  app.playing = on; if (on && !app.started) { app.started = true; if (app.ch < 4) goChapter(4); else if (app.ch === 4) flyTo('breach'); }
  updatePlayBtn();
}
function fastForward() { if (C.ST.done) return; app.ff = true; if (!app.playing) play(true); }
function updatePlayBtn() { const f = $('#btnFF'); if (f) { f.disabled = C.ST.done; f.textContent = app.ff ? 'Skipping ahead' : 'Skip to end'; } const b = $('#btnPlay'); b.textContent = app.playing ? 'Pause' : (app.started && !C.ST.done ? 'Resume' : (C.ST.done ? 'Run again' : 'Breach the dam')); b.className = 'btn ' + (app.playing ? '' : 'hot'); }

/* ================= charts ================= */
function chart(cv, o) {
  const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const L = 42, R = 8, T = 8, B = 20, pw = w - L - R, ph = h - T - B;
  const xmax = o.xmax, ymax = o.ymax || 1, xmin = o.xmin || 0;
  const X = x => L + (x - xmin) / (xmax - xmin) * pw, Y = y => T + ph - y / ymax * ph;
  g.font = '11px Archivo, sans-serif'; g.fillStyle = cssv('--ink-3'); g.strokeStyle = cssv('--line'); g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = ymax * i / 4; g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(w - R, Y(y)); g.stroke(); g.textAlign = 'right'; g.fillText(o.yfmt ? o.yfmt(y) : fmt(y), L - 5, Y(y) + 3.5); }
  g.textAlign = 'center'; for (let i = 0; i <= 4; i++) { const x = xmin + (xmax - xmin) * i / 4; g.fillText(o.xfmt ? o.xfmt(x) : fmt(x), X(x), h - 5); }
  (o.hlines || []).forEach(hl => { g.save(); g.setLineDash([4, 4]); g.strokeStyle = hl.color; g.beginPath(); g.moveTo(L, Y(hl.y)); g.lineTo(w - R, Y(hl.y)); g.stroke(); g.restore(); if (hl.label) { g.fillStyle = hl.color; g.textAlign = 'left'; g.fillText(hl.label, L + 4, Y(hl.y) - 4); } });
  if (o.vline !== undefined) { g.strokeStyle = cssv('--ink-3'); g.beginPath(); g.moveTo(X(o.vline), T); g.lineTo(X(o.vline), T + ph); g.stroke(); }
  (o.series || []).forEach(s => {
    if (!s.pts.length) return; g.save(); g.strokeStyle = s.color; g.lineWidth = s.width || 1.8; if (s.dash) g.setLineDash(s.dash);
    if (s.line !== false) { g.beginPath(); s.pts.forEach((p, i) => { const x = X(p[0]), y = Y(Math.min(p[1], ymax * 1.05)); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); }
    g.restore();
    if (s.marks) s.pts.forEach((p, i) => { const hol = s.hollow && s.hollow[i]; g.beginPath(); if (s.marks === 'sq') g.rect(X(p[0]) - 3.5, Y(p[1]) - 3.5, 7, 7); else g.arc(X(p[0]), Y(p[1]), 4, 0, 7); g.fillStyle = cssv('--panel-2'); if (hol) { g.strokeStyle = s.color; g.lineWidth = 1.5; g.fill(); g.stroke(); } else { g.fillStyle = s.color; g.fill(); } });
  });
}

/* ================= chapters ================= */
const CH = [
  { short: 'Valley', spec: 'Spec chapter 1', enter() { app.lakeMode = app.started ? 'sim' : 'none'; flyTo('overview', 2600); }, html: chValley },
  { short: 'Observe', spec: 'Spec chapters 2 and 3', enter() { if (!app.started) app.lakeMode = 'days'; flyTo('lake'); }, html: chObserve, live: liveObserve },
  { short: 'Risk', spec: 'Spec chapters 4, 5 and 6', enter() { app.lakeMode = 'sim'; flyTo('breach'); }, html: chRisk },
  { short: 'Scenarios', spec: 'Spec chapters 7 and 8', enter() { app.lakeMode = 'sim'; flyTo('overview'); }, html: chScen },
  { short: 'Breach', spec: 'Spec chapter 9', enter() { app.lakeMode = 'sim'; handoff.visible = true; flyTo('breach'); }, html: chBreach, live: liveBreach },
  { short: 'Propagate', spec: 'Spec chapter 10', enter() { app.lakeMode = 'sim'; handoff.visible = true; if (app.playing) setFollow(true); else flyTo('raini'); }, html: chProp, live: liveProp },
  { short: 'Impact', spec: 'Spec chapter 11', enter() { flyTo('overview'); }, html: chImpact, live: liveImpact },
  { short: 'Evacuate', spec: 'Spec chapter 12', enter() { flyTo('tapovan'); }, html: chEvac, live: liveEvac },
  { short: 'Validate', spec: 'Spec chapter 13', enter() { flyTo('overview'); }, html: chValidate },
  { short: 'Warn', spec: 'Spec chapter 14', enter() { flyTo('raini'); }, html: chWarn },
  { short: 'Whole Ganga', spec: 'Basin Scale View', enter() { if (window.ViewManager) window.ViewManager.switchView('basin'); }, html: chGanga },
];
function chGanga() {
  const is2D = window.ViewManager && window.ViewManager.currentDim === '2d';
  return `<h1>Whole Ganga Basin Hydrodynamics</h1><p>Zooming out to the basin view to route water across the entire Ganga main stem down to Farakka and Ganga Sagar.</p>
  <div class="actions"><button class="btn" data-act="mapdim">${is2D ? 'Show the basin in 3D' : 'Show the basin as a 2D map'}</button></div>
  <p class="small">The 2D map and the 3D scene read the same <b>BasinCore</b> state, so the map is this same run seen flat, not a second estimate. ${is2D ? 'Each reach is shaded by how far its peak discharge exceeds its own baseflow, and the wave front is drawn along each polyline as the timeline advances.' : 'The same reach colouring and travelling wave front are available as a flat map, which is the form a district office would actually print.'}</p>`;
}
function goChapter(i, first) {
  app.ch = clamp(i, 0, CH.length - 1); handoff.visible = false;
  if (app.ch < 10 && window.ViewManager && window.ViewManager.currentView === 'basin') {
    window.ViewManager.switchView('local');
  }
  CH[app.ch].enter(); renderChapter();
  $$('#rail button').forEach((b, j) => { b.setAttribute('aria-current', j === app.ch ? 'step' : 'false'); if (j < app.ch) b.classList.add('done'); });
  $('#prevCh').disabled = app.ch === 0; $('#nextCh').textContent = app.ch === CH.length - 1 ? 'Back to start' : 'Next: ' + CH[app.ch + 1].short.toLowerCase();
  if (!first) $('#story').scrollTop = 0;
}
function renderChapter() {
  const c = CH[app.ch];
  $('#story').innerHTML = '<div class="chno"><strong>' + (app.ch + 1) + '</strong><span>of 10, ' + c.spec + '</span></div>' + c.html();
  bindChapter(); if (c.live) c.live(true); if (app.ch === 8) drawCal();
}
function bindChapter() {
  $$('#story [data-act]').forEach(b => b.addEventListener('click', () => ACT[b.dataset.act](b)));
  $$('#story [data-scen]').forEach(b => b.addEventListener('click', () => { setScenario(b.dataset.scen); }));
  const d = $('#rngDays'); if (d) d.addEventListener('input', () => { app.days = +d.value; liveObserve(true); });
}
const ACT = {
  tour: () => tourValley(),
  next: () => goChapter(app.ch + 1),
  run: () => play(true),
  pause: () => play(false),
  reset: () => resetRun(),
  follow: () => setFollow(!app.follow),
  env: () => { app.env = !app.env; $('#chkEnv').checked = app.env; },
  mc: () => runMC(),
  calib: () => runCalib(),
  hind: () => { setScenario('hindcast'); flyTo('breach'); play(true); },
  back: () => { setScenario('large'); },
  mapdim: () => { if (window.ViewManager) window.ViewManager.toggleDim(); },
  copy: b => { const t = $('#capJson').textContent; try { navigator.clipboard.writeText(t).then(() => { b.textContent = 'Copied'; }, () => { b.textContent = 'Select the text to copy'; }); } catch (e) { b.textContent = 'Select the text to copy'; } },
  view: b => setView(+b.dataset.v),
};

function chValley() {
  return `<h1>A gorge that has already failed once</h1>
  <p>At about 10:21 on 7 February 2021, roughly 27 million m³ of rock and glacier ice broke away from Ronti Peak. The debris flood ran down the Ronti Gad, Rishiganga and Dhauliganga, destroyed the Rishiganga hydro project at Raini and wrecked the Tapovan Vishnugad barrage. More than 200 people were killed or went missing.</p>
  <p>Weeks later, an artificial lake was found on the Rishiganga upstream of Raini. That is the exact hazard PS26161 names: if a natural dam like that gives way, where does the water go, how fast, and who is standing in its path?</p>
  <p>This prototype models the corridor from a blockage lake near the Ronti Gad confluence down through Raini, Tapovan and Joshimath, about 27 km of river.</p>
  <div class="note">The terrain is synthetic, shaped to the corridor’s geometry: river distances, bed slopes, gorge widths, the Dhauliganga junction at Raini. Production feeds SRTM or ALOS DEM through the terrain engine. The solver code does not change.</div>
  <div class="actions"><button class="btn primary" data-act="tour">Fly the valley</button><button class="btn" data-act="next">A lake appears</button></div>
  <p class="small">Sources: Shugar et al., Science 373 (2021); GSI and PIB releases on the Chamoli event; SIH26161 problem statement.</p>`;
}
function chObserve() {
  return `<h1>A lake appears behind the debris</h1>
  <p>Nobody has to wait for the dam to fail. Sentinel 1 radar sees through cloud every few days, and Sentinel 2 adds optical passes when the sky is clear. Each pass is turned into a water mask, and the lake is tracked as it grows.</p>
  <label for="rngDays" class="small" style="display:block;margin-top:6px">Days since the blockage formed: <b id="dayv">${app.days}</b></label>
  <input type="range" id="rngDays" min="0" max="21" step="0.5" value="${app.days}">
  <canvas class="ch" id="cvObs" aria-label="Lake area by day"></canvas>
  <div class="swatches"><span><i style="background:${cssv('--ice')}"></i>Sentinel 2 optical</span><span><i style="background:${cssv('--silt')}"></i>Sentinel 1 radar</span><span><i style="border:1.5px solid ${cssv('--ice')};background:transparent"></i>Cloud, no optical reading</span></div>
  <dl class="kv" id="obsKv"></dl>
  <div class="note">Water extent comes from radar backscatter thresholds and optical NDWI in Google Earth Engine. Volume comes from the DEM’s stage storage curve under that extent. The observation series here is synthetic, shaped like a real detection record.</div>
  <div class="actions"><button class="btn primary" data-act="next">Score the risk</button></div>`;
}
function liveObserve(force) {
  const kv = $('#obsKv'); if (!kv) return; $('#dayv').textContent = app.days;
  const A = obsArea(app.days), z = levelForArea(A), V = C.lakeV(z), gr = (obsArea(app.days + 0.5) - A) / 0.5 / 1e4;
  kv.innerHTML = `<dt>Lake area</dt><dd>${fmt(A / 1e4, 1)} ha</dd><dt>Water level</dt><dd>${fmt(z, 0)} m</dd><dt>Stored volume</dt><dd>${fmt(V / 1e6, 2)} million m³</dd><dt>Growth now</dt><dd>${fmt(gr, 2)} ha per day</dd><dt>Freeboard to crest</dt><dd>${fmt(C.DAM.zc - z, 1)} m</dd>`;
  const pts = []; for (let d = 0; d <= 21; d += 0.5) pts.push([d, obsArea(d) / 1e4]);
  const s2d = [2, 7, 12, 17].filter(d => d <= app.days), s1d = [1, 7, 13, 19].filter(d => d <= app.days);
  const ymax = obsArea(21) / 1e4 * 1.15;
  chart($('#cvObs'), { xmax: 21, ymax, xfmt: x => 'day ' + fmt(x), yfmt: y => fmt(y, 0) + ' ha', vline: app.days, series: [{ pts, color: cssv('--ink-3'), dash: [3, 3], width: 1.2 }, { pts: s1d.map(d => [d, obsArea(d) / 1e4 * 0.97]), color: cssv('--silt'), line: false, marks: 'sq' }, { pts: s2d.map(d => [d, obsArea(d) / 1e4 * 1.02]), color: cssv('--ice'), line: false, marks: 'o', hollow: s2d.map(d => d === 12) }] });
}
function riskModel() {
  const r = app.sur[app.scen] || app.sur.large; const V0 = r.V0;
  let pop30 = 0; C.ASSETS.forEach((a, i) => { if (r.assetT[i] >= 0 && r.assetT[i] < 1800) pop30 += a.pop; });
  const f = [
    ['Impounded volume, ' + fmt(V0 / 1e6, 1) + ' million m³', Math.min(24, V0 / 1e6 * 1.6)],
    ['Lake growth rate, 21 days of passes', 15],
    ['Blockage of loose debris and ice, no spillway', 11],
    ['People reached within 30 min (' + pop30 + ')', Math.min(14, pop30 / 16)],
    ['Dam surface settling in InSAR, 3 cm in 12 days', 6],
    ['Seismic events in the last 7 days', 2],
    ['Rain and snowmelt outlook for February', -3],
  ];
  const base = 22; const score = clamp(Math.round(base + f.reduce((s, x) => s + x[1], 0)), 0, 100);
  return { f, base, score };
}
function chRisk() {
  const m = riskModel(); let cum = m.base; const sc = 100;
  const rows = m.f.map(([n, v]) => { const a = cum, b = cum + v; cum = b; const l = Math.min(a, b) / sc * 100, w = Math.abs(v) / sc * 100; return `<div class="row"><span>${n}</span><span class="track"><span class="fill" style="left:${l}%;width:${w}%;background:${v >= 0 ? cssv('--alert') : cssv('--safe')}"></span></span><span class="v">${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), 0)}</span></div>`; }).join('');
  const band = m.score >= 70 ? ['Red', cssv('--alert')] : m.score >= 40 ? ['Yellow', cssv('--amber')] : ['Green', cssv('--safe')];
  return `<h1>A risk score that shows its working</h1>
  <p>Observations become one number from 0 to 100, but the operator never sees the number alone. Every feature’s push up or down is shown, so a district officer can argue with the evidence, not with a black box.</p>
  <div class="score"><div class="big" style="color:${band[1]}">${m.score}</div><div class="band"><b style="color:${band[1]}">${band[0]} band</b><br>Confidence 0.76<br>Model baseline ${m.base}</div></div>
  <div class="bars">${rows}</div>
  <p class="small"><b>Missing or stale data, flagged not filled:</b> no gauge on the lake, so level comes from satellites only; last cloud free optical pass is 5 days old.</p>
  <div class="note">Production scoring is XGBoost with SHAP TreeExplainer attributions, trained on a landslide dam inventory. The weights shown here are illustrative so the demo stays transparent. Red crosses the trigger threshold and opens a scenario job with an audit record: evidence, model version, data version and the operator who confirmed it.</div>
  <div class="actions"><button class="btn primary" data-act="next">Confirm trigger and generate scenarios</button></div>`;
}
function scenCard(id) {
  const p = C.SCEN[id], r = app.sur[id];
  return `<button class="scard" data-scen="${id}" aria-pressed="${app.scen === id}"><b>${p.name}</b><span class="m">${p.Hd} m dam, ${p.Bf} m breach in ${Math.round(p.tf / 60)} min</span><br>${fmt(r.V0 / 1e6, 1)} million m³<br>Peak ${fmt(r.peakQ, 0)} m³/s<br>Raini ${mins(r.sites.raini.arr)}, ${fmt(r.sites.raini.hmax, 1)} m</button>`;
}
function chScen() {
  let mc = '';
  if (app.mc && app.mc.done) {
    const M = app.mc; const pct = (arr, q) => { const a = arr.filter(x => x >= 0).sort((x, y) => x - y); if (!a.length) return -1; return a[Math.min(a.length - 1, Math.floor(q * a.length))]; };
    const rows = C.ASSETS.map((a, i) => { const p = M.flood[i] / M.n; return `<div class="row"><span>${a.name}</span><span class="track"><span class="fill" style="left:0;width:${p * 100}%;background:${p > 0.5 ? cssv('--alert') : p > 0.15 ? cssv('--amber') : cssv('--safe')}"></span></span><span class="v">${fmt(p * 100)}%</span></div>`; }).join('');
    const sites = ['raini', 'tapovan', 'joshimath'].map(s => `<tr><td>${s[0].toUpperCase() + s.slice(1)}</td><td class="r">${fmt(pct(M.arr[s], 0.1) / 60, 0)}</td><td class="r">${fmt(pct(M.arr[s], 0.5) / 60, 0)}</td><td class="r">${fmt(pct(M.arr[s], 0.9) / 60, 0)}</td><td class="r">${fmt(pct(M.dep[s], 0.5), 1)} to ${fmt(pct(M.dep[s], 0.9), 1)}</td></tr>`).join('');
    mc = `<h2 style="font-size:15px;margin:14px 0 4px">Ensemble of ${M.n} breaches</h2><p class="small">Chance each place floods, across random dam heights, breach widths, breach times and roughness.</p><div class="bars">${rows}</div>
    <table class="t"><thead><tr><th>Arrival, min</th><th class="r">P10</th><th class="r">P50</th><th class="r">P90</th><th class="r">Depth m, P50 to P90</th></tr></thead><tbody>${sites}</tbody></table>`;
  } else if (app.mc) mc = `<div class="progress"><i id="mcBar" style="width:${app.mc.i / app.mc.n * 100}%"></i></div><p class="small" id="mcTxt">Running member ${app.mc.i} of ${app.mc.n}</p>`;
  return `<h1>Futures, not a forecast</h1>
  <p>Nobody knows how this dam will fail. So the system never commits to one breach: it brackets the answer with a family of them and reports the spread.</p>
  <div class="card-row">${['small', 'medium', 'large', 'extreme'].map(scenCard).join('')}</div>
  <p class="small">Choose a card to load it into the physics solver. Card numbers come from rapid mode, a 1D kinematic wave surrogate that runs in about 30 ms. It stands in for the PINN, which in production is trained on these SPH and 2D runs and is always labelled as a surrogate.</p>
  <div class="actions"><button class="btn" data-act="mc" ${app.mc && !app.mc.done ? 'disabled' : ''}>${app.mc && app.mc.done ? 'Run the ensemble again' : 'Run a 40 member ensemble'}</button><button class="btn primary" data-act="next">Breach the selected dam</button></div>
  ${mc}`;
}
function runMC() {
  const n = 40, rng = C.mulberry32(Date.now() & 0xffff); app.mc = { n, i: 0, done: false, flood: C.ASSETS.map(() => 0), arr: { raini: [], tapovan: [], joshimath: [] }, dep: { raini: [], tapovan: [], joshimath: [] } };
  renderChapter();
  const stepMC = () => {
    for (let q = 0; q < 8 && app.mc.i < n; q++) {
      const p = { Hd: 30 + rng() * 45, Bf: 40 + rng() * 160, tf: Math.exp(Math.log(300) + rng() * Math.log(12)), n: 0.035 + rng() * 0.025, free: 1 };
      const r = C.runScenarioSurrogate(p);
      r.assetT.forEach((t, i) => { if (t >= 0) app.mc.flood[i]++; });
      for (const s of ['raini', 'tapovan', 'joshimath']) { app.mc.arr[s].push(r.sites[s].arr); app.mc.dep[s].push(r.sites[s].hmax); }
      app.mc.i++;
    }
    restoreDam();
    const bar = $('#mcBar'); if (bar) { bar.style.width = (app.mc.i / n * 100) + '%'; $('#mcTxt').textContent = 'Running member ' + app.mc.i + ' of ' + n; }
    if (app.mc.i < n) setTimeout(stepMC, 0); else { app.mc.done = true; if (app.ch === 3) renderChapter(); }
  };
  setTimeout(stepMC, 30);
}
function chBreach() {
  return `<h1>The breach, particle by particle</h1>
  <p>Near the dam the flow is violent: water pours through a notch that deepens and widens by the minute. Here the model uses Smoothed Particle Hydrodynamics. Each particle carries a parcel of the lake’s volume, feels pressure from its neighbours through a smoothing kernel, and slides over the real terrain surface.</p>
  <dl class="kv" id="brKv"></dl>
  <canvas class="ch" id="cvBr" aria-label="Breach outflow hydrograph"></canvas>
  <div class="swatches"><span><i style="background:${cssv('--alert')}"></i>Live breach outflow</span><span><i style="background:${cssv('--ink-3')}"></i>Rapid mode estimate</span></div>
  <div class="actions">${app.playing ? '<button class="btn" data-act="pause">Pause</button>' : `<button class="btn hot" data-act="run">${app.started && !C.ST.done ? 'Resume the breach' : 'Breach the dam'}</button>`}<button class="btn" data-act="reset">Reset</button><button class="btn primary" data-act="next">Follow it downstream</button></div>
  <div class="note">Breach outflow follows a broad crested weir over a trapezoidal notch, Q = 1.7 B H^1.5 + 1.35 H^2.5, with the lake level updated from its storage curve every step. The particle solver is a lightweight WCSPH written for the browser; production runs DualSPHysics on GPU with the same coupling contract.</div>`;
}
function liveBreach() {
  const kv = $('#brKv'); if (!kv) return; const S = C.ST, P = C.P;
  kv.innerHTML = P.mode === 'hindcast' ? `<dt>Mode</dt><dd>7 Feb 2021 replay</dd><dt>Inflow now</dt><dd>${fmt(S.Q)} m³/s</dd><dt>Peak inflow</dt><dd>${fmt(S.Qpeak)} m³/s</dd><dt>SPH particles</dt><dd>${fmt(S.n)}</dd>`
    : `<dt>Lake level</dt><dd>${fmt(S.zL, 1)} m</dd><dt>Volume left</dt><dd>${fmt(S.V / 1e6, 2)} of ${fmt(S.V0 / 1e6, 2)} million m³</dd><dt>Breach width</dt><dd>${fmt(S.breach.B, 0)} m</dd><dt>Crest lowered by</dt><dd>${fmt(C.DAM.zc - S.breach.zb, 1)} m</dd><dt>Outflow now</dt><dd>${fmt(S.Q)} m³/s</dd><dt>Peak so far</dt><dd>${fmt(S.Qpeak)} m³/s at ${mins(S.tQpeak)}</dd><dt>SPH particles</dt><dd>${fmt(S.n)}</dd>`;
  const r = app.sur[app.scen]; const est = []; if (r && r.hg) r.hg.Q.forEach((q, i) => { if (i % 5 === 0) est.push([i * 2 / 60, q]); });
  const xmax = Math.max(40, S.t / 60 + 2), ymax = Math.max(S.Qpeak, r ? r.peakQ : 0, 1000) * 1.1;
  chart($('#cvBr'), { xmax, ymax, xfmt: x => fmt(x) + ' min', yfmt: y => fmt(y / 1000, 0) + 'k', vline: S.t / 60, series: [{ pts: est.filter(p => p[0] <= xmax), color: cssv('--ink-3'), dash: [4, 3], width: 1.3 }, { pts: app.qHist.map(p => [p[0] / 60, p[1]]), color: cssv('--alert'), width: 2 }] });
}
function chProp() {
  return `<h1>Handing the flood to the valley model</h1>
  <p>Past the glowing plane, particles stop being particles. Each one’s volume and momentum is deposited into a 2D shallow water grid, because simulating 27 km of valley with particles would be wasteful. The rule at the handoff is strict: not a litre may be created or lost.</p>
  <table class="t" id="ledger"></table>
  <dl class="kv" id="propKv"></dl>
  <div class="actions"><button class="btn" data-act="follow" aria-pressed="${app.follow}">${app.follow ? 'Stop following' : 'Follow the wave'}</button>${app.playing ? '<button class="btn" data-act="pause">Pause</button>' : '<button class="btn hot" data-act="run">' + (app.started ? 'Resume' : 'Breach the dam') + '</button>'}</div>
  <div class="actions" style="margin-top:0">${['Water', 'Depth', 'Speed', 'Arrival', 'Hazard'].map((n, i) => `<button class="btn" data-act="view" data-v="${i}" aria-pressed="${app.view === i}">${n}</button>`).join('')}</div>
  <div class="note">The browser solver is a finite volume scheme with an HLL Riemann solver and hydrostatic reconstruction: well balanced on steep beds, never negative depth, exactly mass conservative. Production sends the same handoff hydrograph into Delft3D FM through its adapter, and chapter 9 lines the solvers up against each other. Water depth is drawn ×${app.WX} so it reads at valley scale; every number is true depth.</div>
  <div class="actions"><button class="btn primary" data-act="next">What does it hit</button></div>`;
}
function liveProp() {
  const t = $('#ledger'); if (!t) return; const S = C.ST;
  const row = (n, v) => `<tr><td>${n}</td><td class="r">${fmt(v / 1e6, 3)} million m³</td></tr>`;
  t.innerHTML = `<tbody>${row('Released from the lake', S.released)}${row('In SPH particles', S.inflight + S.pending)}${row('In the 2D grid', S.grid)}${row('Left the model at Joshimath', S.out)}<tr><td><b>Mass balance error</b></td><td class="r"><b>${(S.err * 100).toFixed(5)}%</b></td></tr></tbody>`;
  $('#propKv').innerHTML = `<dt>Flood front</dt><dd>${fmt((S.frontS - C.SITE.dam) / 1000, 1)} km below the dam</dd><dt>Front speed</dt><dd>${fmt(S.frontV, 1)} m/s, ${fmt(S.frontV * 3.6, 0)} km/h</dd><dt>Deepest water now</dt><dd>${fmt(S.hmax, 1)} m</dd><dt>Fastest water now</dt><dd>${fmt(S.vmax, 1)} m/s</dd>`;
}
function chImpact() {
  return `<h1>From water to consequences</h1>
  <p>A flood map is not yet a decision. Depth, speed and timing at each hydro site, village, bridge and road are what a district control room acts on.</p>
  <div id="impBody"></div>
  <div class="actions"><button class="btn" data-act="env">${app.env ? 'Show live water' : 'Show peak envelope'}</button><button class="btn primary" data-act="next">How much time is left</button></div>
  <p class="small">Heights above the river and head counts are indicative for the demo. Production joins WorldPop or Census grids, building footprints and OSM roads to the inundation rasters with depth damage curves.</p>`;
}
function liveImpact() {
  const el = $('#impBody'); if (!el) return;
  let exposed = 0, hydro = 0;
  const rows = C.ASSETS.map((a, i) => { const s = assetStatus(i); if (s.state !== 'ok') { exposed += a.pop; if (a.kind === 'hydro') hydro++; } const tag = s.state === 'hit' ? '<span class="tag hit">Flooded</span>' : s.state === 'warn' ? '<span class="tag warn">Expected</span>' : '<span class="tag ok">Safe</span>'; return `<tr><td>${a.name}<br><span class="small" style="color:var(--ink-3)">${a.note}</span></td><td>${tag}<br>${s.t >= 0 ? mins(s.t) : ''}</td><td class="r">${s.state === 'ok' ? '' : fmt(Math.max(0, s.depth), 1) + ' m'}</td><td class="r">${fmt(a.pop)}</td></tr>`; }).join('');
  const roads = C.ROADS.map((r, i) => { const st = C.ST.roadState[i]; const w = app.washed[r.id]; const pr = app.sur[app.scen] ? app.sur[app.scen].roadT[i] : -1; const txt = w !== undefined ? '<span class="tag hit">Washed out</span> ' + mins(w) : st.tClose >= 0 ? '<span class="tag warn">Overtopped</span> ' + mins(st.tClose) : (pr >= 0 && !app.done ? '<span class="tag warn">Expected</span> ' + mins(pr) : '<span class="tag ok">Open</span>'); return `<tr><td>${r.name}</td><td>${txt}</td></tr>`; }).join('');
  const cut = app.washed.bridge_raini !== undefined || C.ST.roadState[0].tClose >= 0 || (!app.done && app.sur[app.scen] && app.sur[app.scen].roadT[0] >= 0);
  el.innerHTML = `<dl class="kv"><dt>People in places that flood</dt><dd>${fmt(exposed)}</dd><dt>Hydro sites hit</dt><dd>${hydro} of 3</dd><dt>Source</dt><dd>${app.done ? '2D physics, complete' : app.started ? '2D physics, running' : 'Rapid mode forecast'}</dd></dl>
  <table class="t"><thead><tr><th>Place</th><th>Status</th><th class="r">Depth</th><th class="r">People</th></tr></thead><tbody>${rows}</tbody></table>
  <table class="t"><thead><tr><th>Road or bridge</th><th>Status</th></tr></thead><tbody>${roads}</tbody></table>
  ${cut ? `<div class="note" style="border-left-color:var(--alert)"><b>Isolation alert.</b> Once Raini bridge goes, the villages up the Dhauliganga road lose their only road out, as they did in 2021. Road evacuation is no longer feasible for them: route people to high ground and stage a helicopter landing zone at the upper village.</div>` : ''}`;
}
function policies() {
  let none = 0, trig = 0, pre = 0; const rows = [];
  C.ASSETS.forEach((a, i) => { const s = assetStatus(i); if (s.state === 'ok' || a.te <= 0) return; none += a.pop; const avail = s.t / 60 - 5 - a.te - 2; const f = clamp(avail / 10, 0, 1); trig += a.pop * (1 - f); rows.push({ a, s, f }); });
  return { none, trig: Math.round(trig), pre, rows };
}
function chEvac() {
  return `<h1>The last departure clock</h1>
  <p>“Flooded in 30 minutes” is not an instruction. “Leave within 4 minutes, the road closes before the water arrives” is. For every place in the flood path the system works backwards: latest departure is the arrival time minus the time to walk or drive to safety, minus a two minute buffer.</p>
  <div id="evBody"></div>
  <div class="actions"><button class="btn primary" data-act="next">Check it against reality</button></div>`;
}
function liveEvac() {
  const el = $('#evBody'); if (!el) return; const t = C.ST.t;
  const rows = C.ASSETS.map((a, i) => { const p = evacPlan(i); if (!p) return ''; const s = assetStatus(i); let st;
    if (s.state === 'hit') st = '<span class="tag hit">Flooded</span>'; else if (p.leave <= 0) st = '<span class="tag hit">Only an early warning works</span>'; else if (!app.started) st = `<span class="tag warn">Leave within ${mmss(p.leave)} of breach</span>`; else if (t < p.leave) st = `<span class="tag warn">Leave within ${mmss(p.leave - t)}</span>`; else st = '<span class="tag hit">Road window closed, climb now</span>';
    return `<tr><td>${a.name}</td><td class="r">${mins(p.t)}</td><td class="r">${a.te} min</td><td>${st}</td></tr>`; }).join('');
  const P = policies(); const mx = Math.max(1, P.none);
  const bar = (n, v, c) => `<div class="row"><span>${n}</span><span class="track"><span class="fill" style="left:0;width:${v / mx * 100}%;background:${c}"></span></span><span class="v">${fmt(v)}</span></div>`;
  el.innerHTML = `<table class="t"><thead><tr><th>Place</th><th class="r">Water</th><th class="r">To safety</th><th>Clock</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No settlement floods in this scenario.</td></tr>'}</tbody></table>
  <h2 style="font-size:15px;margin:14px 0 4px">People still in the flood zone when water arrives</h2>
  <div class="bars">${bar('No warning, as in 2021', P.none, cssv('--alert'))}${bar('Automatic trigger at breach, alert at T+5 min', P.trig, cssv('--amber'))}${bar('Red risk days earlier, zone cleared', P.pre, cssv('--safe'))}</div>
  <p class="small">A decision aid, not a casualty forecast. The trigger case assumes people start moving evenly over 10 minutes after the alert. The gap between the first two bars is the value of automatic triggering; the gap to the third is the value of watching the lake before it fails.</p>`;
}
function spd(tarrFn, s1, s2) { const a = tarrFn(s1), b = tarrFn(s2); return a >= 0 && b > a ? (s2 - s1) / (b - a) : NaN; }
function chValidate() {
  const S = C.SITE; let cmp = '<p class="small">Run a breach to the end to compare rapid mode against the 2D physics here.</p>';
  if (app.done && C.P.mode !== 'hindcast') {
    const r = app.sur[app.scen]; const rows = [['Raini', S.raini + 350, 'raini'], ['Tapovan', S.tapovan + 350, 'tapovan'], ['Joshimath', S.joshimath, 'joshimath']].map(([n, s, key]) => { const k = C.riverCellAt(s), ta = C.arr[k], da = C.maxd[k], tr = r.sites[key].arr, dr = r.sites[key].hmax; return `<tr><td>${n}</td><td class="r">${mins(tr)}</td><td class="r">${mins(ta)}</td><td class="r">${fmt(dr, 1)} m</td><td class="r">${fmt(da, 1)} m</td></tr>`; }).join('');
    cmp = `<table class="t"><thead><tr><th></th><th class="r">Rapid arrival</th><th class="r">2D arrival</th><th class="r">Rapid depth</th><th class="r">2D depth</th></tr></thead><tbody>${rows}</tbody></table><p class="small">Depths agree closely. Rapid mode runs early because a kinematic wave ignores the pressure and inertia that hold the 2D front back, so its clocks err on the safe side. That is the right direction for a surrogate to be wrong in.</p>`;
  }
  let cal = '';
  if (app.calib) {
    const c = app.calib; const best = c.rows.reduce((a, b) => (b.err < a.err ? b : a));
    cal = `<canvas class="ch" id="cvCal" aria-label="Front speed against Manning n"></canvas><div class="swatches"><span><i style="background:${cssv('--alert')}"></i>Model at Rishiganga HEP</span><span><i style="background:${cssv('--ice')}"></i>Model at Tapovan</span><span><i style="border:1.5px dashed ${cssv('--ink-3')}"></i>Observed 25 and 16 m/s</span></div>
    <p>Best single roughness: <b>n = ${best.n.toFixed(3)}</b>, giving ${fmt(best.v1, 1)} m/s at Rishiganga HEP and ${fmt(best.v2, 1)} m/s at Tapovan against observed 25 and 16.</p>
    <p class="small">No single clear water roughness matches both sites. The 2021 flow was a debris flow whose behaviour changed as it thinned downstream. The honest conclusion is that production needs reach wise calibration or a rheology aware model for debris floods, and the prototype says so instead of tuning until the plot looks good.</p>`;
  }
  return `<h1>Check it against reality</h1>
  <p>A model that cannot be checked is a guess with graphics. Three checks run here, and a fourth waits for real terrain.</p>
  <h2 style="font-size:15px;margin:12px 0 4px">1. Mass balance, every step</h2>
  <p class="small">Live error right now: <b>${(C.ST.err * 100).toFixed(5)}%</b> of released volume. Production CI adds the Ritter dry bed and Stoker wet bed dam break benchmarks, a lake at rest test and grid convergence before any release.</p>
  <h2 style="font-size:15px;margin:12px 0 4px">2. Rapid mode against physics</h2>${cmp}
  <h2 style="font-size:15px;margin:12px 0 4px">3. Hindcast of 7 February 2021</h2>
  <p class="small">Video reconstructions give front speeds of about 25 m/s at the Rishiganga HEP and 16 m/s at Tapovan (Shugar et al. 2021). The calibration sweeps Manning roughness and scores each value against both.</p>
  <div class="actions"><button class="btn" data-act="calib">${app.calib ? 'Sweep again' : 'Calibrate roughness'}</button><button class="btn" data-act="hind">Replay 2021 in 3D</button>${C.P.mode === 'hindcast' ? '<button class="btn" data-act="back">Back to the lake scenario</button>' : ''}</div>
  ${cal}
  <h2 style="font-size:15px;margin:12px 0 4px">4. Satellite flood extent</h2>
  <p class="small">With a georeferenced DEM, predicted extent is scored against Sentinel 1 flood masks from Earth Engine using IoU, precision, recall and F1. It is left out here on purpose: scoring synthetic terrain against real imagery would be a fake number.</p>
  <div class="actions"><button class="btn primary" data-act="next">Issue the warning</button></div>`;
}
function runCalib() {
  const ns = []; for (let n = 0.02; n <= 0.0701; n += 0.005) ns.push(+n.toFixed(3));
  const rows = []; let i = 0;
  const go = () => {
    const n = ns[i++]; const r = C.runScenarioSurrogate(Object.assign({}, C.SCEN.hindcast, { n })); restoreDam();
    const tf = s => r.tarr[Math.round((s - C.SITE.dam) / C.SUR.ds)];
    const v1 = spd(tf, C.SITE.raini - 1500, C.SITE.raini + 300), v2 = spd(tf, C.SITE.tapovan - 1500, C.SITE.tapovan + 300);
    rows.push({ n, v1, v2, err: Math.hypot(v1 - OBS.hp1, v2 - OBS.hp2) });
  };
  while (i < ns.length) go();
  app.calib = { rows }; renderChapter(); drawCal();
}
function drawCal() {
  const cv = $('#cvCal'); if (!cv || !app.calib) return; const R = app.calib.rows;
  chart(cv, { xmin: 0.02, xmax: 0.07, ymax: 40, xfmt: x => x.toFixed(3), yfmt: y => fmt(y) + ' m/s', hlines: [{ y: OBS.hp1, color: cssv('--alert'), label: 'observed at Rishiganga HEP' }, { y: OBS.hp2, color: cssv('--ice'), label: 'observed at Tapovan' }], series: [{ pts: R.map(r => [r.n, r.v1]), color: cssv('--alert'), marks: 'o' }, { pts: R.map(r => [r.n, r.v2]), color: cssv('--ice'), marks: 'o' }] });
}
function capData() {
  const list = C.ASSETS.map((a, i) => ({ a, s: assetStatus(i) })).filter(x => x.s.state !== 'ok').sort((x, y) => x.s.t - y.s.t);
  const r = app.sur[app.scen] || {}; const certainty = app.started ? 'Observed' : 'Likely';
  const cap = { identifier: 'DAMSYS_CHAMOLI_' + (app.scen || '').toUpperCase() + '_001', sender: 'ddma.chamoli@example.gov.in', status: 'Exercise', msgType: 'Alert', scope: 'Public',
    info: [{ language: 'en-IN', category: 'Geo', event: 'Natural dam breach flood, Rishiganga', urgency: 'Immediate', severity: (r.peakQ || 0) > 15000 ? 'Extreme' : 'Severe', certainty,
      headline: 'Flash flood from the Rishiganga blockage lake', instruction: 'Move away from the river to high ground now. Do not use river bridges or the valley road.',
      parameter: { peakDischarge_m3s: Math.round(r.peakQ || C.ST.Qpeak), model: app.done ? '2D SWE, complete run' : 'Rapid surrogate, physics running' },
      area: list.map(x => ({ areaDesc: x.a.name, expectedArrival: 'T+' + Math.round(x.s.t / 60) + 'min', population: x.a.pop, action: x.a.te > 0 ? 'Evacuate' : 'Shelter above flood line' })) }] };
  return { cap, list };
}
function chWarn() {
  const { cap, list } = capData();
  const at = n => { const x = list.find(v => v.a.id === n); return x ? Math.round(x.s.t / 60) : null; };
  const tR = at('raini_low') || at('hp1'), tT = at('hp2') || at('tunnel');
  const en = `Warning from DDMA Chamoli: the blockage lake on the Rishiganga has broken. Flood water is expected at Raini ${tR ? 'in about ' + tR + ' minutes' : 'soon'} and at Tapovan ${tT ? 'in about ' + tT + ' minutes' : 'later'}. Leave the river bank for high ground now. Do not use the bridges or the valley road.`;
  const hi = `चेतावनी, जिला आपदा प्रबंधन प्राधिकरण चमोली: ऋषिगंगा पर बनी झील टूट गई है। रैणी में पानी ${tR ? 'लगभग ' + tR + ' मिनट में' : 'जल्द'} और तपोवन में ${tT ? 'लगभग ' + tT + ' मिनट में' : 'बाद में'} पहुँच सकता है। नदी किनारा तुरंत छोड़कर ऊँचे स्थान पर जाएँ। पुल और घाटी की सड़क का उपयोग न करें।`;
  const pri = list.map((x, i) => `<tr><td>${i + 1}</td><td>${x.a.name}</td><td class="r">${mins(x.s.t)}</td><td class="r">${fmt(x.a.pop)}</td></tr>`).join('');
  return `<h1>A warning people can act on</h1>
  <p>The analysis ends as a structured Common Alerting Protocol message, ordered by who gets water first, with the text written in the languages of the valley. The structured payload stays authoritative; the words are generated from it.</p>
  <table class="t"><thead><tr><th>#</th><th>Target</th><th class="r">Water</th><th class="r">People</th></tr></thead><tbody>${pri || '<tr><td colspan="4">No settlement floods in this scenario.</td></tr>'}</tbody></table>
  <div class="msg"><div class="lang">English, SMS and cell broadcast</div>${en}</div>
  <div class="msg" lang="hi"><div class="lang">हिन्दी</div>${hi}</div>
  <pre class="cap" id="capJson">${JSON.stringify(cap, null, 2).replace(/</g, '&lt;')}</pre>
  <div class="actions"><button class="btn" data-act="copy">Copy CAP JSON</button><button class="btn primary" data-act="next">Start over</button></div>
  <p class="small">Status is set to Exercise. Garhwali and Kumaoni voice messages would be generated from the same payload for radio and loudspeakers.</p>`;
}

/* ================= UI shell ================= */
function setView(v) { app.view = v; water.material.uniforms.uMode.value = v; $$('#segView button').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === v ? 'true' : 'false')); $$('#story [data-act="view"]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.v === v ? 'true' : 'false')); drawLegend(); }
function drawLegend() {
  const el = $('#legend'); const v = app.view;
  const g = ['', 'linear-gradient(90deg,#cceef7,#73c2e6,#2e80c7,#29459a,#4d1a73)', 'linear-gradient(90deg,#fff2b3,#f9c766,#ed7d40,#cc3333,#730d2e)', 'linear-gradient(90deg,#d92626,#f28c26,#f2d94d,#73bf73,#4080cc)', 'linear-gradient(90deg,#73bf73 0 20%,#f2d94d 20% 40%,#f28c26 40% 60%,#d93326 60% 80%,#800d26 80%)'][v];
  const r = ['', ['0 m', '12 m'], ['0', '20 m/s'], ['T+0', '60 min'], ['safe', 'depth × speed over 20 m²/s']][v];
  el.innerHTML = v === 0 ? '<span>Sediment laden water, foam where it runs fast</span>' : `<span>${r[0]}</span><span class="bar" style="background:${g}"></span><span>${r[1]}</span>`;
  $('#layerNote').textContent = v === 3 ? 'peak envelope' : '';
}
function buildUI() {
  $('#rail').innerHTML = CH.map((c, i) => `<button data-ch="${i}"><span>${i + 1}</span><b>${c.short}</b></button>`).join('');
  $$('#rail button').forEach(b => b.addEventListener('click', () => goChapter(+b.dataset.ch)));
  $('#prevCh').addEventListener('click', () => goChapter(app.ch - 1));
  $('#nextCh').addEventListener('click', () => goChapter(app.ch === CH.length - 1 ? 0 : app.ch + 1));
  $('#btnPlay').addEventListener('click', () => play(!app.playing));
  $('#btnReset').addEventListener('click', resetRun);
  $('#btnFF').addEventListener('click', fastForward);
  $$('#segView button').forEach(b => b.addEventListener('click', () => setView(+b.dataset.v)));
  $('#chkEnv').addEventListener('change', e => { app.env = e.target.checked; });
  $('#rngWX').addEventListener('input', e => { app.WX = +e.target.value; $('#wxv').textContent = app.WX; });
  $$('[data-cam]').forEach(b => b.addEventListener('click', () => flyTo(b.dataset.cam)));
  $('#btnFollow').addEventListener('click', () => setFollow(!app.follow));
  $('#btnIntel').addEventListener('click', () => { const o = $('#intel').classList.toggle('open'); $('#btnIntel').setAttribute('aria-expanded', o); });
  window.addEventListener('keydown', e => { if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; if (e.code === 'Space') { e.preventDefault(); play(!app.playing); } if (e.key === 'ArrowRight') goChapter(app.ch + 1); if (e.key === 'ArrowLeft') goChapter(app.ch - 1); });
  drawLegend(); updatePlayBtn(); $('#scenName').textContent = C.SCEN[app.scen].name;
}
function refreshLive() {
  const S = C.ST, P = C.P;
  $('#clk').textContent = clock(S.t);
  $('#clkState').textContent = !app.started ? 'Model idle. Breach not started.' : S.done ? 'Run complete. Peak envelope saved.' : app.playing ? (app.ff ? 'Skipping ahead at full speed' : S.n > 0 ? 'SPH near field and 2D running' : '2D propagation running') + (app.simRate ? ', ' + fmt(app.simRate) + '× real time' : '') : 'Paused';
  const kv = [
    ['Solver phase', !app.started ? 'Idle' : S.done ? 'Finished' : S.n > 0 || S.Q > 1 ? 'SPH plus 2D' : '2D only'],
    P.mode === 'hindcast' ? ['Inflow', fmt(S.Q) + ' m³/s'] : ['Lake', fmt(S.zL, 1) + ' m, ' + fmt(S.V / 1e6, 2) + ' Mm³'],
    ['Breach outflow', fmt(S.Q) + ' m³/s'], ['Peak outflow', fmt(S.Qpeak) + ' m³/s'],
    ['Flood front', fmt(Math.max(0, S.frontS - C.SITE.dam) / 1000, 1) + ' km, ' + fmt(S.frontV * 3.6) + ' km/h'],
    ['SPH particles', fmt(S.n)], ['2D cells computed', fmt(S.nProc || 0) + ' of ' + fmt(C.actList.length)],
    ['Mass balance error', (S.err * 100).toFixed(5) + '%'], ['Frame rate', fmt(app.fps) + ' fps'],
  ];
  $('#liveKv').innerHTML = kv.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
  const cols = [cssv('--alert'), cssv('--amber'), cssv('--silt'), cssv('--ice')], names = ['Breach', 'Raini', 'Tapovan', 'Joshimath'];
  const gi = [1, 2, 3], series = [{ pts: app.qHist.map(p => [p[0] / 60, p[1]]), color: cols[0], width: 1.6 }];
  gi.forEach((g, j) => { const q = S.gauges[g]; const pts = []; for (let i = 0; i < q.length; i += 2) pts.push([S.gt[i] / 60, q[i]]); series.push({ pts, color: cols[j + 1], width: 1.6 }); });
  const ymax = Math.max(1000, S.Qpeak * 1.1, ...S.gauges.slice(1).map(a => a.length ? Math.max(...a) * 1.05 : 0));
  chart($('#cvHydro'), { xmax: Math.max(30, Math.ceil(S.t / 600) * 10), ymax, xfmt: x => fmt(x) + ' min', yfmt: y => ymax < 8000 ? fmt(y / 1000, 1) + 'k' : fmt(y / 1000, 0) + 'k', series });
  $('#hydroKey').innerHTML = names.map((n, i) => `<span><i style="background:${cols[i]}"></i>${n}</span>`).join('') + '<span>m³/s</span>';
}

/* ================= published view interface =================
   The 2D plan map (src/app/map2d.js) is a peer renderer of this same state, not
   a copy of it: it reads the map layer, the peak envelope toggle, the asset
   status and the road geometry from here every frame, so the two views cannot
   drift apart and the intel panel's controls drive both. */
window.DamApp = {
  app,
  setView,
  setEnv: function (on) { app.env = !!on; const c = $('#chkEnv'); if (c) c.checked = app.env; },
  assetStatus,
  lakeLevel,
  get roadPts() { return roadPts; },
  get upstream() { return upstream; }
};

/* ================= main loop ================= */
let lastT = performance.now(), fpsAcc = 0, fpsN = 0, lastSimT = 0, lastWall = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; fpsAcc += dt; fpsN++; if (fpsAcc > 0.5) { app.fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  app.frame++;
  uniCommon.uTime.value += dt;
  // The 2D plan view is a sibling renderer over the same physics, so while it is
  // the visible one the three.js mesh updates and draw are pure waste.
  const show3D = !window.ViewManager || (window.ViewManager.currentView === 'local' && window.ViewManager.currentDim === '3d');
  if (app.playing && !C.ST.done) {
    const target = app.ff ? 1e9 : +$('#selSpeed').value, budget = app.ff ? 120 : (target >= 40 ? 28 : 18), chunk = app.ff ? 3 : 1, t0 = performance.now(); let n = 0;
    while (n < target && performance.now() - t0 < budget) { C.step(chunk); n++; if (app.ff || C.ST.steps % 3 === 0) app.qHist.push([C.ST.t, C.ST.Q]); }
    if (C.P.mode !== 'hindcast' && C.ST.breach.pr < 1 && app.frame % 2 === 0) { syncDam(true); updateDamOverlay(); updateBoulders(); }
    if (app.frame % 90 === 0) paintSilt();
  }
  if (app.started && C.ST.done && !app.done) { app.playing = false; app.ff = false; app.done = true; app.env = true; $('#chkEnv').checked = true; updatePlayBtn(); paintSilt(); renderChapter(); }
  if (now - lastWall > 1000) { app.simRate = app.playing ? (C.ST.t - lastSimT) / ((now - lastWall) / 1000) : 0; lastSimT = C.ST.t; lastWall = now; }
  if (show3D) {
    updateWater(); updateParticles();
    const lv = lakeLevel(); lake.visible = C.P.mode !== 'hindcast' && lv > C.DAM.zbase + 0.5; lake.material.uniforms.uLevel.value = wy(lv);
    if (app.frame % 20 === 0) updateSettlements();
  }
  if (app.frame % 10 === 0) { refreshLive(); const c = CH[app.ch]; if (c.live && (app.playing || app.frame % 60 === 0)) c.live(); }
  if (show3D) {
    updateCamera(now); controls.update(); clampCam();
    renderer.render(scene, camera);
    updateLabels();
  } else if (window.Map2DView && window.Map2DView.active) window.Map2DView.render();
}

boot();
})();
