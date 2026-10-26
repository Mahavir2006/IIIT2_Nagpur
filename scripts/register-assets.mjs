/**
 * Lets the verification scripts import components that reference binary assets.
 *
 * OverviewView imports `policy_home.mp4`, and bare Node has no loader for .mp4
 * or .css. The bundler handles this in the real app; here we only need the module
 * graph to resolve, so those specifiers resolve to a stub string.
 *
 * Used as: node --import tsx --import ./scripts/register-assets.mjs <script>
 */

import { register } from "node:module";

register(new URL("./asset-stub-hooks.mjs", import.meta.url).href, import.meta.url);
