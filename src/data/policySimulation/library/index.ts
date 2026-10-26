import type { Policy } from "../types";

/**
 * The real policy library.
 *
 * Every entry was built from a document in the project's policy folder. The
 * three synthetic templates the prototype shipped with have been replaced: their
 * rule sets survive in `../rulePacks.ts` and are now attached to real
 * instruments, so the engine keeps the elasticities it was tested with while
 * the citation, the dates and the parameter values are real.
 *
 * `unsourcedCount` is worth reading before quoting any figure from a run. It
 * counts parameters whose value is a modelling choice rather than something the
 * source document states — for the scanned instruments that number is high, and
 * the UI flags each one.
 */

export * from "./units";
export { aadhaarAct, fragmentationAct, landRevenueCode, tenancyAct } from "./land-revenue";
export {
  mrAndTpAct,
  regionalPlan,
  udcpr,
  udcprEquivalencyOrder,
  zonalMasterPlanMesz,
} from "./planning";
export {
  industrialPolicy2013,
  industrialPolicy2019,
  logisticsPolicy2024,
  midcAct,
  mips2025,
} from "./industry";

import { aadhaarAct, fragmentationAct, landRevenueCode, tenancyAct } from "./land-revenue";
import {
  mrAndTpAct,
  regionalPlan,
  udcpr,
  udcprEquivalencyOrder,
  zonalMasterPlanMesz,
} from "./planning";
import {
  industrialPolicy2013,
  industrialPolicy2019,
  logisticsPolicy2024,
  midcAct,
  mips2025,
} from "./industry";

/** Declared in the order the UI groups them by domain. */
export const LIBRARY: Policy[] = [
  // Land use, revenue and holdings
  landRevenueCode,
  tenancyAct,
  fragmentationAct,
  aadhaarAct,
  // Planning and zoning
  mrAndTpAct,
  udcpr,
  udcprEquivalencyOrder,
  regionalPlan,
  zonalMasterPlanMesz,
  // Industry, investment and logistics
  midcAct,
  mips2025,
  industrialPolicy2019,
  industrialPolicy2013,
  logisticsPolicy2024,
];

/** Parameters on a policy that carry no citation from a source document. */
export const unsourcedCount = (policy: Policy): number =>
  policy.parameters.filter((p) => !p.evidence).length;

/** Policy-level citations, for the library's provenance line. */
export const citationCount = (policy: Policy): number =>
  (policy.evidence?.length ?? 0) + policy.parameters.filter((p) => p.evidence).length;
