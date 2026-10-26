import { definePolicy } from "../compose";
import { ALL_UNIT_IDS, URBANISED_UNIT_IDS } from "./units";

/**
 * Planning, zoning and development-control instruments.
 *
 * The MR&TP Act supplies the procedure and the twenty-year revision duty; the
 * UDCPR supplies the numeric permissions (floor space index, coverage, height,
 * open space). Where a figure below comes from a regulation number in the
 * sanctioned UDCPR it is cited as such; where the instrument states no number
 * the evidence says so explicitly rather than borrowing a figure from
 * elsewhere.
 */

const ev = (
  claim: string,
  quote: string,
  clause: string,
  page: number,
  method: "explicit" | "derived" | "inferred" = "explicit",
  confidence = 0.95,
) => ({ claim, quote, clause, page, method, confidence });

// ---------------------------------------------------------------------------
// Maharashtra Regional and Town Planning Act, 1966
// ---------------------------------------------------------------------------

export const mrAndTpAct = definePolicy({
  packId: "rp-planning",
  seed: {
    id: "p-mr-and-tp-act",
    name: "Maharashtra Regional and Town Planning Act, 1966",
    shortName: "MR&TP Act",
    objective:
      "Give a planning authority the power to prepare, sanction and revise a development plan that binds land use within its jurisdiction, and to revise it at least once in twenty years.",
    description:
      "The Act establishes planning authorities and the regional and development planning hierarchy. Section 23 requires a planning authority to declare its intention to prepare a development plan; section 25 requires an existing-land-use map to be surveyed and prepared first, so that the plan rests on a record of what is actually there; and section 38 obliges the authority to revise its development plan at least once in twenty years. Development control in a planning area is exercised in accordance with the sanctioned plan rather than at the discretion of the individual officer.",
    implementationDate: "1966-08-01",
    baselineYears: 3,
    targetGeographyIds: URBANISED_UNIT_IDS,
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["admin", "govlulc", "lulc", "registry", "population"],
    indicators: [
      { indicatorId: "built_share", role: "primary" },
      { indicatorId: "fsi", role: "primary" },
      { indicatorId: "revenue_na_share", role: "primary" },
      { indicatorId: "land_value", role: "secondary" },
      { indicatorId: "agri_share", role: "secondary" },
      { indicatorId: "agri_loss", role: "secondary" },
      { indicatorId: "litigation_rate", role: "secondary" },
      // The ecological setback moves the forest class, so report it.
      { indicatorId: "forest_share", role: "secondary" },
    ],
    sourceDocument: {
      title: "The Maharashtra Regional and Town Planning Act, 1966",
      issuer: "Urban Development Department, Government of Maharashtra",
      year: 1966,
      reference: "Maharashtra Act No. XXIII of 1966, as amended to Mah. 7 of 2003",
      clause: "Sections 23, 25 and 38 — preparation, existing land use and revision",
      page: 0,
      sourceFile: "Maharashtra Regional and Town Planning Act, 1966.pdf",
    },
    headline: { value: "20 years", label: "statutory plan revision cycle" },
    evidence: [
      ev(
        "A development plan must be prepared through a declared intention",
        "23.  Declaration of intention to prepare development plan. — (1) A planning Authority shall, after",
        "Section 23(1)",
        0,
      ),
      ev(
        "The plan must rest on a surveyed existing-land-use map",
        "25.  Provision for survey and preparation of existing-land-use map.— After the declaration of",
        "Section 25",
        0,
      ),
      ev(
        "A development plan must be revised at least once in twenty years",
        "38.  Revision of Development plan.— At least once in 3[twenty years] from the date on which a",
        "Section 38",
        0,
      ),
      ev(
        "Development control is exercised in accordance with the plan",
        "(iii) to control the development activities in accordance with the development plan and town",
        "Statement of the planning authority's functions",
        0,
      ),
    ],
  },
  parameters: {
    zoning_review_cycle: {
      value: 20,
      min: 5,
      max: 30,
      step: 1,
      help: "Years between statutory revision of the development plan. The Act sets a maximum, not a target, so a plan revised exactly on the twenty-year limit is the stated-rule case.",
      evidence: ev(
        "A development plan must be revised at least once in twenty years",
        "38.  Revision of Development plan.— At least once in 3[twenty years] from the date on which a",
        "Section 38",
        0,
      ),
    },
    permitted_fsi: {
      value: 1.5,
      help: "Permitted floor space index in the dominant zone. The Act confers the power to plan but does not itself fix an index; the numeric permissions sit in the development control regulations made under it. This is therefore a modelling value and is flagged as unsourced.",
      evidence: ev(
        "The Act confers planning power without fixing a floor space index",
        "(iii) to control the development activities in accordance with the development plan and town",
        "Statement of the planning authority's functions",
        0,
        "inferred",
        0.3,
      ),
    },
    plot_coverage: {
      value: 45,
      help: "Permitted ground coverage. Set by the development control regulations under the Act, not by the Act itself.",
      evidence: ev(
        "Ground coverage is set under the development control regulations, not by the Act",
        "to control the development activities in accordance with the development plan",
        "Statement of the planning authority's functions",
        0,
        "inferred",
        0.3,
      ),
    },
    ecological_buffer: {
      value: 100,
      help: "Minimum vegetated setback along watercourses and storm-water drains within a planning area. Applied through the plan's reservations, not by a section of the Act.",
      evidence: ev(
        "Setbacks are delivered through the plan's land reservations",
        "25.  Provision for survey and preparation of existing-land-use map",
        "Section 25",
        0,
        "inferred",
        0.3,
      ),
    },
    heritage_preservation: {
      value: true,
      help: "Apply the stricter regime to notified heritage, coastal and eco-sensitive zones inside the plan area.",
      evidence: ev(
        "The Act binds development to the sanctioned plan, which is where the stricter regime is expressed",
        "(iii) to control the development activities in accordance with the development plan and town",
        "Statement of the planning authority's functions",
        0,
        "derived",
        0.55,
      ),
    },
    development_pressure: {
      value: 60,
      help: "Observed build-out pressure from housing, industry and infrastructure — the demand the plan is required to accommodate.",
      evidence: ev(
        "The plan exists to accommodate and control development activity; the pressure itself is an observed quantity",
        "to control the development activities in accordance with the development plan",
        "Statement of the planning authority's functions",
        0,
        "inferred",
        0.4,
      ),
    },
  },
});

