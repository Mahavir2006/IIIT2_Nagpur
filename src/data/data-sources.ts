/**
 * Central data-source registry — the single place every surface reads
 * provenance from. Nothing in the UI may present a number as fact without
 * pointing at one of these entries (or explicitly carrying an evidence class).
 *
 * Rules of the house:
 * - Reliability classes are PROVENANCE CATEGORIES, not quality scores.
 * - Nothing here is ever invented: url/license/limitations are null or
 *   explicitly stated when unknown, and `lastVerified` is null unless the
 *   source was actually fetched/checked on that date.
 * - Synthetic demonstration data is class F and must stay visibly labelled
 *   SIMULATED / DEMO wherever it renders.
 */

// ---------------------------------------------------------------------------
// Reliability classes (provenance categories)
// ---------------------------------------------------------------------------

export type ReliabilityClass = "A" | "B" | "C" | "D" | "E" | "F";

export interface ReliabilityInfo {
  label: string;
  short: string;
  description: string;
}

export const RELIABILITY: Record<ReliabilityClass, ReliabilityInfo> = {
  A: {
    label: "Official",
    short: "OFFICIAL",
    description:
      "Government land record, national mapping agency, or official statistical service.",
  },
  B: {
    label: "Institutional observation",
    short: "INSTITUTIONAL",
    description:
      "Official satellite / research-institution product (Copernicus, IMD, peer-reviewed datasets).",
  },
  C: {
    label: "Curated open aggregation",
    short: "CURATED",
    description: "Community-curated mirror of upstream official data with documented provenance.",
  },
  D: {
    label: "Community data",
    short: "COMMUNITY",
    description: "Open community-contributed data (OpenStreetMap and similar).",
  },
  E: {
    label: "Third-party hosted",
    short: "THIRD-PARTY",
    description: "Commercially or publicly hosted tiles whose upstream terms govern use.",
  },
  F: {
    label: "Synthetic / demonstration",
    short: "SYNTHETIC",
    description:
      "In-app demonstration, model output, or illustrative placeholder — never a statistic.",
  },
};

// ---------------------------------------------------------------------------
// Evidence classes (how a rendered VALUE was produced)
// ---------------------------------------------------------------------------

export type EvidenceClass = "observed" | "derived" | "modeled" | "synthetic";

export interface EvidenceInfo {
  label: string;
  description: string;
}

