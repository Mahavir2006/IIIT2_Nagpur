/**
 * Headless end-to-end check for the LAND POTENTIAL layer.
 *
 * Boots Chrome against the dev server, turns the feature on through the real
 * UI button, then reads the CesiumGlobe state to confirm candidates were drawn,
 * selects a parcel through the real selection API (outline + extrusion +
 * conceptual overlay + pulse), switches the feature off again, and fails on
 * any uncaught page exception.
 *
 *   node scripts/lp-browser-check.mjs
 */
import { spawn } from "node:child_process";

const CHROME =
  process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const URL_TARGET = process.env.LP_URL ?? "http://localhost:8080/gis-explorer-3d";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    `--user-data-dir=${process.env.TEMP ?? "/tmp"}/chrome-lp-check`,
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
  // --- attach -------------------------------------------------------------
  let target = null;
  for (let i = 0; i < 40 && !target; i += 1) {
    await sleep(500);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      target = list.find((t) => t.type === "page") ?? null;
    } catch {
      /* devtools not up yet */
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

  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: URL_TARGET });

  // --- wait for the globe --------------------------------------------------
  let ready = false;
  for (let i = 0; i < 60 && !ready; i += 1) {
    await sleep(500);
    ready = await evalJs(
      `!!document.querySelector("#g3d-lp-toggle") && !!document.querySelector(".g3d-lp-card") && !!window.__g3dGlobe && !!document.querySelector(".cesium-widget canvas")`,
    ).catch(() => false);
  }
  check("globe + navbar toggle + layer card mounted", ready);
  if (!ready) throw new Error("globe never became ready");

  // --- turn the feature on through the real navbar button ------------------
  const powerOn = await evalJs(`(() => {
    const btn = document.querySelector("#g3d-lp-toggle");
    const before = btn.getAttribute("aria-pressed");
    btn.click();
    return before;
  })()`);
  check("navbar toggle starts OFF", powerOn === "false", String(powerOn));

  // The camera flight + debounced re-screen needs a few seconds to settle.
  await sleep(9000);

  const after = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    const btn = document.querySelector("#g3d-lp-toggle");
    const toolbar = document.querySelector(".g3d-lp-toolbar");
    const legend = document.querySelector(".g3d-lp-legend");
    const result = document.querySelector(".g3d-lp-result");
    return {
      power: btn ? btn.getAttribute("aria-pressed") : null,
      toolbar: !!toolbar,
      legend: !!legend,
      message: result ? result.textContent.trim() : null,
      entities: g ? g.lpEntities.length : -1,
      clusters: g ? g.lpEntities.filter((id) => id.includes("cluster")).length : -1,
      labels: g ? g.lpLabelEntities.length : -1,
    };
  })()`);
  check("navbar toggle reads ON", after.power === "true", String(after.power));
  check("floating toolbar visible", after.toolbar);
  check("legend visible", after.legend);
  check("candidates drawn on the globe", after.entities > 0, `${after.entities} entities`);
  check("screening result reported", !!after.message, after.message ?? "");
  check(
    "message states the screening caveat",
    /Screening assessment only/.test(after.message ?? ""),
  );

  // --- the analysis card in the right inspector -----------------------------
  const results = await evalJs(`(() => {
    const card = document.querySelector(".g3d-lp-results");
    const rows = document.querySelectorAll(".g3d-lp-resultrow").length;
    const segs = document.querySelectorAll(".g3d-lp-resultrow-strip i").length;
    const criteria = document.querySelectorAll(".g3d-lp-criteria span").length;
    const boundaryLines = window.__g3dGlobe.lpEntities.filter((x) => x.includes("line:")).length;
    const polygons = window.__g3dGlobe.lpEntities.filter(
      (x) => !x.includes("line:") && !x.includes("cluster"),
    ).length;
    return {
      card: !!card,
      rows,
      segs,
      criteria,
      boundaryLines,
      polygons,
      count: card ? card.querySelector(".g3d-lp-results-count")?.textContent ?? null : null,
    };
  })()`);
  check("analysis card shown on the right", results.card, results.count ?? "");
  check("analysis rows rendered", results.rows >= 10, `${results.rows} rows`);
  check(
    "per-use heatmap strip per row",
    results.segs === results.rows * 6,
    `${results.segs} ticks`,
  );
  check("applied criteria echoed", results.criteria >= 1, `${results.criteria} chips`);
  const resultsCross = await evalJs(`(() => {
    const btn = document.querySelector(".g3d-lp-results .g3d-lp-results-close");
    return btn ? { found: true, label: btn.getAttribute("aria-label") } : { found: false };
  })()`);
  check(
    "analysis card has its own cross button",
    resultsCross.found,
    resultsCross.label ?? "missing",
  );
  check(
    "every parcel has a boundary line",
    results.boundaryLines > 0 && results.boundaryLines === results.polygons,
    `${results.boundaryLines} lines / ${results.polygons} parcels`,
  );

  // --- select a parcel through the real selection API ----------------------
  const sel = await evalJs(`(async () => {
    const g = window.__g3dGlobe;
    const C = g.C;
    const id = g.lpEntities.find((x) => !x.includes("cluster") && !x.includes("label"));
    if (!id) return { ok: false, reason: "no parcel entity" };
    const entity = g.viewer.entities.getById(id);
    const hierarchy = entity.polygon.hierarchy.getValue(C.JulianDate.now());
    const ring = hierarchy.positions.map((p) => {
      const c = C.Cartographic.fromCartesian(p);
      return [C.Math.toDegrees(c.longitude), C.Math.toDegrees(c.latitude)];
    });
    g.setLandPotentialSelection({
      id: "DEMO-PUN-00421",
      ring,
      conceptual: { color: "#E7B84B", label: "CONCEPTUAL SCENARIO · SIMULATED" },
    });
    await new Promise((r) => setTimeout(r, 400));
    return {
      ok: true,
      selectionEntities: g.lpSelectionEntities.length,
      pulsing: !!g.lpPulse,
    };
  })()`);
  check(
    "selected parcel draws outline + volume + overlay",
    sel.ok && sel.selectionEntities >= 3,
    `${sel.selectionEntities ?? 0} selection entities`,
  );
  check("selection pulse attached", !!sel.pulsing);

  // --- the hero interaction: pick a parcel like a user click would --------
  // A candidate is only a few pixels wide from the district-wide framing, so
  // a user zooms in before clicking. Frame the parcel first, then pick at the
  // centroid — sampling around it because a neighbouring parcel's boundary
  // polyline can sit exactly on the centre point.
  const framed = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    const C = g.C;
    const id = g.lpEntities.find(
      (x) => !x.includes("cluster") && !x.includes("label") && !x.includes("line:"),
    );
    if (!id) return { ok: false, reason: "no parcel entity" };
    const entity = g.viewer.entities.getById(id);
    const hierarchy = entity.polygon.hierarchy.getValue(C.JulianDate.now());
    const pts = hierarchy.positions;
    const avg = pts.reduce((acc, p) => {
      acc.x += p.x; acc.y += p.y; acc.z += p.z; return acc;
    }, { x: 0, y: 0, z: 0 });
    const c = C.Cartographic.fromCartesian({
      x: avg.x / pts.length, y: avg.y / pts.length, z: avg.z / pts.length,
    });
    g.flyToLandPotential(C.Math.toDegrees(c.longitude), C.Math.toDegrees(c.latitude), 6000, -60);
    return { ok: true, id };
  })()`);
  await sleep(5000);
  const picked = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    const C = g.C;
    const scene = g.viewer.scene;
    const canvas = g.viewer.canvas;
    const tf = C.SceneTransforms.worldToWindowCoordinates ?? C.SceneTransforms.wgs84ToWindowCoordinates;
    const ids = g.lpEntities.filter(
      (x) => !x.includes("cluster") && !x.includes("label") && !x.includes("line:"),
    );
    for (const id of ids) {
      const entity = g.viewer.entities.getById(id);
      if (!entity?.polygon) continue;
      const hierarchy = entity.polygon.hierarchy.getValue(C.JulianDate.now());
      const pts = hierarchy?.positions ?? [];
      if (pts.length === 0) continue;
      const avg = pts.reduce((acc, p) => {
        acc.x += p.x; acc.y += p.y; acc.z += p.z; return acc;
      }, { x: 0, y: 0, z: 0 });
      const centre = { x: avg.x / pts.length, y: avg.y / pts.length, z: avg.z / pts.length };
      const base = tf(scene, centre);
      if (!base) continue;
      for (const [dx, dy] of [[0,0],[3,0],[-3,0],[0,3],[0,-3],[6,6],[-6,-6],[6,-6],[-6,6]]) {
        const x = base.x + dx;
        const y = base.y + dy;
        if (x < 0 || y < 0 || x > canvas.clientWidth || y > canvas.clientHeight) continue;
        const pos = new C.Cartesian2(x, y);
        const hit = scene.pick(pos);
        const hid = hit?.id ? String(hit.id.id ?? hit.id) : null;
        if (hid && hid.startsWith("lp:")) {
          g.pick(pos);
          return { ok: true, id, hit: hid };
        }
      }
    }
    return { ok: false, reason: "no parcel under any sampled point" };
  })()`);
  check(
    "parcel pick resolved",
    framed.ok && picked.ok,
    picked.reason ?? `${picked.id} via ${picked.hit}`,
  );
  await sleep(2500);
  console.log(
    "pick-debug:",
    await evalJs(`JSON.stringify({
      ctx: document.querySelector(".g3d-context")?.textContent ?? null,
      empty: document.querySelector(".g3d-empty")?.textContent?.slice(0, 80) ?? null,
      firstCard: document.querySelector(".g3d-panel-right .g3d-card h3, .g3d-right .g3d-card h3")?.textContent ?? null,
      hero: !!document.querySelector(".g3d-lp-hero"),
      entityProps: (() => {
        const g = window.__g3dGlobe;
        const e = g.viewer.entities.getById("lp:sel:concept:DEMO-PUN-00421");
        if (!e) return null;
        const raw = e.properties ?? {};
        const bag = typeof raw.getValue === "function" ? raw.getValue(window.__g3dGlobe.C.JulianDate.now()) : null;
        return {
          ctor: raw.constructor?.name,
          ownKeys: Object.keys(raw).slice(0, 8),
          accessorKind: raw.kind && typeof raw.kind.getValue === "function" ? raw.kind.getValue() : String(raw.kind),
          bagValue: bag,
        };
      })(),
    })`),
  );

  const hero = await evalJs(`(() => {
    const hero = document.querySelector(".g3d-lp-hero");
    const scores = document.querySelectorAll(".g3d-lp-scorerow").length;
    const tabs = Array.from(document.querySelectorAll(".g3d-tabs button")).map((b) => b.textContent.trim());
    return { hero: !!hero, text: hero ? hero.textContent.slice(0, 160) : "", scores, tabs };
  })()`);
  check("assessment inspector opened", hero.hero, hero.text);
  check("potential-use score rows rendered", hero.scores >= 3, `${hero.scores} rows`);
  check(
    "INSPECT tab active",
    hero.tabs.some((t) => t === "INSPECT"),
  );

  // WHY panel
  await evalJs(`document.querySelector(".g3d-lp-why")?.click()`);
  await sleep(400);
  const why = await evalJs(`(() => {
    const card = document.querySelector(".g3d-lp-why-card");
    return card ? card.textContent : null;
  })()`);
  check("WHY panel opens with basis", !!why && /screening suitability/i.test(why ?? ""));
  check(
    "WHY panel carries the disclaimer",
    !!why && /does not constitute legal authorisation/i.test(why ?? ""),
  );

  // Compare uses
  await evalJs(
    `Array.from(document.querySelectorAll(".g3d-card .g3d-actions button")).find((b) => b.textContent.includes("COMPARE USES"))?.click()`,
  );
  await sleep(400);
  const compare = await evalJs(`(() => {
    const cards = document.querySelectorAll(".g3d-lp-comparecard").length;
    const head = document.querySelector(".g3d-lp-comparehead")?.textContent ?? "";
    return { cards, head };
  })()`);
  check("comparison shows every use", compare.cards >= 3, `${compare.cards} cards`);
  check("comparison titled", /COMPARE POTENTIAL USES/.test(compare.head));
  await evalJs(`document.querySelector(".g3d-lp-back")?.click()`);
  await sleep(300);

  // --- analysis card ↔ assessment round-trip ------------------------------
  await evalJs(`document.querySelector(".g3d-context .g3d-x")?.click()`);
  await sleep(700);
  check(
    "clearing selection returns to the analysis card",
    await evalJs(`!!document.querySelector(".g3d-lp-results")`),
  );
  await evalJs(`document.querySelectorAll(".g3d-lp-resultrow")[0]?.click()`);
  await sleep(2600);
  const rowPick = await evalJs(`(() => ({
    hero: !!document.querySelector(".g3d-lp-hero"),
    text: document.querySelector(".g3d-lp-hero")?.textContent?.slice(0, 90) ?? null,
  }))()`);
  check("row click opens the assessment", rowPick.hero, rowPick.text ?? "");
  await evalJs(`document.querySelector(".g3d-context .g3d-x")?.click()`);
  await sleep(700);
  check(
    "analysis card back after second clear",
    await evalJs(`!!document.querySelector(".g3d-lp-results")`),
  );

  // --- the card's own close (cross) button ---------------------------------
  const closeBtn = await evalJs(`(() => {
    const btn = document.querySelector(".g3d-lp-toolbar-close");
    if (!btn) return { found: false };
    btn.click();
    return { found: true, label: btn.getAttribute("aria-label") };
  })()`);
  check("toolbar has a cross button", closeBtn.found, closeBtn.label ?? "missing");
  await sleep(1400);
  const closed = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    return {
      pressed: document.querySelector("#g3d-lp-toggle").getAttribute("aria-pressed"),
      toolbar: !!document.querySelector(".g3d-lp-toolbar"),
      entities: g.lpEntities.length,
      selection: g.lpSelectionEntities.length,
    };
  })()`);
  check("cross closes the card", !closed.toolbar);
  check("cross turns the feature off", closed.pressed === "false", String(closed.pressed));
  check("cross clears the globe", closed.entities === 0 && closed.selection === 0);

  // The navbar switch brings it back.
  await evalJs(`document.querySelector("#g3d-lp-toggle").click()`);
  await sleep(3500);
  const reopened = await evalJs(`(() => ({
    pressed: document.querySelector("#g3d-lp-toggle").getAttribute("aria-pressed"),
    toolbar: !!document.querySelector(".g3d-lp-toolbar"),
    closeAgain: !!document.querySelector(".g3d-lp-toolbar-close"),
    entities: window.__g3dGlobe.lpEntities.length,
  }))()`);
  check(
    "navbar switch reopens the card",
    reopened.pressed === "true" && reopened.toolbar && reopened.closeAgain,
    `${reopened.entities} entities`,
  );

  // --- the analysis card's own close (cross) button ------------------------
  const resultsClose = await evalJs(`(() => {
    const btn = document.querySelector(".g3d-lp-results .g3d-lp-results-close");
    if (!btn) return { found: false };
    btn.click();
    return { found: true, label: btn.getAttribute("aria-label") };
  })()`);
  check("analysis card cross is clickable", resultsClose.found, resultsClose.label ?? "missing");
  await sleep(1400);
  const rclosed = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    return {
      pressed: document.querySelector("#g3d-lp-toggle").getAttribute("aria-pressed"),
      card: !!document.querySelector(".g3d-lp-results"),
      toolbar: !!document.querySelector(".g3d-lp-toolbar"),
      entities: g.lpEntities.length,
      selection: g.lpSelectionEntities.length,
    };
  })()`);
  check("analysis cross closes the card", !rclosed.card);
  check("analysis cross hides the toolbar", !rclosed.toolbar);
  check(
    "analysis cross turns the feature off",
    rclosed.pressed === "false",
    String(rclosed.pressed),
  );
  check(
    "analysis cross clears the globe",
    rclosed.entities === 0 && rclosed.selection === 0,
    `${rclosed.entities}/${rclosed.selection} left`,
  );

  // Bring it back for the final switch-off assertions.
  await evalJs(`document.querySelector("#g3d-lp-toggle").click()`);
  await sleep(3500);

  // --- switch it off again --------------------------------------------------
  await evalJs(`document.querySelector("#g3d-lp-toggle").click()`);
  await sleep(1200);
  const off = await evalJs(`(() => {
    const g = window.__g3dGlobe;
    return {
      power: document.querySelector("#g3d-lp-toggle").getAttribute("aria-pressed"),
      entities: g.lpEntities.length,
      selection: g.lpSelectionEntities.length,
      toolbar: !!document.querySelector(".g3d-lp-toolbar"),
      layers: document.querySelectorAll(".g3d-lp-card").length,
    };
  })()`);
  check("switching off flips the navbar toggle", off.power === "false", String(off.power));
  check("switching off clears the globe", off.entities === 0, `${off.entities} left`);
  check("switching off clears the selection", off.selection === 0, `${off.selection} left`);
  check("switching off hides the toolbar", !off.toolbar);
  check("layer card still listed when off", off.layers === 1);

  check("no uncaught page exceptions", exceptions.length === 0, exceptions.join(" | "));
} catch (err) {
  failures += 1;
  console.log(`FAIL  harness — ${err.message}`);
} finally {
  ws?.close?.();
  chrome.kill();
}
console.log(failures === 0 ? "\nALL BROWSER CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