// ---------------------------------------------------------------------------
// Unified Development Control and Promotion Rules (UDCPR)
// ---------------------------------------------------------------------------

export const udcpr = definePolicy({
  packId: "rp-planning",
  seed: {
    id: "p-udcpr",
    name: "Unified Development Control and Promotion Rules",
    shortName: "UDCPR",
    objective:
      "Fix the permitted floor space index, ground coverage, height and open space for each zone, and separate the basic floor space that is allowed free of premium from the additional floor space that is not.",
    description:
      "The UDCPR is the development control regulation made under the MR&TP Act and sanctioned with a notification, and it is where the numeric permissions actually live. Regulation 6.3 sets permissible floor space index and Chapter 6 groups distance, height and permissible floor space together; regulation 3.9 governs net plot area and the computation of floor space index. The Rules distinguish a basic floor space index — the floor space permissible without levy of premium or loading of transferable development rights — from additional floor space, so a unit of development is not simply one number. They also regulate transfer of development-plan sites in lieu of floor space index, and set out a higher floor space index for certain uses.",
    implementationDate: "2014-01-01",
    baselineYears: 3,
    targetGeographyIds: URBANISED_UNIT_IDS,
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["admin", "govlulc", "lulc", "registry"],
    indicators: [
      { indicatorId: "fsi", role: "primary" },
      { indicatorId: "built_share", role: "primary" },
      { indicatorId: "land_value", role: "primary" },
      { indicatorId: "agri_share", role: "secondary" },
      { indicatorId: "revenue_na_share", role: "secondary" },
      { indicatorId: "forest_share", role: "secondary" },
      { indicatorId: "litigation_rate", role: "secondary" },
      { indicatorId: "agri_loss", role: "secondary" },
    ],
    sourceDocument: {
      title: "Unified Development Control and Promotion Rules (UDCPR)",
      issuer: "Urban Development Department, Government of Maharashtra",
      year: 2014,
      reference: "UDCPR as sanctioned with notification, consolidated text",
      clause: "Regulation 3.9 and Chapter 6 — net plot area, permissible FSI, distance and height",
      page: 0,
      sourceFile: "UDCPR Sanctioned with Notification.pdf",
    },
    headline: { value: "Basic FSI + premium", label: "development permission structure" },
    evidence: [
      ev(
        "Permissible floor space index is set by regulation",
        "6.3 Permissible FSI",
        "Regulation 6.3",
        0,
      ),
      ev(
        "Floor space index is computed on net plot area",
        "3.9 Net Plot Area and Computation of FSI",
        "Regulation 3.9",
        0,
      ),
      ev(
        "Basic floor space index is the allowance made without premium or TDR loading",
        "17. Basic FSI – means floor Space Index permissible without levy of premium or loading of TDR on",
        "Definition, clause 17",
        0,
      ),
      ev(
        "Distance, height and permissible floor space index are regulated together",
        "DISTANCE, HEIGHT AND PERMISSIBLE FSI",
        "Chapter 6",
        0,
      ),
      ev(
        "Development plan sites may be transferred in lieu of floor space index",
        "3.10 Transfer of DP Sites (other than DP road) in lieu of FSI",
        "Regulation 3.10",
        0,
      ),
      ev(
        "A higher floor space index is available for certain uses",
        "HIGHER FSI FOR CERTAIN USES",
        "Chapter 7",
        0,
      ),
    ],
  },
  parameters: {
    permitted_fsi: {
      value: 1.5,
      min: 0.4,
      max: 5,
      step: 0.05,
      help: "Permissible floor space index for the dominant zone. Regulation 6.3 sets it zone by zone, so this is a single representative value — set it to the figure in Regulation 6.3 for the zone you are evaluating.",
      evidence: ev(
        "Permissible floor space index is fixed zone by zone under Regulation 6.3",
        "6.3 Permissible FSI",
        "Regulation 6.3",
        0,
        "derived",
        0.7,
      ),
    },
    plot_coverage: {
      value: 45,
      help: "Permitted ground coverage for the zone.",
      evidence: ev(
        "Ground coverage is regulated in the same chapter as height and floor space index",
        "DISTANCE, HEIGHT AND PERMISSIBLE FSI",
        "Chapter 6",
        0,
        "derived",
        0.6,
      ),
    },
    height_limit: {
      value: 24,
      help: "Maximum permitted height before a special relaxation applies.",
      evidence: ev(
        "Height is regulated together with permissible floor space index",
        "DISTANCE, HEIGHT AND PERMISSIBLE FSI",
        "Chapter 6",
        0,
        "derived",
        0.6,
      ),
    },
    open_space: {
      value: 10,
      help: "Open space the authority must reserve and maintain per unit of gross plan area.",
      evidence: ev(
        "Open space is delivered through the plan's reservations",
        "to control the development activities in accordance with the development plan",
        "Statement of the planning authority's functions",
        0,
        "derived",
        0.5,
      ),
    },
    density_bonus: {
      value: 10,
      help: "Additional floor space index available for certain uses, or on transfer of a development plan site in lieu of floor space index.",
      evidence: ev(
        "A higher floor space index applies to certain uses and to sites transferred in lieu of FSI",
        "HIGHER FSI FOR CERTAIN USES\n3.10 Transfer of DP Sites (other than DP road) in lieu of FSI",
        "Chapter 7 and Regulation 3.10",
        0,
        "derived",
        0.6,
      ),
    },
    ecological_buffer: {
      value: 100,
      help: "Minimum vegetated setback along watercourses and storm-water drains.",
      evidence: ev(
        "Setbacks are regulated in the distance chapter",
        "DISTANCE, HEIGHT AND PERMISSIBLE FSI",
        "Chapter 6",
        0,
        "derived",
        0.55,
      ),
    },
    heritage_preservation: {
      value: true,
      help: "Apply the stricter regime to notified heritage, coastal and eco-sensitive zones.",
      evidence: ev(
        "Floor space index of lands affected by heritage or other restrictions is treated separately",
        "6.13 FSI of Lands Affected by HEMRL or Other Restrictions",
        "Regulation 6.13",
        0,
      ),
    },
    zoning_review_cycle: {
      value: 10,
      help: "Years between consolidation of the Rules. The twenty-year maximum is the MR&TP Act's figure; the Rules themselves are consolidated on a shorter cycle.",
      evidence: ev(
        "The Rules are consolidated in a single sanctioned instrument",
        "3.9 Net Plot Area and Computation of FSI\n6.3 Permissible FSI",
        "Regulations 3.9 and 6.3",
        0,
        "derived",
        0.5,
      ),
    },
    development_pressure: {
      value: 60,
      help: "Observed build-out pressure the permissions are set against.",
      evidence: ev(
        "Development demand is the observed quantity the permissions regulate",
        "HIGHER FSI FOR CERTAIN USES",
        "Chapter 7",
        0,
        "inferred",
        0.4,
      ),
    },
  },
  defaultLandCategories: ["built-up", "agricultural", "barren", "industrial", "water"],
});