export const EVIDENCE: Record<EvidenceClass, EvidenceInfo> = {
  observed: {
    label: "OBSERVED",
    description:
      "Measured or recorded by the cited source (imagery pixel, station reading, record entry).",
  },
  derived: {
    label: "DERIVED",
    description: "Computed from observed inputs by a documented, reproducible calculation.",
  },
  modeled: {
    label: "MODELED",
    description: "Model or classification output — an estimate, not a measurement.",
  },
  synthetic: {
    label: "SYNTHETIC",
    description: "Demonstration data generated for the app — not a real-world measurement.",
  },
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type DataCategory =
  | "CADASTRAL"
  | "LAND_RECORD"
  | "PARCEL_BOUNDARY"
  | "LULC"
  | "SATELLITE"
  | "CLIMATE"
  | "WATER"
  | "FLOOD"
  | "DROUGHT"
  | "INFRASTRUCTURE"
  | "SOCIOECONOMIC"
  | "LEGAL"
  | "POLICY"
  | "MODEL";

export const CATEGORY_LABELS: Record<DataCategory, string> = {
  CADASTRAL: "Cadastral parcels",
  LAND_RECORD: "Land records",
  PARCEL_BOUNDARY: "Parcel-like boundaries (non-cadastral)",
  LULC: "Land use / land cover",
  SATELLITE: "Satellite imagery",
  CLIMATE: "Climate & weather",
  WATER: "Water & hydrology",
  FLOOD: "Flood",
  DROUGHT: "Drought",
  INFRASTRUCTURE: "Infrastructure",
  SOCIOECONOMIC: "Socio-economic",
  LEGAL: "Legal case law",
  POLICY: "Acts, rules & policy",
  MODEL: "Screening & statistical models",
};

export type SourceStatus = "connected" | "available-not-connected" | "external" | "unavailable";

export const STATUS_LABELS: Record<SourceStatus, string> = {
  connected: "Connected in this app",
  "available-not-connected": "Publicly available — not connected here",
  external: "External — opens the official site",
  unavailable: "Not publicly available / not connected",
};

// ---------------------------------------------------------------------------
// Registry record
// ---------------------------------------------------------------------------

export interface DataSourceRecord {
  id: string;
  name: string;
  category: DataCategory;
  /** Operating organisation that produces or serves the data. */
  provider: string;
  /** Original producer when different from the provider (e.g. Datameet mirror of MRSAC). */
  upstream: string | null;
  url: string | null;
  license: string | null;
  spatialResolution: string | null;
  temporalCoverage: string | null;
  geography: string;
  status: SourceStatus;
  reliabilityClass: ReliabilityClass;
  /** ISO date of the last actual fetch/verification, null when never re-checked here. */
  lastVerified: string | null;
  limitations: string;
}

const VERIFIED = "2026-09-27";

export const DATA_SOURCES: DataSourceRecord[] = [
  // --- Cadastral -----------------------------------------------------------
  {
    id: "cadastral-mrsac-maharashtra",
    name: "MRSAC Maharashtra cadastre (vector tiles)",
    category: "CADASTRAL",
    provider: "indianopenmaps.com (Datameet)",
    upstream: "MRSAC — Maharashtra State Remote Sensing Application Centre",
    url: "https://indianopenmaps.com/not-so-open/cadastrals/maharashtra/mrsac/tiles.json",
    license: "CC0 1.0 (Datameet aggregation; attribution requested to Datameet + MRSAC)",
    spatialResolution: "Individual survey-parcel polygons; tiles up to zoom 13",
    temporalCoverage: "Snapshot date not stated upstream",
    geography: "Maharashtra (statewide bounds; completeness unverified)",
    status: "connected",
    reliabilityClass: "C",
    lastVerified: VERIFIED,
    limitations:
      "Attributes carry village/taluka/district names and codes (CCODE, PIN) but no human-readable survey number; upstream import can drop interior rings; coverage completeness for Maharashtra is not stated by the publisher.",
  },
  {
    id: "cadastral-india-states",
    name: "indian_cadastrals — state cadastre releases",
    category: "CADASTRAL",
    provider: "ramSeraph/indian_cadastrals + indianopenmaps.com",
    upstream:
      "State land-record / remote-sensing portals (Bhuvan, NCOG, MRSAC, KGIS, TNGIS, Matribhoomi, MPBhulekh…)",
    url: "https://github.com/ramSeraph/indian_cadastrals",
    license: "CC0 1.0",
    spatialResolution: "Parcel polygons (vector tiles / GeoParquet / PMTiles per state)",
    temporalCoverage: "Per-release snapshots; publisher states updates are unlikely",
    geography:
      "27 states/UTs — completeness explicitly partial for several (UP, Assam, Chhattisgarh, Punjab, West Bengal, J&K…)",
    status: "available-not-connected",
    reliabilityClass: "C",
    lastVerified: VERIFIED,
    limitations:
      "Only the Maharashtra layer is wired into this app; other states have tile endpoints registered in src/services/cadastre.ts but are not yet rendered. Never treat as the legal register of rights.",
  },
  {
    id: "cadastral-vadnerbhairav",
    name: "Vadnerbhairav plot outlines (BhuNaksha)",
    category: "CADASTRAL",
    provider: "BhuMe assignment bundle (Jarpula-Nirjala/BhuMe)",
    upstream: "Maharashtra land records — BhuNaksha plot outlines",
    url: "https://github.com/Jarpula-Nirjala/BhuMe",
    license:
      "MIT (repository code); redistribution terms for the underlying land-record geometry are not stated",
    spatialResolution: "2,457 individual plots, one village",
    temporalCoverage: "Assignment-vintage snapshot",
    geography: "Vadnerbhairav village, Chandwad taluka, Nashik district, Maharashtra",
    status: "connected",
    reliabilityClass: "A",
    lastVerified: null,
    limitations:
      "One village only; served whole per query from the app's own API; official outlines can sit metres off ground truth. Owner/holder fields are stripped and never served.",
  },
  {
    id: "parcel-osm-overpass",
    name: "OpenStreetMap land-parcel-like polygons",
    category: "PARCEL_BOUNDARY",
    provider: "OpenStreetMap (Overpass API)",
    upstream: "OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    license: "ODbL 1.0 — © OpenStreetMap contributors",
    spatialResolution:
      "Community-mapped ways (landuse farmland/industrial/residential/commercial), variable",
    temporalCoverage: "Continuously updated",
    geography: "Worldwide",
    status: "connected",
    reliabilityClass: "D",
    lastVerified: null,
    limitations:
      "NOT cadastral and NOT legal survey records. Field/block outlines only; never label as cadastre, never use for ownership or dispute conclusions.",
  },
  {
    id: "parcel-demo-bundle",
    name: "Bundled OSM demo extract (Gujarat corridor)",
    category: "PARCEL_BOUNDARY",
    provider: "Bundled extract from OpenStreetMap",
    upstream: "OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    license: "ODbL 1.0",
    spatialResolution: "Community-mapped ways",
    temporalCoverage: "Extract vintage",
    geography: "Sanand GIDC / Dholera / Anand belt, Gujarat",
    status: "connected",
    reliabilityClass: "D",
    lastVerified: null,
    limitations: "Illustrative offline demo geometry. Not a legal survey record.",
  },

  // --- Satellite & land cover ---------------------------------------------
  {
    id: "sentinel2-eox-cloudless",
    name: "Sentinel-2 cloudless mosaics 2018–2024",
    category: "SATELLITE",
    provider: "EOX Maps",
    upstream: "Copernicus Sentinel-2 (ESA)",
    url: "https://tiles.maps.eox.at/wmts/1.0.0",
    license: "Copernicus data free & open; EOX tile service terms apply",
    spatialResolution: "10 m optical, annual low-cloud mosaic",
    temporalCoverage: "2018–2024 annual mosaics (2016/2017 excluded — no/placeholder imagery)",
    geography: "Global",
    status: "connected",
    reliabilityClass: "B",
    lastVerified: null,
    limitations:
      "Mosaic composite, not a single acquisition date; cloud/haze residuals possible. Imagery shows what was there, not who owns it.",
  },
  {
    id: "esri-io-lulc-10m",
    name: "10 m global land-cover classification (workflow)",
    category: "LULC",
    provider: "Impact Observatory / Esri",
    upstream: "IO 10m land-cover model (Sentinel-2 based)",
    url: "https://livingatlas.arcgis.com/arcgis/rest/services/Sentinel2_10m_LandCover/ImageServer",
    license: "Esri / Impact Observatory terms",
    spatialResolution: "10 m pixels, 10-class scheme",
    temporalCoverage: "Model output for the selected imagery year",
    geography: "Global",
    status: "connected",
    reliabilityClass: "B",
    lastVerified: null,
    limitations:
      "Machine-classified pixels — a MODEL, never ground truth. Per-class accuracy varies with season, cloud and terrain.",
  },

  // --- Climate -------------------------------------------------------------
  {
    id: "imd-weather",
    name: "IMD station weather (live proxy)",
    category: "CLIMATE",
    provider: "App backend proxy (GET /api/weather/*)",
    upstream: "India Meteorological Department",
    url: "https://mausam.imd.gov.in",
    license: "Government of India — used via the app's own read-only proxy",
    spatialResolution: "Automated/station observations, point readings",
    temporalCoverage: "Live — today's observation + forecast",
    geography: "India — IMD station network",
    status: "connected",
    reliabilityClass: "A",
    lastVerified: VERIFIED,
    limitations:
      "Point observations at station locations; stations with failed upstream fetches are reported as missing, never interpolated.",
  },

  // --- Water & hazards -----------------------------------------------------
  {
    id: "wris-water-features",
    name: "WRIS rivers, lakes, reservoirs & basins",
    category: "WATER",
    provider: "indianopenmaps.com (Datameet)",
    upstream: "Water Resources Information System of India (WRIS)",
    url: "https://indianopenmaps.com/rivers/wris/",
    license: "CC0 1.0 (aggregation); WRIS upstream terms govern original data",
    spatialResolution: "Vector lines/polygons from national hydro datasets",
    temporalCoverage: "Upstream WRIS snapshot (date not restated)",
    geography: "India",
    status: "connected",
    reliabilityClass: "C",
    lastVerified: VERIFIED,
    limitations:
      "Hydrography at national mapping scale — not canal-level or village-level detail; attribute dates vary by layer.",
  },
  {
    id: "ndem-flood-inundation",
    name: "NDEM flood inundation history",
    category: "FLOOD",
    provider: "indianopenmaps.com (Datameet)",
    upstream: "National Disaster Management Authority / NDEM flood-inundation mapping",
    url: "https://github.com/ramSeraph/india_natural_disasters",
    license: "CC0 1.0 (aggregation)",
    spatialResolution: "Raster-derived inundation polygons",
    temporalCoverage: "All-India 1998–2022 aggregate + per-state event/yearly layers",
    geography: "India (27 state layers + all-India aggregate)",
    status: "connected",
    reliabilityClass: "C",
    lastVerified: VERIFIED,
    limitations:
      "HISTORICAL observed inundation, not a forecast: an intersection means a place flooded in past events, never that it will flood. Resolution limits mean small parcels can fall inside/outside mapped extents.",
  },
  {
    id: "india-drought-atlas",
    name: "India Drought Atlas (SPEI 0.05°)",
    category: "DROUGHT",
    provider: "WCL-IIT Gandhinagar (wcl-iitgn/india-drought-atlas-data)",
    upstream: "SPEI drought index, 1901–2021",
    url: "https://github.com/wcl-iitgn/india-drought-atlas-data",
    license: "No explicit repository license — terms unclear",
    spatialResolution: "0.05° grid, monthly",
    temporalCoverage: "1901–2021",
    geography: "India",
    status: "available-not-connected",
    reliabilityClass: "B",
    lastVerified: VERIFIED,
    limitations:
      "Not connected in this app: drought context is currently stated qualitatively only. Coarse grid — never parcel-level.",
  },
  {
    id: "india-flood-atlas",
    name: "India Flood Atlas (1901–2020)",
    category: "FLOOD",
    provider: "WCL-IIT Gandhinagar (wcl-iitgn/india-flood-atlas-data)",
    upstream: "H08-CaMa-Flood simulation statistics",
    url: "https://github.com/wcl-iitgn/india-flood-atlas-data",
    license: "No explicit repository license — terms unclear",
    spatialResolution: "10 km sub-basin statistics",
    temporalCoverage: "1901–2020",
    geography: "India / sub-basins",
    status: "available-not-connected",
    reliabilityClass: "B",
    lastVerified: VERIFIED,
    limitations:
      "Not connected; modeled river-flood statistics, 10 km resolution — never parcel-level.",
  },

  // --- Admin, socio-economic, infrastructure -------------------------------
  {
    id: "india-admin-boundaries",
    name: "India state & district boundaries",
    category: "INFRASTRUCTURE",
    provider: "indianopenmaps.com (Datameet) / bundled india-states.json",
    upstream: "LGD / Survey of India / community compilations",
    url: "https://github.com/ramSeraph/indianopenmaps",
    license: "CC0 1.0 (aggregation)",
    spatialResolution: "State / district polygons",
    temporalCoverage: "Compilation snapshot",
    geography: "India",
    status: "connected",
    reliabilityClass: "C",
    lastVerified: null,
    limitations: "Generalised boundaries for reference — not survey-accurate, not for measurement.",
  },
  {
    id: "shrug-socioeconomic",
    name: "SHRUG socioeconomic panels",
    category: "SOCIOECONOMIC",
    provider: "DevDataLab (devdatalab/shrug-public)",
    upstream: "Census, survey & administrative compilations",
    url: "https://www.devdatalab.org/shrug_download/",
    license: "CC BY-NC-SA 4.0 — non-commercial terms",
    spatialResolution: "Village / district panels",
    temporalCoverage: "Multi-year panels",
    geography: "India — 500k+ villages (partial coverage)",
    status: "available-not-connected",
    reliabilityClass: "B",
    lastVerified: VERIFIED,
    limitations:
      "Not connected; non-commercial licence restricts production use without permission.",
  },
  {
    id: "geosadak-roads",
    name: "PMGSY / GeoSadak rural road network",
    category: "INFRASTRUCTURE",
    provider: "Datameet (datameet/pmgsy-geosadak)",
    upstream: "National Rural Infrastructure / GeoSadak",
    url: "https://github.com/datameet/pmgsy-geosadak",
    license: "India Open Government Licence (attribution)",
    spatialResolution: "Road centrelines, villages, POIs",
    temporalCoverage: "PMGSY network snapshot",
    geography: "India — rural road network",
    status: "available-not-connected",
    reliabilityClass: "C",
    lastVerified: VERIFIED,
    limitations: "Not connected; network completeness varies by state and scheme phase.",
  },

  // --- Legal & policy ------------------------------------------------------
  {
    id: "policy-library-documents",
    name: "Acts, rules & policy library (verbatim quotes)",
    category: "POLICY",
    provider: "App Policy Lab library",
    upstream: "Published Government Acts / policies (curated excerpts)",
    url: null,
    license: "Statutory texts are public; each entry records its own citation",
    spatialResolution: null,
    temporalCoverage: "Per-document publication date",
    geography: "India",
    status: "connected",
    reliabilityClass: "A",
    lastVerified: null,
    limitations:
      "Curated excerpts — not the complete code. The copilot may only quote these entries and must cite them as (Act, clause, p.); it may never invent a section number.",
  },
  {
    id: "indian-court-judgments",
    name: "Indian High Court & Supreme Court judgments",
    category: "LEGAL",
    provider: "vanga/indian-high-court-judgments, vanga/indian-supreme-court-judgments",
    upstream: "Court judgments published on AWS Open Data",
    url: "https://registry.opendata.aws/indian-high-court-judgments/",
    license: "CC BY 4.0",
    spatialResolution: null,
    temporalCoverage: "High Courts: 17.8M judgments, daily sync; Supreme Court: 1950–present",
    geography: "India — 25 High Courts + Supreme Court",
    status: "available-not-connected",
    reliabilityClass: "A",
    lastVerified: VERIFIED,
    limitations:
      "Not connected: no case-law search runs inside this app. Any dispute context shown is explicitly labelled as unavailable rather than inferred.",
  },

  // --- In-app synthetic datasets (class F, always labelled) -----------------
  {
    id: "state-intelligence-stats",
    name: "Dashboard state statistics (demo series)",
    category: "SOCIOECONOMIC",
    provider: "App demonstration data (src/data/state-intelligence.ts)",
    upstream: null,
    url: null,
    license: "Project-internal demo data",
    spatialResolution: "State-level values",
    temporalCoverage: "2018–2024 demo year series",
    geography: "India — states",
    status: "connected",
    reliabilityClass: "F",
    lastVerified: null,
    limitations:
      "SYNTHETIC demo values for development. Never present as official statistics; every rendered KPI must carry the SYNTHETIC evidence badge.",
  },
  {
    id: "land-use-scenario-model",
    name: "Land-use scenario model (demo)",
    category: "LULC",
    provider: "App demonstration model (src/data/land-scenario.ts)",
    upstream: null,
    url: null,
    license: "Project-internal demo data",
    spatialResolution: "State-level shares",
    temporalCoverage: "Scenario years in-app",
    geography: "India — states",
    status: "connected",
    reliabilityClass: "F",
    lastVerified: null,
    limitations:
      "Illustrative placeholders shaped on public patterns — not official land-use statistics.",
  },
  {
    id: "record-reality-demo",
    name: "Record vs Reality demonstration records",
    category: "LAND_RECORD",
    provider: "App demonstration data (src/data/record-reality.ts)",
    upstream: null,
    url: null,
    license: "Project-internal demo data",
    spatialResolution: "Synthetic survey records",
    temporalCoverage: "Demo vintage",
    geography: "India — demo districts",
    status: "connected",
    reliabilityClass: "F",
    lastVerified: null,
    limitations:
      "SYNTHETIC record/observation pairs. Mismatch language is 'observed discrepancy — requires field verification', never a legal finding.",
  },
  {
    id: "land-difference-demo",
    name: "Land Difference demo pairs",
    category: "LULC",
    provider: "App demonstration data (src/data/land-difference.ts)",
    upstream: null,
    url: null,
    license: "Project-internal demo data",
    spatialResolution: "Synthetic parcels",
    temporalCoverage: "Demo observation periods",
    geography: "India — demo districts",
    status: "connected",
    reliabilityClass: "F",
    lastVerified: null,
    limitations:
      "Illustrative before/after pairs; findings are labelled AI-generated preliminary observations, not determinations.",
  },
  {
    id: "policy-simulation",
    name: "Policy Lab simulation engine",
    category: "POLICY",
    provider: "App simulation (src/data/policySimulation/)",
    upstream: "Policy library documents for rule text",
    url: null,
    license: "Project-internal model",
    spatialResolution: "State / district aggregates",
    temporalCoverage: "Scenario years",
    geography: "India",
    status: "connected",
    reliabilityClass: "F",
    lastVerified: null,
    limitations:
      "MODELED scenario arithmetic on demo baselines — outputs are labeled Modeled, never forecasts or budgets.",
  },
  {
    id: "workflow-sih-pipeline",
    name: "Workflow SIH pipeline data",
    category: "CADASTRAL",
    provider: "App demonstration data (src/components/workflow/data.ts)",
    upstream: null,
    url: null,
    license: "Project-internal demo data",
    spatialResolution: "Demo village / bands / metrics",
    temporalCoverage: "Demo run timestamps",
    geography: "Adai Panvel (illustrative)",
    status: "connected",
    reliabilityClass: "F",
    lastVerified: null,
    limitations:
      "SIH hackathon dataset: observation bands, model metrics (XGBoost/SHAP), federation router and guardrail scores are SIMULATED and labelled as such in the UI.",
  },
  {
    id: "soil-maps",
    name: "Soil mapping",
    category: "INFRASTRUCTURE",
    provider: "—",
    upstream: "NBSS & LUP / soil atlases (no open endpoint verified)",
    url: null,
    license: null,
    spatialResolution: null,
    temporalCoverage: null,
    geography: "India",
    status: "unavailable",
    reliabilityClass: "F",
    lastVerified: null,
    limitations:
      "Not publicly available / not connected: no verified open soil endpoint is wired into this app, so no soil values are ever rendered.",
  },

  // --- Land Potential (3D GIS Explorer) ----------------------------------
  {
    id: "land-potential-candidate-fixtures",
    name: "Land Potential candidate parcels (DEMO fixtures)",
    category: "PARCEL_BOUNDARY",
    provider: "NIRVANA prototype — generated in code (src/services/gis3d/landPotentialData.ts)",
    upstream: null,
    url: null,
    license: "Synthetic; no licence to grant",
    spatialResolution: "Parcel-like polygons, roughly 0.4–6 ha",
    temporalCoverage: "Stable deterministic fixture",
    geography: "Pune district, Maharashtra (124 candidates)",
    status: "connected",
    reliabilityClass: "F",
    lastVerified: null,
    limitations:
      "DEMO ONLY. Geometry, ownership and land-condition labels are SYNTHETIC and generated in code — not cadastral parcels, not government land records, ids prefixed DEMO-. Real Sentinel-2 imagery, terrain and OpenStreetMap features are drawn underneath. Ownership is never inferred from appearance.",
  },
  {
    id: "land-potential-model-v1",
    name: "Land Potential Screening Model v1",
    category: "MODEL",
    provider: "NIRVANA prototype (src/services/gis3d/landPotentialScoring.ts)",
    upstream: null,
    url: null,
    license: "In-repo prototype",
    spatialResolution: "Per candidate parcel per potential use",
    temporalCoverage: "v1.0",
    geography: "Wherever candidate parcels are drawn",
    status: "connected",
    reliabilityClass: "F",
    lastVerified: null,
    limitations:
      "PROTOTYPE, UNVALIDATED. Six hand-weighted factors combined into a 0–100 screening score with a hard-constraint gate that suppresses scoring entirely where a restriction applies. Not a probability of success, not a recommendation, not legal authorisation or a land-use decision.",
  },
  {
    id: "land-record-ownership-india",
    name: "Ownership / land-record data (India)",
    category: "LAND_RECORD",
    provider: "State revenue departments / registration portals",
    upstream: "No single open national endpoint",
    url: null,
    license: null,
    spatialResolution: null,
    temporalCoverage: null,
    geography: "India",
    status: "available-not-connected",
    reliabilityClass: "C",
    lastVerified: null,
    limitations:
      "NOT CONNECTED in this app: no licensed land-record source is wired into the 3D explorer, so the Land Potential feature reports ownership as DEMO fixture values or 'Not verified' and NEVER infers ownership from satellite imagery or from land appearing barren.",
  },
];

const INDEX = new Map(DATA_SOURCES.map((s) => [s.id, s]));

export function getDataSource(id: string): DataSourceRecord | undefined {
  return INDEX.get(id);
}

export function sourcesByCategory(category: DataCategory): DataSourceRecord[] {
  return DATA_SOURCES.filter((s) => s.category === category);
}
