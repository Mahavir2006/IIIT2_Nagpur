/**
 * Rewrite every tracked text file to LF endings.
 *
 * The repo was committed with CRLF, and Prettier (which runs as an ESLint rule)
 * reports a "Delete ␍" error per line, which is why lint showed ~51k errors.
 * Normalising to LF plus the `.gitattributes` rule makes lint fast and clean.
 *
 * Usage: node scripts/normalize-line-endings.mjs [--check]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHECK = process.argv.includes("--check");
const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp4",
  ".webm",
  ".mov",
  ".wasm",
  ".zip",
  ".pdf",
  ".bin",
  ".node",
]);

function isBinary(file) {
  return BINARY_EXT.has(path.extname(file).toLowerCase());
}

const files = execSync("git ls-files", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !isBinary(f) && fs.existsSync(f));

let changed = 0;
let crlfFiles = 0;
const skipped = [];

for (const file of files) {
  let buf;
  try {
    buf = fs.readFileSync(file);
  } catch {
    skipped.push(file);
    continue;
  }
  if (buf.includes(0)) continue; // binary sniffed by content

  const text = buf.toString("utf8");
  if (!text.includes("\r\n")) continue;

  crlfFiles += 1;
  const lf = text.replace(/\r\n/g, "\n");
  if (!CHECK) {
    fs.writeFileSync(file, Buffer.from(lf, "utf8"));
    changed += 1;
  }
}

console.log(
  CHECK
    ? `would rewrite ${crlfFiles} file(s) with CRLF endings (of ${files.length} tracked)`
    : `rewrote ${changed} file(s) to LF (${crlfFiles} had CRLF, ${files.length} tracked scanned)`,
);
if (skipped.length) console.log(`skipped ${skipped.length} unreadable file(s)`);
