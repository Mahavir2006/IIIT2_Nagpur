import { GEOGRAPHIES } from "../geographies";

/** Every study unit in the prototype dataset, for statewide instruments. */
export const ALL_UNIT_IDS: string[] = GEOGRAPHIES.map((g) => g.id);

/** Units where built-up pressure is highest — used by planning instruments. */
export const URBANISED_UNIT_IDS = ["r-metro", "r-wdeccan", "r-nwcorridor", "r-swrange", "r-wsaha"];

/** Units where industrial demand is strongest. */
export const INDUSTRIAL_UNIT_IDS = ["r-metro", "r-nwcorridor", "r-wdeccan", "r-swrange", "r-wsaha"];