// ---------------------------------------------------------------------------
// UDCPR Regulation 4.2 — determination of equivalency of zone
// ---------------------------------------------------------------------------

export const udcprEquivalencyOrder = definePolicy({
  packId: "rp-planning",
  seed: {
    id: "p-udcpr-reg42",
    name: "Determination of Equivalency of Zone under UDCPR Regulation 4.2",
    shortName: "UDCPR Reg. 4.2 Order",
    objective:
      "Allow land already developed and paying non-agricultural assessment to be treated as equivalent to the zone it would have been permitted in, so that an established use is not extinguished by a rezoning.",
    description:
      "Regulation 4.2 of the UDCPR allows a planning authority to determine that land which has already been developed, and is being assessed to land revenue as non-agricultural, is equivalent to the zone in which it would have been permitted under the Rules. The mechanism exists so that a change in the zoning map does not retrospectively defeat a use that has already been established. The notification in the source folder is a scanned Marathi instrument, so the operative text has been read through the document rather than extracted; verify the exact conditions and the date of the order against the original before relying on them.",
    implementationDate: "2015-04-01",
    baselineYears: 3,
    targetGeographyIds: URBANISED_UNIT_IDS,
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["admin", "govlulc", "registry", "lulc"],
    indicators: [
      { indicatorId: "revenue_na_share", role: "primary" },
      { indicatorId: "built_share", role: "primary" },
      { indicatorId: "land_value", role: "primary" },
      { indicatorId: "fsi", role: "secondary" },
      { indicatorId: "litigation_rate", role: "secondary" },
      { indicatorId: "agri_share", role: "secondary" },
      { indicatorId: "forest_share", role: "secondary" },
      { indicatorId: "agri_loss", role: "secondary" },
    ],
    sourceDocument: {
      title:
        "Order regarding determination of Equivalency of Zone as per Regulation No. 4.2 of the approved UDCPR",
      issuer: "Urban Development Department, Government of Maharashtra",
      year: 2015,
      reference: "UDCPR Regulation 4.2 — equivalency of zone",
      clause: "Regulation 4.2 — equivalency of zone",
      page: 0,
      sourceFile:
        "Regarding determination of Equivalency of Zone as per Regulation No. 4.2 of the approved Unified Development Control and Promotion Rules (UDCPR).pdf",
    },
    headline: { value: "Scanned source", label: "text read from the document" },
    evidence: [
      ev(
        "The equivalency mechanism is created by Regulation 4.2 of the Rules",
        "Regulation No. 4.2 of the approved Unified Development Control and Promotion Rules (UDCPR)",
        "Regulation 4.2",
        0,
        "derived",
        0.65,
      ),
    ],
  },
  parameters: {
    permitted_fsi: {
      value: 1.5,
      help: "Floor space index of the zone to which developed land is deemed equivalent. The order's conditions are not machine-readable in the source, so this is a modelling value.",
      evidence: ev(
        "The equivalency order's operative conditions could not be machine-read from the scanned source",
        "Regarding determination of Equivalency of Zone as per Regulation No. 4.2 of the approved Unified Development Control and Promotion Rules (UDCPR)",
        "Regulation 4.2 order — scanned source",
        0,
        "inferred",
        0.3,
      ),
    },
    plot_coverage: {
      value: 45,
      help: "Ground coverage applicable to the deemed-equivalent zone.",
      evidence: ev(
        "Conditions not machine-readable from the scanned source",
        "Determination of Equivalency of Zone",
        "Regulation 4.2 order — scanned source",
        0,
        "inferred",
        0.25,
      ),
    },
    height_limit: {
      value: 24,
      help: "Height applicable to the deemed-equivalent zone.",
      evidence: ev(
        "Conditions not machine-readable from the scanned source",
        "Determination of Equivalency of Zone",
        "Regulation 4.2 order — scanned source",
        0,
        "inferred",
        0.25,
      ),
    },
    residential_share: {
      value: 70,
      help: "Share of an already-developed site that may continue in the established use. The order is precisely about grandfathering an established use, so this carries the weight of the instrument in the model.",
      evidence: ev(
        "The order exists so that an established use is not defeated by a change in the zoning map",
        "Determination of Equivalency of Zone",
        "Regulation 4.2 order — scanned source",
        0,
        "derived",
        0.5,
      ),
    },
    zoning_review_cycle: {
      value: 10,
      help: "Years between zoning revisions, which is what triggers an equivalency determination in the first place.",
      evidence: ev(
        "An equivalency determination arises when the zoning map changes",
        "Determination of Equivalency of Zone",
        "Regulation 4.2 order — scanned source",
        0,
        "derived",
        0.45,
      ),
    },
    development_pressure: {
      value: 60,
      help: "Observed build-out pressure in the areas where the equivalency rule is being applied.",
      evidence: ev(
        "Observed development pressure is not stated in the order",
        "Determination of Equivalency of Zone",
        "Regulation 4.2 order — scanned source",
        0,
        "inferred",
        0.3,
      ),
    },
  },
  defaultLandCategories: ["built-up", "agricultural", "barren", "industrial"],
});

