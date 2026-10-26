/**
 * Resolve hooks that stub binary/asset imports for the verification scripts.
 * See scripts/register-assets.mjs for why this exists.
 */

const STUBBED = new Set([".mp4", ".css", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".woff2"]);

export async function resolve(specifier, context, nextResolve) {
  const dot = specifier.lastIndexOf(".");
  if (dot >= 0 && STUBBED.has(specifier.slice(dot).toLowerCase())) {
    return {
      url: `data:text/javascript,export default ${JSON.stringify(specifier)};`,
      shortCircuit: true,
      format: "module",
    };
  }
  return nextResolve(specifier, context);
}
