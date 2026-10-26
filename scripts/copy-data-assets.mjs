import { cpSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// The server's policy/statutory API reads its model artefacts from
// process.cwd()/public/data at request time. On Vercel those files are served
// from the CDN out of public/, but the Node serverless function's cwd is the
// function directory, so the files must exist there too or every policies
// endpoint answers {available:false}.
const out = join(process.cwd(), ".vercel", "output", "functions");
if (!existsSync(out)) {
  console.log("[copy-data-assets] no .vercel/output/functions — skipping (non-vercel preset)");
  process.exit(0);
}
const funcs = readdirSync(out, { withFileTypes: true }).filter(
  (e) => e.isDirectory() && e.name.endsWith(".func"),
);
for (const fn of funcs) {
  const dest = join(out, fn.name, "public", "data");
  mkdirSync(dest, { recursive: true });
  cpSync(join(process.cwd(), "public", "data"), dest, { recursive: true });
  console.log(`[copy-data-assets] copied public/data -> ${dest}`);
}
