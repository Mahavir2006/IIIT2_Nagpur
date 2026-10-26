import type { Dataset } from "./types";

/**
 * Dataset registry. Deliberately covers the full set of land-governance data
 * domains the product speaks to — but a policy only pulls in the datasets it
 * actually needs (see `policies.ts`).
 */
export const DATASETS: Dataset[] = [
  {
    id: "lulc",
    name: "Land Use / Land Cover (LULC)",
    source: "Bhuvan LULC — NRSA · also published on Government Open Data (data.gov.in)",
    publisher: "National Remote Sensing Agency",
    description:
      "Classified satellite land-use and land-cover rasters used to track agricultural, forest, built-up and water transitions between epochs.",
    coverage: "Study region — 12 administrative units",
    timePeriod: "2010 – 2024 (biennial epochs)",
    resolution: "23.5 m",
    format: "Raster / COG",
    updated: "2024",
    licence: "Government open data (mock metadata)",
  },
  {
    id: "ror",
    name: "Land Records / Record of Rights (RoR)",
    source: "State land-record portal — RoR / 7/12 extract (e.g. MahaBhumi / Bhu-Naksha)",
    publisher: "Revenue & Registration Department",
    description:
      "Digitised record-of-rights entries: recorded land class, holder, mutation history and survey number per parcel.",
    coverage: "Study region — sampled talukas",
    timePeriod: "2010 – 2024",
    resolution: "Parcel",
    format: "Tabular / JSON",
    updated: "2024",
    licence: "Government open data (mock metadata)",
  },
  {
    id: "cadastre",
    name: "Cadastral / Parcel Data",
    source: "Digital cadastral survey layers",
    publisher: "Survey & Land Records",
    description:
      "Parcel polygons with survey numbers used to measure parcel-level mismatch between recorded class and observed use.",
    coverage: "Study region — sampled villages",
    timePeriod: "2012 – 2024",
    resolution: "Parcel",
    format: "Vector (GeoJSON)",
    updated: "2024",
    licence: "Government open data (mock metadata)",
  },
  {
    id: "admin",
    name: "Administrative Boundaries",
    source: "Revenue department boundary atlas · Government Open Data (data.gov.in)",
    publisher: "Revenue & Registration Department",
    description:
      "District, tehsil and village boundaries plus notified planning and growth-corridor layers.",
    coverage: "Study region — national district set",
    timePeriod: "Static (2010 – 2024 revisions)",
    resolution: "Administrative unit",
    format: "Vector (GeoJSON)",
    updated: "2024",
    licence: "Government open data (mock metadata)",
  },
  {
    id: "registry",
    name: "Land Registration / Transactions",
    source: "Registration department transaction logs",
    publisher: "Department of Registration",
    description:
      "Registered sale deeds, stamps and mutation events with consideration value, used for land-market heat and litigation load.",
    coverage: "Study region — sampled sub-registrar offices",
    timePeriod: "2010 – 2024",
    resolution: "Transaction",
    format: "Tabular",
    updated: "2024",
    licence: "Government open data (mock metadata)",
  },
  {
    id: "acquisition",
    name: "Land Acquisition Register",
    source: "State acquisition register & award records",
    publisher: "Revenue & Special Land Acquisition Department",
    description:
      "Acquisition notifications, area acquired, award and rehabilitation timelines for public-purpose projects.",
    coverage: "Study region — project-wise",
    timePeriod: "2010 – 2024",
    resolution: "Project / notification",
    format: "Tabular",
    updated: "2024",
    licence: "Government open data (mock metadata)",
  },
  {
    id: "population",
    name: "Population / Demographic Data",
    source: "Census of India — village & town level",
    publisher: "Office of the Registrar General, India",
    description:
      "Rural and urban population by unit, used to normalise land indicators per capita and per density.",
    coverage: "Study region — village level",
    timePeriod: "2011 census, linearly projected to 2024 (mock)",
    resolution: "Village",
    format: "Tabular",
    updated: "2024",
    licence: "Government open data (mock metadata)",
  },
  {
    id: "govlulc",
    name: "Government Land-Use Statistics",
    source: "Directorate of Economics & Statistics land-use abstracts",
    publisher: "State statistics directorate (DES)",
    description:
      "Published district land-use statistics: net sown area, cultivable area, cropping pattern and land revenue classification.",
    coverage: "Study region — district level",
    timePeriod: "2010 – 2024 (annual)",
    resolution: "District",
    format: "Tabular",
    updated: "2024",
    licence: "Government open data (mock metadata)",
  },
  {
    id: "industry",
    name: "Industrial Area & Land Supply",
    source: "Industrial development corporation area statements · industrial policy notifications",
    publisher: "Industrial Development Corporation / Directorate of Industries",
    description:
      "Notified industrial-area land available for allocation by location, along with the zoning and permissible-use rules that attach to it.",
    coverage: "Study region — industrial area and special economic zone",
    timePeriod: "2010 – 2024",
    resolution: "Industrial area",
    format: "Tabular",
    updated: "2024",
    licence: "Government open data (mock metadata)",
  },
  {
    id: "investment",
    name: "Investment Clearances & Project Pipeline",
    source: "Industrial policy incentive records · single-window clearance approvals",
    publisher: "Directorate of Industries / Invest Maharashtra",
    description:
      "Projects granted clearance, investment approval or a stated capital subsidy, with the project scale that triggers each slab of incentive.",
    coverage: "Study region — project-wise",
    timePeriod: "2010 – 2024",
    resolution: "Project",
    format: "Tabular",
    updated: "2024",
    licence: "Government open data (mock metadata)",
  },
  {
    id: "courts",
    name: "Land Litigation Docket",
    source: "District judiciary cause lists — revenue and land suits",
    publisher: "High Court / District Judiciary",
    description:
      "Pending and disposed land suits used to read litigation load against a change in land-use or conversion policy.",
    coverage: "Study region — district judiciary",
    timePeriod: "2010 – 2024",
    resolution: "Case",
    format: "Tabular",
    updated: "2024",
    licence: "Government open data (mock metadata)",
  },
];

const DATASET_INDEX = new Map(DATASETS.map((d) => [d.id, d]));

export const datasetById = (id: string): Dataset | undefined => DATASET_INDEX.get(id);
export const datasetsByIds = (ids: string[]): Dataset[] =>
  ids.map((id) => DATASET_INDEX.get(id)).filter((d): d is Dataset => !!d);
