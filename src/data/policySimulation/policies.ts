import { LIBRARY } from "./library";
import type { Policy } from "./types";

/**
 * The policy library consumed by every component in the feature.
 *
 * This is the real library — one entry per instrument read out of the policy
 * folder, each carrying its citation, its dates and a per-parameter evidence
 * trail. Components import from `@/data/policySimulation` and never from here
 * directly, so replacing this array with an HTTP response requires no change to
 * any view.
 */
export const POLICIES: Policy[] = LIBRARY;

const POLICY_INDEX = new Map(POLICIES.map((p) => [p.id, p]));

/**
 * Drafts built from a PDF the user uploaded in this browser tab.
 *
 * The app has no backend and no database, so a draft cannot be persisted. It
 * does need to be runnable by the engine, which resolves policies by id — so
 * it is registered here for the lifetime of the tab and disappears on reload.
 * That is the honest behaviour: the UI says as much, and offers the draft as a
 * JSON download so it can be moved into `library/` to make it permanent.
 */
const DRAFTS = new Map<string, Policy>();

export const registerDraft = (policy: Policy): void => {
  DRAFTS.set(policy.id, policy);
};

export const policyById = (id: string): Policy | undefined =>
  DRAFTS.get(id) ?? POLICY_INDEX.get(id);