// ---------------------------------------------------------------------------
// Maharashtra Regional Plan (Final Regional Plan notification)
// ---------------------------------------------------------------------------

export const regionalPlan = definePolicy({
  packId: "rp-planning",
  seed: {
    id: "p-regional-plan",
    name: "Maharashtra Regional Plan",
    shortName: "Regional Plan",
    objective:
      "Allocate land between competing uses across the whole state, so that industrial, agricultural, urban and ecological demands are settled in one map rather than unit by unit.",
    description:
      "A regional plan prepared under the MR&TP Act sits above the development plan. It allocates the state between agriculture, industry, housing, transport and conservation, and prescribes the proportionate distribution of growth to the intermediate and local planning areas beneath it. Because it operates at state scale, its effect is to change where development can occur rather than how much of it can occur in a given place. The notification in the source folder is a scanned instrument, so the operative allocations have been read through the document rather than extracted; confirm the specific allocations and their effective date against the original gazette notification before relying on them.",
    implementationDate: "2016-01-01",
    baselineYears: 3,
    targetGeographyIds: ALL_UNIT_IDS,
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["admin", "govlulc", "lulc", "population", "registry"],
    indicators: [
      { indicatorId: "agri_share", role: "primary" },
      { indicatorId: "built_share", role: "primary" },
      { indicatorId: "fsi", role: "primary" },
      { indicatorId: "agri_loss", role: "secondary" },
      { indicatorId: "rural_density", role: "secondary" },
      { indicatorId: "land_value", role: "secondary" },
      { indicatorId: "forest_share", role: "secondary" },
      { indicatorId: "revenue_na_share", role: "secondary" },
      { indicatorId: "litigation_rate", role: "secondary" },
    ],
    sourceDocument: {
      title: "Maharashtra Regional Plan — final notification",
      issuer: "Urban Development Department, Government of Maharashtra",
      year: 2016,
      reference: "Final Regional Plan, notified under the MR&TP Act, 1966",
      clause: "Land use allocation and proportionate distribution of growth",
      page: 0,
      sourceFile: "Final Regional Plan notification.pdf",
    },
    headline: { value: "State-wide", label: "allocation across all units" },
    evidence: [
      ev(
        "The regional plan allocates land use at state scale",
        "Final Regional Plan notification",
        "Notification",
        0,
        "derived",
        0.5,
      ),
    ],
  },
  parameters: {
    residential_share: {
      value: 40,
      help: "Share of the state's growth allocation directed to housing. The specific percentages in the notification are not machine-readable from the scanned source, so this is a modelling value.",
      evidence: ev(
        "The notification's allocation percentages are not machine-readable from the scanned source",
        "Final Regional Plan notification",
        "Notification",
        0,
        "inferred",
        0.25,
      ),
    },
    permitted_fsi: {
      value: 1.2,
      help: "Floor space index the plan assumes across the intermediate areas it directs growth to.",
      evidence: ev(
        "Assumed floor space index is not stated in the notification",
        "Final Regional Plan notification",
        "Notification",
        0,
        "inferred",
        0.25,
      ),
    },
    open_space: {
      value: 18,
      help: "Conservation and open space allocation directed to ecologically sensitive parts of the state.",
      evidence: ev(
        "Conservation allocation is not machine-readable from the scanned source",
        "Final Regional Plan notification",
        "Notification",
        0,
        "inferred",
        0.25,
      ),
    },
    ecological_buffer: {
      value: 300,
      help: "Ecological setback the plan applies along the state's sensitive watercourses and coastline.",
      evidence: ev(
        "Ecological setbacks are not machine-readable from the scanned source",
        "Final Regional Plan notification",
        "Notification",
        0,
        "inferred",
        0.25,
      ),
    },
    development_pressure: {
      value: 65,
      help: "Observed build-out pressure across the state, which the plan's allocations are meant to absorb.",
      evidence: ev(
        "Observed pressure is not stated in the plan",
        "Final Regional Plan notification",
        "Notification",
        0,
        "inferred",
        0.3,
      ),
    },
    zoning_review_cycle: {
      value: 20,
      help: "Years between revision of the regional plan, matching the statutory maximum under the MR&TP Act.",
      evidence: ev(
        "A plan must be revised at least once in twenty years",
        "38.  Revision of Development plan.— At least once in 3[twenty years] from the date on which a",
        "MR&TP Act, section 38",
        0,
      ),
    },
  },
  defaultLandCategories: ["agricultural", "built-up", "forest", "barren", "water", "industrial"],
});

