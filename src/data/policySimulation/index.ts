/**
 * Policy Simulation — mock data layer entry point.
 *
 * Components must import from `@/data/policySimulation` only. Every value the
 * feature shows is reachable from here, so swapping this folder for an HTTP
 * client (`getPolicies()`, `runScenario()`) requires no component changes.
 */

export * from "./types";
export * from "./datasets";
export * from "./indicators";
export * from "./geographies";
export * from "./observations";
export * from "./policies";
export * from "./scenarios";
export * from "./simulation";
export * from "./rulePacks";
export * from "./basis";
export * from "./compose";
export * from "./draftFromExtraction";
export { LIBRARY, unsourcedCount, citationCount } from "./library";

import { datasetById, datasetsByIds } from "./datasets";
import { GEOGRAPHIES, LAND_CATEGORY_LIST } from "./geographies";
import { INDICATORS, indicatorById, indicatorsByIds } from "./indicators";
import { POLICIES } from "./policies";
import type { Dataset, Indicator, Policy } from "./types";

/** Counts for the overview screen. Only fields a view actually reads. */
export const MOCK_LAYER_MANIFEST = {
  policies: POLICIES.length,
  indicators: INDICATORS.length,
  geographies: GEOGRAPHIES.length,
};

export const datasetByPolicy = (policy: Policy): Dataset[] => datasetsByIds(policy.datasetIds);

export const indicatorByPolicy = (policy: Policy): Indicator[] =>
  indicatorsByIds(policy.indicators.map((i) => i.indicatorId));

export const datasetOf = (id: string): Dataset | undefined => datasetById(id);
export const indicatorOf = (id: string): Indicator | undefined => indicatorById(id);

export { LAND_CATEGORY_LIST };
