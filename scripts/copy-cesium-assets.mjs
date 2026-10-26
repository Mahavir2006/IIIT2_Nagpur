/**
 * Copies the CesiumJS static runtime assets into `public/cesium/`.
 *
 * Cesium loads its Workers, ThirdParty libs, Assets and Widgets at RUNTIME by
 * URL (resolved from the `CESIUM_BASE_URL` global), so bundlers cannot inline
 * them. Vite serves `public/` at the site root in dev and copies it into the
 * build output, which means:
 *
 *   dev server  → http://localhost:8080/cesium/Workers/...
 *   production  → <output>/cesium/Workers/...
 *
 * `public/cesium/` is git-ignored; this script runs on `npm install`
 * (postinstall) so a fresh clone is ready without committing ~7 MB of
 * third-party binaries. Safe to run repeatedly.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "cesium", "Build", "Cesium");
const dest = join(root, "public", "cesium");
const DIRS = ["Workers", "ThirdParty", "Assets", "Widgets"];

if (!existsSync(src)) {
  console.warn("[cesium-assets] node_modules/cesium not found — run `npm install` first.");
  process.exit(0);
}

try {
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const dir of DIRS) {
    const from = join(src, dir);
    if (existsSync(from)) cpSync(from, join(dest, dir), { recursive: true });
  }
  console.log(`[cesium-assets] copied ${DIRS.join(", ")} → public/cesium/`);
} catch (err) {
  console.warn("[cesium-assets] copy failed (non-fatal):", err?.message ?? err);
}
