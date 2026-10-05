// Administrative districts (OSM admin_level 5) that intersect a scenario box, written by
// scripts/build-districts.ts to public/data/<scenario>/districts.json.

import type { BBox, LngLat } from './scenario';

export interface District {
  id: string;
  /** English name without the "District" suffix. */
  name: string;
  nameLocal: string | null;
  /** Local Government Directory district code, when OSM carries it. */
  lgd: string | null;
  /** Closed outer rings, lng/lat. */
  rings: LngLat[][];
  bbox: BBox;
}

export interface DistrictData {
  source: string;
  retrieved: string;
  districts: District[];
}
