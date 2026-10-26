/**
 * LAND POTENTIAL — provenance rows.
 *
 * The explorer's standing rule is "nothing is ever drawn that did not come
 * from a named source". This module is the land-potential half of that ledger:
 * every source the assessment touches, with its DATE, TYPE and STATUS.
 *
 * The statuses are literal. `not-connected` rows are listed because the feature
 * needs them, and marked NOT AVAILABLE because no licensed dataset is wired —
 * exactly like the layer manager's "Not connected" rows. These rows are the
 * ones the inspector shows and the ones appended to the app-wide source
 * registry (`src/data/data-sources.ts`).
 */

import type { EvidenceKind } from "@/components/gis3d/types";
import type { FieldStatus } from "./landPotentialTypes";

export interface LandSourceRow {
  id: string;
  /** Dataset name shown in the capsule. */
  source: string;
  /** Observation / version date. */
  date: string;
  /** TYPE — how the value on screen was produced. */
  kind: EvidenceKind;
  /** STATUS — what is actually wired in this build. */
  status: FieldStatus;
  detail: string;
}

export const LAND_POTENTIAL_SOURCES: LandSourceRow[] = [
  {
    id: "sentinel-2",
    source: "Sentinel-2 cloudless mosaic",
    date: "annual 2018–2024",
    kind: "observed",
    status: "connected",
    detail: "Year-switchable imagery the globe is already drawing. Real observations.",
  },
  {
    id: "terrain",
    source: "Elevation / terrain",
    date: "n/a",
    kind: "observed",
    status: "connected",
    detail:
      "Cesium World Terrain where the provider connects; WGS84 ellipsoid otherwise — status reported live, never estimated.",
  },
  {
    id: "osm-roads",
    source: "Road network (OpenStreetMap)",
    date: "rolling",
    kind: "observed",
    status: "connected",
    detail: "Overpass ways inside the current camera extent, same layer the explorer already uses.",
  },
  {
    id: "osm-buildings",
    source: "Buildings & settlements (OpenStreetMap)",
    date: "rolling",
    kind: "observed",
    status: "connected",
    detail: "OSM Buildings tileset plus viewport extrusions for the surrounding-context readout.",
  },
  {
    id: "protected-areas",
    source: "Protected / reserved areas (OpenStreetMap)",
    date: "rolling",
    kind: "observed",
    status: "connected",
    detail: "Used for the hard-constraint overlap check when the protected layer is on.",
  },
  {
    id: "parcel-geometry",
    source: "Candidate parcel geometry",
    date: "generated in code",
    kind: "demo",
    status: "demo",
    detail:
      "SYNTHETIC polygons over real Pune-district coordinates. Not cadastral, not a land record, ids prefixed DEMO-.",
  },
  {
    id: "ownership",
    source: "Ownership / land record",
    date: "n/a",
    kind: "demo",
    status: "not-connected",
    detail:
      "NOT CONNECTED — no land-record source is wired. Fixture values are labelled DEMO, 'unknown' suppresses the availability factor, and ownership is never inferred from appearance.",
  },
  {
    id: "land-cover-history",
    source: "Observed land condition per year",
    date: "2018–2024",
    kind: "demo",
    status: "demo",
    detail:
      "DEMO series. Years without a fixture value print 'Classification unavailable' rather than inventing a transition.",
  },
  {
    id: "land-potential-model",
    source: "Land Potential Screening Model v1",
    date: "1.0",
    kind: "modelled",
    status: "modelled",
    detail:
      "Deterministic weighted-factor screening score, prototype status, not validated. Not a probability and not a recommendation.",
  },
  {
    id: "surrounding-context",
    source: "Surrounding context counts",
    date: "generated in code",
    kind: "demo",
    status: "demo",
    detail: "DEMO band counts. The real roads, water and buildings are drawn from OpenStreetMap.",
  },
];

/** Status → badge class shared with the inspector's DATA STATUS block. */
export const STATUS_BADGE_CLASS: Record<FieldStatus, string> = {
  connected: "observed",
  public: "observed",
  modelled: "modelled",
  demo: "demo",
  simulated: "scenario",
  "not-connected": "unavailable",
};

export const STATUS_WORD: Record<FieldStatus, string> = {
  connected: "CONNECTED",
  public: "PUBLIC",
  modelled: "MODELLED",
  demo: "DEMO",
  simulated: "SIMULATED",
  "not-connected": "NOT CONNECTED",
};
