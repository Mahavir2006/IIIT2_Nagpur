// @lovable.dev/vite-tanstack-config already includes the following â€" do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

/**
 * Load .env into process.env for the dev/build Node process.
 *
 * Vite only surfaces VITE_* vars (browser-safe) via import.meta.env, but the
 * server routes under src/server/ need non-public secrets (e.g.
 * OPENROUTER_API_KEY for POST /api/ai). Those modules run inside this same
 * process during `vite dev`, so setting process.env here makes them readable
 * without ever exposing the key to the client bundle. On deployed edge
 * runtimes the key arrives as a plain env binding instead.
 */
function loadDotEnv(): void {
  const file = resolve(process.cwd(), ".env");
  if (!existsSync(file)) return;
  const raw = readFileSync(file, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const name = match[1];
    if (!name || process.env[name] !== undefined) continue;
    let value = match[2] ?? "";
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  }
}

loadDotEnv();

export default defineConfig({
  // CesiumJS runtime assets (Workers/ThirdParty/Assets/Widgets) are served from
  // `public/cesium/` — see scripts/copy-cesium-assets.mjs. The bare global
  // `CESIUM_BASE_URL` is what Cesium's buildModuleUrl() resolves at runtime, so
  // it must be a compile-time define (the identifier would otherwise be
  // undefined in a bundled ESM build).
  vite: {
    define: {
      CESIUM_BASE_URL: JSON.stringify("/cesium/"),
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: {
    /* Vercel is the deploy target. Outside a Lovable sandbox build the preset
       here is authoritative; inside one, LOVABLE_NITRO_PRESET wins and the
       Cloudflare layout is kept so the Lovable preview keeps working. */
    ...(process.env["LOVABLE"] ? {} : { preset: process.env["NITRO_PRESET"] ?? "vercel" }),
  },
});
