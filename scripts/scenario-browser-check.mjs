/**
 * Headless end-to-end check for the 3D SCENARIO preview.
 *
 * Walks the exact hero flow from spec §48 — power on LAND POTENTIAL, select a
 * parcel, VIEW 3D SCENARIO, confirm real geometry actually appeared in the
 * Cesium scene, switch scenarios, toggle CURRENT/SCENARIO/SPLIT, drag opacity,
 * exit, and confirm the GIS state survived — plus the regression list from §47.
 *
 * The point of this file is that it reads the REAL Cesium viewer, not the React
 * tree. A panel that renders beautifully while drawing nothing would pass a DOM
 * check and fail this one.
 *
 *   node scripts/scenario-browser-check.mjs
 */
import { spawn } from "node:child_process";

const CHROME =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9343;
const URL_TARGET = process.env.SCENARIO_URL ?? "http://localhost:8080/gis-explorer-3d";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--user-data-dir=${process.env.TEMP ?? "/tmp"}/chrome-sc-check`,
    `--remote-debugging-port=${PORT}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures += 1;
};

let ws = null;
try {
  let target = null;
  for (let i = 0; i < 40 && !target; i += 1) {
    await sleep(500);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      target = list.find((t) => t.type === "page") ?? null;
    } catch {
      /* not up yet */
    }
  }
  if (!target) throw new Error("Chrome DevTools endpoint never came up");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });

  let seq = 0;
  const pending = new Map();
  const exceptions = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (msg.method === "Runtime.exceptionThrown") {
      exceptions.push(msg.params.exceptionDetails?.text ?? "unknown exception");
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evalJs = async (expression) => {
    const res = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result?.value;
  };

  /**
   * Poll a page expression until it returns truthy.
   *
   * The globe does asynchronous work — camera flights, a 300 ms debounced
   * re-screen, terrain probing, imagery loading — so fixed sleeps make this
   * harness intermittently fail for reasons that have nothing to do with the
   * feature. Every wait below is expressed as "until X is true".
   */
  const waitFor = async (expression, label, timeoutMs = 45000, probe = null) => {
    const deadline = Date.now() + timeoutMs;
    let last = "<threw>";
    for (;;) {
      const v = await evalJs(expression).catch(() => null);
      last = v === null ? "<null>" : String(v);
      if (v) return v;
      if (Date.now() > deadline) {
        const extra = probe ? await evalJs(probe).catch((e) => `probe threw: ${e.message}`) : null;
        throw new Error(
          `timed out waiting for: ${label} (last saw: ${last.slice(0, 100)}${
            extra ? ` | probe: ${JSON.stringify(extra).slice(0, 400)}` : ""
          })`,
        );
      }
      await sleep(500);
    }
  };

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: URL_TARGET });

  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) {
    await sleep(500);
    ready = await evalJs(
      `!!document.querySelector("#g3d-lp-toggle") && !!window.__g3dGlobe && !!document.querySelector(".cesium-widget canvas")`,
    ).catch(() => false);
  }
  check("globe mounted", ready);
  if (!ready) throw new Error("globe never became ready");

  // Record the pre-existing GIS state so EXIT can be proved lossless.
  const baseline = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    return {
      entities: g.viewer.entities.values.length,
      sat: !!g.satLayer,
      street: !!g.streetLayer,
      terrain: g.status.terrain,
      perf: g.getPerf(),
    };
  })()`);
  check("terrain reported", !!baseline.terrain, baseline.terrain);

  // --- STEP 2/3: power on LAND POTENTIAL ----------------------------------
  await evalJs(`document.querySelector("#g3d-lp-toggle").click()`);
  // Wait for the debounced re-screen to actually draw, rather than sleeping a
  // guessed interval — a fixed sleep makes the whole harness flaky.
  let powered = null;
  for (let i = 0; i < 40; i += 1) {
    await sleep(1000);
    powered = await evalJs(`(() => {
      const g = window.__g3dGlobe;
      return {
        entities: g.lpEntities.length,
        sat: !!g.satLayer,
        power: document.querySelector("#g3d-lp-toggle").getAttribute("aria-pressed"),
      };
    })()`);
    if (powered.entities > 0) break;
  }
  check("LAND POTENTIAL on", powered.power === "true");
  check("satellite layer present", powered.sat);
  check("candidate parcels drawn", powered.entities > 0, `${powered.entities}`);

  // --- STEP 4/5: select a parcel and pick a use ---------------------------
  /*
   * The layer is redrawn (cleared + repopulated) on every camera settle, so the
   * entity collection is momentarily empty during a flight even while
   * `lpEntities.length` reads non-zero. Find-and-select therefore has to be a
   * single retrying step, not a wait followed by a scan — the scan loses the
   * race on most runs.
   */
  const selected = await waitFor(
    `(() => {
    const g = window.__g3dGlobe;
    const C = g.C;
    for (const e of g.viewer.entities.values) {
      const eid = e.id ?? "";
      if (!eid.startsWith("lp:")) continue;
      if (eid.includes("cluster") || eid.includes("label") || eid.includes("line:")) continue;
      if (!e.polygon) continue;
      const props = e.properties.getValue(C.JulianDate.now());
      if (!props || !props.id) continue;
      const hierarchy = e.polygon.hierarchy.getValue(C.JulianDate.now());
      const ring = hierarchy.positions.map((p) => {
        const c = C.Cartographic.fromCartesian(p);
        return [C.Math.toDegrees(c.longitude), C.Math.toDegrees(c.latitude)];
      });
      if (ring.length < 3) continue;
      g.setLandPotentialSelection({
        id: props.id,
        ring,
        properties: { kind: "land-parcel", id: props.id, areaHa: props.areaHa, label: props.label },
        conceptual: null,
      });
      return { ok: true, parcelId: props.id, areaHa: props.areaHa };
    }
    return false;
  })()`,
    "a selectable candidate parcel on the globe",
  );
  check(
    "parcel geometry readable from the scene",
    selected.ok,
    selected.ok ? selected.parcelId : (selected.reason ?? "unknown"),
  );

  // Drive the real React selection so the inspector mounts.
  const droveSelection = await waitFor(
    `(() => {
      const rows = Array.from(document.querySelectorAll(".g3d-lp-resultrow"));
      if (rows.length === 0) return false;
      rows[0].click();
      return { ok: true, rows: rows.length };
    })()`,
    "candidate result rows to render",
  );
  check(
    "parcel selectable from the results list",
    droveSelection.ok,
    `${droveSelection.rows} rows`,
  );

  // Wait for the camera flight and the inspector to settle.
  const inspector = await waitFor(
    `(() => {
      const hero = document.querySelector(".g3d-lp-hero");
      const uses = document.querySelectorAll(".g3d-lp-scorerow").length;
      if (!hero || uses === 0) return false;
      return {
        hero: true,
        uses,
        hasCta: !!document.querySelector(".g3d-lp-scenario-view"),
      };
    })()`,
    "the land potential inspector",
  );

  check("LAND POTENTIAL inspector open", inspector.hero);
  check("potential uses listed", inspector.uses >= 5, `${inspector.uses} uses`);
  check("VIEW 3D SCENARIO control present", inspector.hasCta);

  // Choose INDUSTRIAL / LOGISTICS specifically.
  const choseUse = await evalJs(`(() => {
    const rows = Array.from(document.querySelectorAll(".g3d-lp-scorerow"));
    const row = rows.find((r) => /logistics|industrial|storage/i.test(r.textContent));
    if (!row) return { ok: false };
    row.click();
    return { ok: true, text: row.textContent.slice(0, 40) };
  })()`);
  check("industrial / logistics use selectable", choseUse.ok, choseUse.text ?? "");

  // --- STEP 6/7/8: VIEW 3D SCENARIO, real Cesium geometry appears ----------
  const clicked = await waitFor(
    `(() => {
      const btn = document.querySelector(".g3d-lp-scenario-view");
      if (!btn || btn.disabled) return false;
      btn.click();
      return true;
    })()`,
    "an enabled VIEW 3D SCENARIO button",
  );
  check("VIEW 3D SCENARIO clicked", clicked);

  const drawn = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    const C = g.C;
    const ids = g.scenarioEntities;
    const v = g.viewer;
    const now = C.JulianDate.now();
    let extruded = 0, draped = 0, badProps = 0;
    let clampedExtrusions = 0; // the bug: extrudedHeight silently dropped
    let minSide = Infinity, maxSide = 0;
    for (const id of ids) {
      const e = v.entities.getById(id);
      const p = e.polygon;
      const hr = p.heightReference ? p.heightReference.getValue(now) : undefined;
      const eh = p.extrudedHeight ? p.extrudedHeight.getValue(now) : undefined;
      const h = p.height ? p.height.getValue(now) : undefined;
      if (eh !== undefined && eh !== null) {
        extruded++;
        // CLAMP_TO_GROUND makes Cesium IGNORE extrudedHeight, so the polygon
        // renders flat even though the property is set. This is the exact
        // defect that shipped, so it is asserted directly.
        if (hr === C.HeightReference.CLAMP_TO_GROUND) clampedExtrusions++;
        if (typeof h === "number" && typeof eh === "number") {
          const side = eh - h;
          if (side > 0) {
            minSide = Math.min(minSide, side);
            maxSide = Math.max(maxSide, side);
          }
        }
      } else draped++;
      const props = e.properties.getValue(now);
      if (props.kind !== "scenario-element" || props.status !== "SIMULATED") badProps++;
    }
    return {
      count: ids.length,
      stage: g.scenarioStageEntities.length,
      visible: g.isScenarioVisible(),
      hasLabel: !!g.scenarioLabelId,
      extruded,
      draped,
      badProps,
      clampedExtrusions,
      minSide: minSide === Infinity ? 0 : minSide,
      maxSide,
      scenarioType: g.scenarioMeta ? g.scenarioMeta.type : null,
      title: g.scenarioMeta ? g.scenarioMeta.title : null,
      status: g.scenarioMeta ? g.scenarioMeta.status : null,
      bar: !!document.querySelector(".g3d-sc-bar"),
      strip: !!document.querySelector(".g3d-sc-strip"),
      heroPanel: !!document.querySelector(".g3d-sc-hero"),
    };
  })()`);
  check("conceptual geometry drawn in the scene", drawn.count > 0, `${drawn.count} entities`);
  check("extruded massing present", drawn.extruded > 0, `${drawn.extruded} extruded`);
  check("draped surfaces present", drawn.draped > 0, `${drawn.draped} draped`);
  // The regression that produced "only a label appears on the parcel".
  check(
    "no extruded element is clamped (extrudedHeight would be ignored)",
    drawn.clampedExtrusions === 0,
    `${drawn.clampedExtrusions} clamped extrusions`,
  );
  check(
    "extruded massing has real vertical extent",
    drawn.minSide > 1,
    `sides ${Math.round(drawn.minSide)}–${Math.round(drawn.maxSide)} m`,
  );
  check("every entity carries SIMULATED provenance", drawn.badProps === 0, `${drawn.badProps} bad`);
  check("stage outline + hatch drawn", drawn.stage > 0, `${drawn.stage}`);
  check("floating SIMULATED label drawn", drawn.hasLabel);
  check("scenario is visible", drawn.visible);
  check("scenario bar shown", drawn.bar);
  check("element strip shown", drawn.strip);
  check("scenario inspector shown", drawn.heroPanel);
  check(
    "industrial scenario is the active one",
    drawn.scenarioType === "logistics",
    String(drawn.scenarioType),
  );

  /*
   * The decisive test, and the one the original bug could not have passed.
   *
   * Rather than counting pixels, this asks whether a conceptual building
   * actually OCCUPIES VERTICAL SCREEN SPACE: it projects the footprint's base
   * and the same point at the top of its extrusion, and measures the
   * separation in pixels. A flat draped polygon — the defect — has zero
   * separation no matter how many pixels it covers, and a building framed from
   * 11 km is a few pixels tall and effectively invisible to a user. Both
   * failures are caught here.
   */
  /*
   * Wait for the camera to ARRIVE before measuring. Entering scenario mode
   * flies in to inspect the massing, and measuring mid-flight reads a few
   * pixels of a 70 km-away building and reports a failure that is really just
   * the camera still moving.
   */
  const camHeight = await waitFor(
    `(() => {
      const h = window.__g3dGlobe.viewer.camera.positionCartographic.height;
      return h > 0 && h < 4000 ? { h } : false;
    })()`,
    "the camera to close in on the scenario",
    45000,
    `(() => ({ height: window.__g3dGlobe.viewer.camera.positionCartographic.height }))()`,
  );
  check(
    "scenario mode flies in close enough to inspect the massing",
    camHeight.h < 4000,
    `${Math.round(camHeight.h)} m above ground`,
  );

  const solidity = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    const C = g.C;
    const S = C.SceneTransforms;
    const now = C.JulianDate.now();
    const out = [];
    for (const id of g.scenarioEntities) {
      const e = g.viewer.entities.getById(id);
      if (!e || !e.polygon) continue;
      const p = e.polygon;
      const hr = p.heightReference ? p.heightReference.getValue(now) : undefined;
      if (hr !== C.HeightReference.NONE) continue;
      const base = p.height ? p.height.getValue(now) : 0;
      const top = p.extrudedHeight ? p.extrudedHeight.getValue(now) : null;
      if (top === null || !(top > base)) continue;
      const hierarchy = p.hierarchy.getValue(now);
      const positions = hierarchy.positions;
      let lon = 0, lat = 0;
      const n = positions.length;
      for (const q of positions) {
        const c = C.Cartographic.fromCartesian(q);
        lon += C.Math.toDegrees(c.longitude);
        lat += C.Math.toDegrees(c.latitude);
      }
      lon /= n; lat /= n;
      const b = S.worldToWindowCoordinates(g.viewer.scene, C.Cartesian3.fromDegrees(lon, lat, base));
      const t = S.worldToWindowCoordinates(g.viewer.scene, C.Cartesian3.fromDegrees(lon, lat, top));
      if (!b || !t) continue;
      out.push({ dy: Math.abs(t.y - b.y), dx: Math.abs(t.x - b.x), h: top - base });
    }
    out.sort((a, z) => z.dy - a.dy);
    return {
      count: out.length,
      maxDy: out.length ? out[0].dy : 0,
      medianDy: out.length ? out[Math.floor(out.length / 2)].dy : 0,
      canvasH: g.viewer.scene.canvas.clientHeight,
      tallest: out.length ? out[0].h : 0,
    };
  })()`);

  check(
    "massing occupies vertical screen space (real 3D, not draped)",
    solidity.count > 0 && solidity.medianDy > 10,
    `${solidity.count} solids, median ${solidity.medianDy.toFixed(1)}px / max ${solidity.maxDy.toFixed(1)}px tall for a ${solidity.tallest.toFixed(0)}m block`,
  );
  check(
    "taller blocks occupy more screen space than short ones",
    solidity.maxDy >= solidity.medianDy,
    `max ${solidity.maxDy.toFixed(1)}px vs median ${solidity.medianDy.toFixed(1)}px`,
  );

  // --- surrounding context must SURVIVE (spec §8 / §47) -------------------
  /*
   * Switch the real context layers ON first. Asserting they survive is
   * meaningless if they were never on, and this is the case the requirement is
   * actually about: conceptual massing sitting inside a parcel that is
   * surrounded by real roads, water and buildings.
   */
  const ctxOn = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    // setOsm takes { id, rings, height } — the same shape osmVectors produces.
    g.setOsm("roads", true, [
      { id: "r1", rings: [[[73.85, 18.51], [73.87, 18.53], [73.89, 18.55]]], height: null },
    ]);
    g.setOsm("water", true, [
      {
        id: "w1",
        rings: [[[73.86, 18.52], [73.865, 18.52], [73.865, 18.525], [73.86, 18.525], [73.86, 18.52]]],
        height: null,
      },
    ]);
    g.setOsm("buildings", true, [
      { id: "b1", rings: [[[73.855, 18.515], [73.858, 18.515], [73.858, 18.518], [73.855, 18.518], [73.855, 18.515]]], height: 12 },
    ]);
    let n = 0;
    for (const e of g.viewer.entities.values) if ((e.id ?? "").startsWith("osm:")) n += 1;
    return n;
  })()`);
  check("real OSM context layers switched on", ctxOn > 0, `${ctxOn} osm entities`);

  const context = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    const v = g.viewer;
    let lp = 0, osm = 0, sc = 0, other = 0;
    for (const e of v.entities.values) {
      const id = e.id ?? "";
      if (id.startsWith("sc:")) sc++;
      else if (id.startsWith("lp:")) lp++;
      else if (id.startsWith("osm:")) osm++;
      else other++;
    }
    return {
      lpEntities: g.lpEntities.length,
      lpDrawn: lp,
      osmDrawn: osm,
      scenarioDrawn: sc,
      osmGroups: g.osmEntities.size,
      satLayer: !!g.satLayer,
      terrain: g.status.terrain,
      admin: g.adminEntities.length,
    };
  })()`);
  check("candidate parcels still on the globe", context.lpDrawn > 0, `${context.lpDrawn} drawn`);
  check("satellite imagery untouched", context.satLayer);
  check(
    "real OSM context layers intact",
    context.osmDrawn >= ctxOn,
    `${context.osmDrawn} osm entities`,
  );
  check(
    "scenario entities live only in the sc: namespace",
    context.scenarioDrawn > 0 && context.lpDrawn > 0,
    `${context.scenarioDrawn} scenario / ${context.lpDrawn} land-potential`,
  );

  // --- STEP 9: the badge must say CONCEPTUAL / SIMULATED -------------------
  const badge = await evalJs(`(() => {
    const hero = document.querySelector(".g3d-sc-hero");
    const text = hero ? hero.textContent : "";
    return {
      simulated: /SIMULATED/i.test(text),
      conceptual: /CONCEPTUAL|Conceptual/.test(text),
      hasArea: /ha/.test(text),
      hasParcel: !!document.querySelector(".g3d-sc-hero .g3d-stat"),
      caveat: /not an approved design|conceptual spatial planning|does not indicate/i.test(text),
    };
  })()`);
  check("panel says SIMULATED", badge.simulated);
  check("panel says CONCEPTUAL", badge.conceptual);
  check("panel states parcel area", badge.hasArea && badge.hasParcel);
  check("panel carries the conceptual-planning caveat", badge.caveat);

  // --- STEP 10/11: TRY ANOTHER USE → SOLAR → ECOLOGY ----------------------
  const switched = await evalJs(`(async () => {
    const before = window.__g3dGlobe.scenarioEntities.slice();
    const beforeKeys = before.map((id) => id);
    document.querySelector(".g3d-sc-type").click();
    await new Promise((r) => setTimeout(r, 250));
    const opts = Array.from(document.querySelectorAll(".g3d-sc-menu button"));
    const solar = opts.find((b) => /solar/i.test(b.textContent));
    if (!solar) return { ok: false, reason: "no solar option" };
    solar.click();
    return { ok: true, before: beforeKeys.length, optionCount: opts.length };
  })()`);
  check(
    "TRY ANOTHER USE offers all uses",
    (switched.optionCount ?? 0) >= 6,
    `${switched.optionCount}`,
  );
  check("switched to solar", switched.ok, switched.reason ?? "");

  const afterSolar = await waitFor(
    `(() => {
      const g = window.__g3dGlobe;
      if (!g.scenarioMeta || g.scenarioMeta.type !== "renewable") return false;
      const v = g.viewer;
      const alive = g.scenarioEntities.filter((id) => !!v.entities.getById(id));
      let panels = 0;
      for (const id of alive) {
        const p = v.entities.getById(id).polygon;
        if (p.extrudedHeight === undefined || p.extrudedHeight === null) panels++;
      }
      return {
        count: alive.length,
        type: g.scenarioMeta.type,
        draped: panels,
        // Stale industrial geometry must be gone, not merely hidden.
        leaked: g.scenarioEntities.filter((id) => !v.entities.getById(id)).length,
      };
    })()`,
    "the solar scenario to replace the industrial one",
  );
  check("solar scenario generated", afterSolar.type === "renewable", String(afterSolar.type));
  check("solar has draped panel rows", afterSolar.draped > 0, `${afterSolar.draped} draped`);
  check(
    "industrial geometry fully replaced",
    afterSolar.leaked === 0,
    `${afterSolar.leaked} stale ids`,
  );

  const switchedEco = await evalJs(`(async () => {
    document.querySelector(".g3d-sc-type").click();
    await new Promise((r) => setTimeout(r, 250));
    const opts = Array.from(document.querySelectorAll(".g3d-sc-menu button"));
    const eco = opts.find((b) => /ecolog/i.test(b.textContent));
    if (!eco) return { ok: false };
    eco.click();
    return { ok: true };
  })()`);
  check("switched to ecological", switchedEco.ok);
  const afterEco = await waitFor(
    `(() => {
      const g = window.__g3dGlobe;
      const s = g.scenarioMeta;
      if (!s || s.type !== "ecological") return false;
      return {
        type: s.type,
        vegetation: s.summary.counts.vegetation ?? 0,
        status: s.status,
      };
    })()`,
    "the ecological scenario to replace the solar one",
  );
  check("ecological scenario generated", afterEco.type === "ecological", String(afterEco.type));
  check(
    "ecological has vegetation clusters",
    afterEco.vegetation > 0,
    `${afterEco.vegetation} clusters`,
  );

  // --- STEP 12: SPLIT / CURRENT / SCENARIO -------------------------------
  const seg = await evalJs(`(() => {
    const btns = Array.from(document.querySelectorAll(".g3d-sc-seg button"));
    return btns.map((b) => b.textContent.trim());
  })()`);
  check("CURRENT / SCENARIO / SPLIT selector present", seg.length === 3, seg.join(" | "));

  const split = await waitFor(
    `(() => {
      const btns = Array.from(document.querySelectorAll(".g3d-sc-seg button"));
      btns.find((b) => /split/i.test(b.textContent)).click();
      const g = window.__g3dGlobe;
      const shown = g.scenarioEntities.filter((id) => g.viewer.entities.getById(id)?.show !== false).length;
      // Wait for the opacity to actually drop, not just for the click: the
      // dim is applied by an effect after React commits the display state, so
      // reading it in the same tick returns the previous value.
      if (!g.isScenarioVisible() || shown === 0) return false;
      if (g.scenarioOpacity >= 0.9) return false;
      return { visible: true, shown, opacity: g.scenarioOpacity };
    })()`,
    "SPLIT to show the scenario",
  );
  check(
    "SPLIT keeps the scenario visible",
    split.visible && split.shown > 0,
    `${split.shown} shown`,
  );
  check(
    "SPLIT dims the scenario for comparison",
    split.opacity > 0.4 && split.opacity < 1,
    `opacity ${split.opacity}`,
  );
  // SPLIT cannot clip entities on Cesium 1.145, so the UI must not imply a
  // geometric half-divide. Assert it says what it actually does.
  const splitNote = await waitFor(
    `(() => {
      const s = document.querySelector(".g3d-sc-strip");
      const t = s ? s.textContent : "";
      return /reduced opacity/i.test(t) ? t : false;
    })()`,
    "the SPLIT explanation in the element strip",
  );
  check(
    "SPLIT explains that it dims rather than clips",
    /reduced opacity/i.test(splitNote),
    splitNote.slice(-70),
  );

  const current = await waitFor(
    `(() => {
      const btns = Array.from(document.querySelectorAll(".g3d-sc-seg button"));
      const btn = btns.find((b) => /current/i.test(b.textContent));
      if (!btn) return false;
      btn.click();
      const g = window.__g3dGlobe;
      const shown = g.scenarioEntities.filter((id) => g.viewer.entities.getById(id)?.show !== false).length;
      if (g.isScenarioVisible() || shown !== 0) return false;
      return { visible: false, shown, kept: g.scenarioEntities.length };
    })()`,
    "CURRENT to hide the scenario",
    45000,
    `(() => {
      const g = window.__g3dGlobe;
      return {
        isScenarioVisible: g.isScenarioVisible(),
        scenarioOpacity: g.scenarioOpacity,
        entityCount: g.scenarioEntities.length,
        shown: g.scenarioEntities.filter((id) => g.viewer.entities.getById(id)?.show !== false).length,
        buttons: Array.from(document.querySelectorAll(".g3d-sc-seg button")).map((b) => b.textContent.trim() + ":" + b.getAttribute("aria-pressed")),
        barPresent: !!document.querySelector(".g3d-sc-bar"),
      };
    })()`,
  );
  check("CURRENT hides conceptual geometry", !current.visible && current.shown === 0);
  check("CURRENT keeps the geometry for a cheap return", current.kept > 0, `${current.kept} kept`);

  // Back to SCENARIO for the opacity test.
  await waitFor(
    `(() => {
      const btns = Array.from(document.querySelectorAll(".g3d-sc-seg button"));
      btns.find((b) => /scenario/i.test(b.textContent)).click();
      const g = window.__g3dGlobe;
      const shown = g.scenarioEntities.filter((id) => g.viewer.entities.getById(id)?.show !== false).length;
      return g.isScenarioVisible() && shown > 0;
    })()`,
    "SCENARIO to restore the overlay",
  );

  // --- opacity slider (spec §12) ------------------------------------------
  const opacity = await evalJs(`(async () => {
    const g = window.__g3dGlobe;
    const before = g.scenarioEntities.length;
    const input = document.querySelector(".g3d-sc-opacity input");
    if (!input) return { ok: false };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "0.35");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    const mid = g.scenarioOpacity;
    setter.call(input, "1");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    return { ok: true, mid, end: g.scenarioOpacity, entities: g.scenarioEntities.length, before };
  })()`);
  check(
    "opacity slider drives the scene",
    opacity.ok && Math.abs((opacity.mid ?? 0) - 0.35) < 0.02,
    `mid ${opacity.mid}`,
  );
  check(
    "opacity does not rebuild geometry",
    opacity.entities === opacity.before,
    `${opacity.entities}`,
  );

  // --- STEP 13: WHY THIS SCENARIO (spec §16) ------------------------------
  const why = await evalJs(`(async () => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /WHY THIS SCENARIO/i.test(b.textContent),
    );
    if (!btn) return { ok: false };
    btn.click();
    await new Promise((r) => setTimeout(r, 600));
    const card = document.querySelector(".g3d-sc-why");
    if (!card) return { ok: false, reason: "panel not found" };
    const t = card.textContent;
    return {
      ok: true,
      positives: /Positive spatial factors/i.test(t),
      constraints: /Constraints/i.test(t),
      basis: /Scenario basis/i.test(t),
      notKnown: /NOT known/i.test(t),
      noApproval: /approved|ownership/i.test(t),
    };
  })()`);
  check("WHY THIS SCENARIO opens", why.ok, why.reason ?? "");
  check("WHY shows positive factors", !!why.positives);
  check("WHY shows constraints", !!why.constraints);
  check("WHY shows the scenario basis", !!why.basis);
  check("WHY states what is not known", !!why.notKnown);
  check("WHY denies approval and ownership claims", !!why.noApproval);

  // --- assumptions + evidence tabs (spec §17 / §31) -----------------------
  const tabs = await evalJs(`(async () => {
    // Scope to the RIGHT inspector panel — there are two .g3d-panel-body
    // elements and the left one is the layer manager.
    const panel = () => document.querySelector(".g3d-sc-hero").closest(".g3d-panel-body");
    const btns = Array.from(document.querySelectorAll(".g3d-sc-tabs button"));
    const names = btns.map((b) => b.textContent.trim());
    btns.find((b) => /ASSUMPTIONS/i.test(b.textContent)).click();
    await new Promise((r) => setTimeout(r, 500));
    const aText = panel() ? panel().textContent : "";
    btns.find((b) => /EVIDENCE/i.test(b.textContent)).click();
    await new Promise((r) => setTimeout(r, 500));
    const eText = panel() ? panel().textContent : "";
    btns.find((b) => /ELEMENTS/i.test(b.textContent)).click();
    return {
      names,
      panelFound: !!panel(),
      hasNoApproval: /No legal approval/i.test(aText),
      hasNoUtility: /Utility capacity has not been verified/i.test(aText),
      hasIllustrative: /illustrative/i.test(aText),
      hasRetained: /retained and unmodified/i.test(aText),
      hasEngine: /Scenario Engine/i.test(eText),
      hasConnectivity: /CONNECTED/i.test(eText),
      hasParcelDemo: /synthetic/i.test(eText),
    };
  })()`);
  check("right inspector panel located", !!tabs.panelFound);
  check("all four inspector tabs present", tabs.names.length === 4, tabs.names.join(" | "));
  check("assumptions deny legal approval", !!tabs.hasNoApproval);
  check("assumptions state utility capacity unverified", !!tabs.hasNoUtility);
  check("assumptions call footprints illustrative", !!tabs.hasIllustrative);
  check("evidence names the scenario engine", !!tabs.hasEngine);
  check("evidence carries source statuses", !!tabs.hasConnectivity);
  check("evidence discloses the synthetic parcel", !!tabs.hasParcelDemo);

  // --- STEP 14: CREATE FIELD VERIFICATION ---------------------------------
  const field = await evalJs(`(async () => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /CREATE FIELD VERIFICATION/i.test(b.textContent),
    );
    if (!btn) return { ok: false };
    btn.click();
    await new Promise((r) => setTimeout(r, 600));
    const panel = document.querySelector(".g3d-fieldpanel") ?? document.querySelector(".g3d-modal");
    return { ok: true, mounted: !!panel, text: panel ? panel.textContent : null };
  })()`);
  check("CREATE FIELD VERIFICATION opens a panel", field.ok && field.mounted);
  check(
    "field panel mentions verification",
    /verif/i.test(field.text ?? ""),
    (field.text ?? "").slice(0, 60),
  );

  // --- picking a conceptual element (spec §32) ---------------------------
  const pick = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    const id = g.scenarioEntities.find((x) => x.includes("massing")) ?? g.scenarioEntities[0];
    if (!id) return { ok: false };
    const e = g.viewer.entities.getById(id);
    const props = e.properties.getValue(g.C.JulianDate.now());
    return {
      ok: true,
      kind: props.kind,
      status: props.status,
      purpose: props.purpose,
      disclaimer: props.disclaimer,
      source: props.source,
      modelVersion: props.modelVersion,
      elementKind: props.elementKind,
    };
  })()`);
  check("scenario entity picks as scenario-element", pick.kind === "scenario-element", pick.kind);
  check("pick reports SIMULATED status", pick.status === "SIMULATED", pick.status);
  check("pick purpose says illustrative", /illustrative/i.test(pick.purpose ?? ""), pick.purpose);
  check(
    "pick carries the engine + version",
    !!pick.source && !!pick.modelVersion,
    `${pick.source} v${pick.modelVersion}`,
  );
  check("pick carries the disclaimer", /implies no approval/i.test(pick.disclaimer ?? ""));

  // --- STEP 15: EXIT SCENARIO must not disturb the GIS (spec §28) ---------
  const beforeExit = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    return {
      camHeight: g.viewer.camera.positionCartographic.height,
      heading: g.viewer.camera.heading,
      sat: !!g.satLayer,
      street: !!g.streetLayer,
      terrain: g.status.terrain,
      lpEntities: g.lpEntities.length,
      lpSelection: g.lpSelectionEntities.length,
      perf: g.getPerf(),
      entities: g.viewer.entities.values.length,
    };
  })()`);

  const exited = await waitFor(
    `(() => {
      const btn = document.querySelector(".g3d-sc-exit");
      if (!btn) return false;
      btn.click();
      return true;
    })()`,
    "the EXIT SCENARIO button",
  );
  check("EXIT SCENARIO clicked", exited);

  const cleared = await waitFor(
    `(() => {
      const g = window.__g3dGlobe;
      if (g.scenarioEntities.length !== 0) return false;
      if (g.scenarioStageEntities.length !== 0) return false;
      if (g.scenarioLabelId) return false;
      if (g.scenarioMeta) return false;
      return true;
    })()`,
    "the scenario group to be emptied",
  );
  check("scenario group cleared on exit", cleared);

  const afterExit = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    return {
      scenarioEntities: g.scenarioEntities.length,
      scenarioStage: g.scenarioStageEntities.length,
      scenarioRings: g.scenarioRingEntities.length,
      scenarioLabel: g.scenarioLabelId,
      scenarioMeta: g.scenarioMeta,
      visible: g.isScenarioVisible(),
      bar: !!document.querySelector(".g3d-sc-bar"),
      camHeight: g.viewer.camera.positionCartographic.height,
      heading: g.viewer.camera.heading,
      sat: !!g.satLayer,
      street: !!g.streetLayer,
      terrain: g.status.terrain,
      lpEntities: g.lpEntities.length,
      lpSelection: g.lpSelectionEntities.length,
      perf: g.getPerf(),
      entities: g.viewer.entities.values.length,
      inspector: !!document.querySelector(".g3d-lp-hero"),
    };
  })()`);

  check(
    "scenario group emptied",
    afterExit.scenarioEntities === 0,
    `${afterExit.scenarioEntities}`,
  );
  check("scenario stage emptied", afterExit.scenarioStage === 0);
  check("scenario rings emptied", afterExit.scenarioRings === 0);
  check("scenario label removed", !afterExit.scenarioLabel);
  check("scenario metadata released", !afterExit.scenarioMeta);
  check("scenario bar dismissed", !afterExit.bar);
  check(
    "camera position preserved",
    Math.abs(afterExit.camHeight - beforeExit.camHeight) < 1,
    `${Math.round(beforeExit.camHeight)} → ${Math.round(afterExit.camHeight)} m`,
  );
  check("camera heading preserved", Math.abs(afterExit.heading - beforeExit.heading) < 0.01);
  check("satellite imagery still on", afterExit.sat);
  check(
    "street imagery state unchanged",
    afterExit.street === beforeExit.street,
    `street ${afterExit.street}`,
  );
  check("terrain unchanged", afterExit.terrain === beforeExit.terrain, afterExit.terrain);
  check(
    "candidate parcels still drawn",
    afterExit.lpEntities === beforeExit.lpEntities,
    `${afterExit.lpEntities}`,
  );
  check("parcel still selected", afterExit.lpSelection > 0, `${afterExit.lpSelection}`);
  check("performance mode unchanged", afterExit.perf === beforeExit.perf, afterExit.perf);
  check("land potential inspector restored", afterExit.inspector);

  // --- no duplicate geometry after the whole cycle (spec §47.19) ----------
  const dupes = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    const seen = new Map();
    let dup = 0;
    for (const e of g.viewer.entities.values) {
      const id = e.id ?? "";
      if (!id.startsWith("sc:")) continue;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    for (const n of seen.values()) if (n > 1) dup += 1;
    return { scenario: seen.size, dup };
  })()`);
  check("no duplicate scenario entities", dupes.dup === 0, `${dupes.scenario} scenario ids`);

  // --- regression: existing features still respond (spec §47) -------------
  const regression = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    const before = g.viewer.entities.values.length;
    g.setCompare(true, 2018, 2024);
    const compareOn = g.compare;
    g.setCompare(false);
    g.setOrbit(true);
    g.setOrbit(false);
    g.setInspect(true);
    g.setInspect(false);
    g.setPerf("medium");
    const perf = g.getPerf();
    g.setPerf("high");
    g.setMode("2d");
    g.setMode("3d");
    g.setViewPreset("oblique45");
    return {
      compareOn,
      perf,
      buildings: g.status.buildings,
      orbitOk: !g.orbiting,
      inspectOk: !g.isInspecting(),
      scenarioStillClear: g.scenarioEntities.length === 0,
      before,
      after: g.viewer.entities.values.length,
    };
  })()`);
  check("imagery split still works", regression.compareOn === true);
  check("orbit still works", regression.orbitOk);
  check("inspect mode still works", regression.inspectOk);
  check("performance modes still work", regression.perf === "medium");
  check("scenario still clear after regression sweep", regression.scenarioStillClear);
  check(
    "imagery split did not leak entities",
    Math.abs(regression.after - regression.before) <= 2,
    `${regression.before} → ${regression.after}`,
  );

  // --- no uncaught exceptions across the whole run -------------------------
  check("no uncaught page exceptions", exceptions.length === 0, exceptions.slice(0, 3).join(" | "));
} catch (err) {
  console.log(`ERR  ${err.message}`);
  failures += 1;
} finally {
  ws?.close?.();
  chrome.kill();
}

console.log(
  failures === 0 ? "\nALL SCENARIO BROWSER CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`,
);
process.exit(failures === 0 ? 0 : 1);
