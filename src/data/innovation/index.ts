/**
 * Innovation Portal data layer.
 *
 * Every collection the portal renders lives under this module so a backend can
 * replace these records without touching components. Split by concern:
 *
 * - `challenges`   — challenge briefs (spec §4) and the evaluation rubric
 * - `ecosystem`   — lifecycle pipeline, live pulse, research bridge, impact stories
 * - `workspace`   — collaborative project workspaces, team roles, workspace modules
 * - `submission`  — submission wizard step definitions and draft autosave
 *
 * All records are DEMO data. Figures, deadlines, institutions and outcomes are
 * illustrative and must not be presented as official government data.
 */

export * from "./challenges";
export * from "./ecosystem";
export * from "./workspace";
export * from "./evaluation";
export * from "./impact";
export * from "./submission";
