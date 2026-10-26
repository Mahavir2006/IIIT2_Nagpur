/**
 * Single source of truth for "how many floors does this building have".
 *
 * The OSM Buildings tileset ships almost no per-feature properties, so the
 * common case is no `building:levels` tag. Rather than leave every building
 * without a storey count, we derive one from the measured mesh height using a
 * typical Indian storey (3.2 m) and always label the basis so nothing derived
 * is ever presented as surveyed.
 *
 * This is a DERIVED visual aid. It is not a registry record, not a survey, and
 * must not be written anywhere as an authoritative floor count.
 */

/** Typical floor-to-floor height used when a storey count must be inferred. */
export const TYPICAL_FLOOR_M = 3.2;

/** Beyond this a "floor" is really a structural bay; clamp so the UI stays sane. */
const MAX_REASONABLE_FLOORS = 120;

export type FloorBasis = "tagged" | "derived" | "modelled";

export interface FloorReading {
  /** Always >= 1. */
  floors: number;
  basis: FloorBasis;
  /** Short human string for the evidence card, e.g. "derived from 38.5 m". */
  note: string;
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.round(n));
}

/**
 * @param levels  a real `building:levels` value when the feature has one
 * @param heightM measured mesh height in metres, when known
 * @param seed    a stable per-feature number (e.g. the tileset featureId). When
 *                neither a tag nor a measurement exists we still owe the user a
 *                storey count, so one is derived deterministically from the seed
 *                and labelled MODELLED. It is cosmetic - never a record.
 */
export function resolveFloors(
  levels: unknown,
  heightM: number | null,
  seed?: number | null,
): FloorReading {
  const tagged = toPositiveInt(levels);
  if (tagged !== null) {
    return {
      floors: Math.min(tagged, MAX_REASONABLE_FLOORS),
      basis: "tagged",
      note: "from building:levels tag",
    };
  }
  if (heightM !== null && Number.isFinite(heightM) && heightM > 1) {
    const derived = Math.max(1, Math.round(heightM / TYPICAL_FLOOR_M));
    return {
      floors: Math.min(derived, MAX_REASONABLE_FLOORS),
      basis: "derived",
      note: `derived from ${heightM.toFixed(1)} m`,
    };
  }
  // No data at all: a stable, clearly-labelled modelled value so every building
  // still has floors. Same seed always yields the same count.
  const modelled = 1 + (Math.abs(Math.round(seed ?? 0)) % 12);
  return { floors: modelled, basis: "modelled", note: "modelled — no OSM height or levels" };
}

/** One-line label used in tooltips and cards. */
export function floorLabel(r: FloorReading): string {
  const word = r.floors === 1 ? "floor" : "floors";
  return `${r.floors} ${word} · ${r.note}`;
}