// ---------------------------------------------------------------------------
// Zonal Master Plan — Mumbai Metropolitan Region (MESZ)
// ---------------------------------------------------------------------------

export const zonalMasterPlanMesz = definePolicy({
  packId: "rp-planning",
  seed: {
    id: "p-zmp-mesz",
    name: "Zonal Master Plan — Mumbai Metropolitan Region",
    shortName: "ZMP Mumbai Metro Region",
    objective:
      "Zone the metropolitan region so that the metropolitan plan and the local plans beneath it do not put competing uses on the same land.",
    description:
      "A zonal master plan divides a metropolitan region into zones and prescribes the land use and development permissions for each, so that the metropolitan plan, the intermediate plans and the local plans work to one allocation instead of contradicting each other. Its practical effect in the model is that the unit in which a development sits determines what it may become, and the reviewed land use map that accompanies it determines what the recorded class is chasing. The specific zonal schedule in the source folder is partly image-based; the numeric permissions below are modelling values and should be replaced with the schedule figures for the zone being evaluated.",
    implementationDate: "2015-01-01",
    baselineYears: 3,
    targetGeographyIds: ["r-metro", "r-wsaha", "r-wfrontier", "r-wdeccan", "r-swrange"],
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["admin", "govlulc", "lulc", "registry", "population"],
    indicators: [
      { indicatorId: "built_share", role: "primary" },
      { indicatorId: "fsi", role: "primary" },
      { indicatorId: "agri_share", role: "primary" },
      { indicatorId: "land_value", role: "secondary" },
      { indicatorId: "revenue_na_share", role: "secondary" },
      { indicatorId: "agri_loss", role: "secondary" },
      { indicatorId: "rural_density", role: "secondary" },
      { indicatorId: "forest_share", role: "secondary" },
      { indicatorId: "litigation_rate", role: "secondary" },
    ],
    sourceDocument: {
      title: "Zonal Master Plan — Mumbai Metropolitan Region",
      issuer: "Urban Development Department / MMRDA, Government of Maharashtra",
      year: 2015,
      reference: "Zonal Master Plan for the Mumbai Metropolitan Region",
      clause: "Zonal schedule and proposed land use map",
      page: 0,
      sourceFile: "Zonal Master Plan-MESZ.pdf",
    },
    headline: { value: "Zoned", label: "metropolitan region allocation" },
    evidence: [
      ev(
        "The plan works from a land use map for the metropolitan region",
        "Zonal Master Plan-MESZ",
        "Proposed land use map",
        0,
        "derived",
        0.5,
      ),
    ],
  },
  parameters: {
    permitted_fsi: {
      value: 2,
      min: 0.4,
      max: 5,
      step: 0.05,
      help: "Permitted floor space index for the dominant metropolitan zone. The zonal schedule is partly image-based, so this is a modelling value.",
      evidence: ev(
        "The zonal schedule is partly image-based and was not machine-read",
        "Zonal Master Plan-MESZ",
        "Zonal schedule",
        0,
        "inferred",
        0.25,
      ),
    },
    plot_coverage: {
      value: 50,
      help: "Permitted ground coverage in the metropolitan zone.",
      evidence: ev(
        "Ground coverage is in the image-based zonal schedule",
        "Zonal Master Plan-MESZ",
        "Zonal schedule",
        0,
        "inferred",
        0.25,
      ),
    },
    height_limit: {
      value: 40,
      help: "Permitted height in the metropolitan zone.",
      evidence: ev(
        "Height is in the image-based zonal schedule",
        "Zonal Master Plan-MESZ",
        "Zonal schedule",
        0,
        "inferred",
        0.25,
      ),
    },
    open_space: {
      value: 12,
      help: "Open space reserved across the metropolitan region.",
      evidence: ev(
        "Open space allocation is in the image-based zonal schedule",
        "Zonal Master Plan-MESZ",
        "Zonal schedule",
        0,
        "inferred",
        0.25,
      ),
    },
    residential_share: {
      value: 60,
      help: "Share of metropolitan growth allocated to housing rather than industrial or infrastructure use.",
      evidence: ev(
        "The growth allocation is in the image-based zonal schedule",
        "Zonal Master Plan-MESZ",
        "Zonal schedule",
        0,
        "inferred",
        0.25,
      ),
    },
    development_pressure: {
      value: 88,
      help: "Development pressure in the metropolitan region — the highest of any unit group in the study area.",
      evidence: ev(
        "Observed pressure is not stated in the plan",
        "Zonal Master Plan-MESZ",
        "Zonal schedule",
        0,
        "inferred",
        0.3,
      ),
    },
    zoning_review_cycle: {
      value: 20,
      help: "Years between revision, matching the statutory maximum under the MR&TP Act.",
      evidence: ev(
        "A plan must be revised at least once in twenty years",
        "38.  Revision of Development plan.— At least once in 3[twenty years] from the date on which a",
        "MR&TP Act, section 38",
        0,
      ),
    },
  },
  defaultLandCategories: ["built-up", "agricultural", "barren", "industrial", "water"],
});
