/**
 * Research Hub — DEMO catalogue + evidence retrieval.
 *
 * Everything here is platform demonstration content: study titles, authors,
 * citation counts and metrics are illustrative and are NOT real publications or
 * official statistics. Institutions are named only to make the demo legible.
 *
 * The Copilot and Literature Review never generate free text: every claim they
 * show is a finding sentence from a catalogue item, returned with that item as
 * its source. Swap `PAPERS`/`DATASETS`/… for an API and the UI keeps working.
 */

export type Topic =
  | "Land Use"
  | "Climate"
  | "Land Disputes"
  | "Urbanization"
  | "Agriculture"
  | "Cadastral Mapping"
  | "Remote Sensing"
  | "Land Records"
  | "Digital Governance"
  | "Policy Reform"
  | "Forest Protection"
  | "Infrastructure";

export const FILTER_TOPICS: Topic[] = [
  "Land Use",
  "Climate",
  "Land Disputes",
  "Urbanization",
  "Agriculture",
  "Cadastral Mapping",
  "Remote Sensing",
  "Land Records",
  "Digital Governance",
  "Policy Reform",
];

export const FOCUS_STATES = [
  "Maharashtra",
  "Gujarat",
  "Karnataka",
  "Madhya Pradesh",
  "Uttar Pradesh",
  "Rajasthan",
] as const;

export interface Paper {
  id: string;
  title: string;
  type:
    | "Journal article"
    | "Working paper"
    | "Government report"
    | "Thesis"
    | "Policy brief"
    | "Case study";
  institution: string;
  authors: string[];
  year: number;
  states: string[];
  topics: Topic[];
  citations: number;
  datasetIds: string[];
  methods: string[];
  /** One-sentence key finding — the only text the Copilot quotes. */
  finding: string;
  abstract: string;
  /** Marks findings that cut against the dominant evidence (for "contradictory findings"). */
  contradicts?: boolean;
}

export interface Dataset {
  id: string;
  name: string;
  source: string;
  kind:
    | "Satellite"
    | "Land records"
    | "Census"
    | "Climate"
    | "Infrastructure"
    | "Open data"
    | "Land use";
  coverage: string;
  temporal: string;
  resolution: string;
  format: string;
  license: string;
  updated: string;
  topics: Topic[];
  description: string;
}

export interface PolicyDoc {
  id: string;
  title: string;
  issuer: string;
  year: number;
  jurisdiction: string;
  topics: Topic[];
  summary: string;
}

export interface GisLayer {
  id: string;
  name: string;
  source: string;
  topics: Topic[];
}

export const PAPERS: Paper[] = [
  {
    id: "p1",
    title: "Urban Expansion and Agricultural Land Conversion in Maharashtra",
    type: "Journal article",
    institution: "IIT Bombay",
    authors: ["A. Kulkarni", "R. Deshmukh", "S. Iyer"],
    year: 2024,
    states: ["Maharashtra"],
    topics: ["Urbanization", "Agriculture", "Remote Sensing", "Land Use"],
    citations: 42,
    datasetIds: ["d1", "d6"],
    methods: ["Remote sensing", "Change detection", "Land records"],
    finding:
      "Built-up area around the Mumbai–Pune corridor expanded by roughly 38% between 2015 and 2023, with about two-thirds of new built-up land previously under cultivation.",
    abstract:
      "Uses Sentinel-2 classification and village land records to trace agricultural-to-urban conversion across the Mumbai–Pune–Nashik triangle.",
  },
  {
    id: "p2",
    title: "Peri-urban Land Markets and Farmland Loss around Pune",
    type: "Working paper",
    institution: "Gokhale Institute of Politics and Economics",
    authors: ["M. Joshi", "P. Sathe"],
    year: 2023,
    states: ["Maharashtra"],
    topics: ["Urbanization", "Agriculture", "Policy Reform"],
    citations: 18,
    datasetIds: ["d2", "d6"],
    methods: ["Household survey", "Land records", "Econometrics"],
    finding:
      "Non-agricultural conversion permissions around Pune rose sharply after 2016, and converted parcels sold at 3–5× the agricultural guidance value.",
    abstract:
      "Combines conversion permissions (NA orders) with sale-deed data to study how land markets drive farmland loss on Pune's fringe.",
  },
  {
    id: "p3",
    title: "Dholera SIR: Planned Urbanisation on Saline Farmland",
    type: "Case study",
    institution: "CEPT University",
    authors: ["K. Patel", "N. Shah"],
    year: 2022,
    states: ["Gujarat"],
    topics: ["Urbanization", "Infrastructure", "Land Use", "Policy Reform"],
    citations: 27,
    datasetIds: ["d1", "d8"],
    methods: ["Case study", "Remote sensing", "Policy analysis"],
    finding:
      "In Dholera most land acquired for the special investment region was low-productivity saline farmland, so direct agricultural output losses were modest relative to Pune-type conversion.",
    abstract:
      "Examines town-planning-scheme land pooling in Dholera and its effects on agriculture, grazing commons and livelihoods.",
    contradicts: true,
  },
  {
    id: "p4",
    title: "Land Disputes and Record Discrepancies: Evidence from Maharashtra and Gujarat",
    type: "Journal article",
    institution: "NALSAR University of Law",
    authors: ["V. Rao", "T. Mehta"],
    year: 2023,
    states: ["Maharashtra", "Gujarat"],
    topics: ["Land Disputes", "Land Records", "Cadastral Mapping"],
    citations: 35,
    datasetIds: ["d2", "d5"],
    methods: ["Court records", "Land records", "Comparative analysis"],
    finding:
      "About 60% of sampled civil land disputes involved a mismatch between the record of rights and on-ground possession, with Gujarat's earlier record digitisation associated with faster resolution.",
    abstract:
      "Codes district-court land cases in two states and links them to the status of record-of-rights digitisation.",
  },
  {
    id: "p5",
    title: "Climate-Resilient Land Use Planning in Drought-Prone Marathwada",
    type: "Government report",
    institution: "NIRDPR",
    authors: ["S. Reddy", "A. Pawar"],
    year: 2022,
    states: ["Maharashtra"],
    topics: ["Climate", "Land Use", "Agriculture"],
    citations: 21,
    datasetIds: ["d4", "d1"],
    methods: ["Climate data", "GIS", "Stakeholder consultation"],
    finding:
      "Blocks where cropland expanded onto marginal and fallow land showed higher groundwater stress and more frequent crop failure in deficit-rainfall years.",
    abstract:
      "District-level assessment linking land-use change, rainfall variability and groundwater draft across eight Marathwada districts.",
  },
  {
    id: "p6",
    title: "Tribal Land Alienation and Forest Rights in Madhya Pradesh",
    type: "Thesis",
    institution: "Tata Institute of Social Sciences",
    authors: ["D. Bhil", "R. Soren"],
    year: 2021,
    states: ["Madhya Pradesh"],
    topics: ["Forest Protection", "Land Disputes", "Policy Reform"],
    citations: 12,
    datasetIds: ["d5"],
    methods: ["Ethnography", "Land records", "Policy analysis"],
    finding:
      "Individual forest-rights titles were more often recognised than community rights, and unresolved claims clustered in districts with incomplete cadastral surveys.",
    abstract:
      "Mixed-methods study of Forest Rights Act implementation and land alienation in four Scheduled Areas districts.",
  },
  {
    id: "p7",
    title: "Digitising Land Records under DILRMP: A Six-State Review",
    type: "Policy brief",
    institution: "IIT Delhi",
    authors: ["H. Singh", "L. Menon"],
    year: 2024,
    states: ["Maharashtra", "Gujarat", "Karnataka", "Madhya Pradesh", "Uttar Pradesh", "Rajasthan"],
    topics: ["Land Records", "Digital Governance", "Cadastral Mapping", "Policy Reform"],
    citations: 31,
    datasetIds: ["d2", "d9"],
    methods: ["Programme evaluation", "Land records", "Interviews"],
    finding:
      "Record-of-rights computerisation is near complete in most reviewed states, but cadastral map digitisation and integration with registration lag behind.",
    abstract:
      "Reviews DILRMP component progress and the practical usability of digitised records for citizens and courts.",
  },
  {
    id: "p8",
    title: "Bhoomi to Dharani: Lessons from Land Record Platforms in South India",
    type: "Journal article",
    institution: "IISc Bengaluru",
    authors: ["P. Nair", "K. Gowda"],
    year: 2023,
    states: ["Karnataka"],
    topics: ["Digital Governance", "Land Records"],
    citations: 24,
    datasetIds: ["d2"],
    methods: ["Programme evaluation", "Process tracing"],
    finding:
      "Karnataka's Bhoomi platform reduced time to obtain a record-of-rights extract, but mutation delays persisted where survey maps were outdated.",
    abstract:
      "Traces two decades of platform evolution and user outcomes in Karnataka's land records system.",
  },
  {
    id: "p9",
    title: "Sentinel-2 Land Cover Mapping for Indian Smallholder Landscapes",
    type: "Journal article",
    institution: "IIT Madras",
    authors: ["S. Krishnan", "V. Balaji"],
    year: 2024,
    states: ["Karnataka", "Maharashtra", "Uttar Pradesh"],
    topics: ["Remote Sensing", "Land Use", "Agriculture"],
    citations: 56,
    datasetIds: ["d1", "d3"],
    methods: ["Remote sensing", "Machine learning", "Field validation"],
    finding:
      "A 10 m Sentinel-2 classifier reached about 87% overall accuracy on smallholder plots, with most errors between fallow land and sparse cropland.",
    abstract:
      "Benchmarks classification approaches for fragmented Indian farm landscapes against field-collected labels.",
  },
  {
    id: "p10",
    title: "Groundwater Stress and Irrigated Cropland Expansion in Rajasthan",
    type: "Journal article",
    institution: "IIT Delhi",
    authors: ["R. Meena", "A. Choudhary"],
    year: 2022,
    states: ["Rajasthan"],
    topics: ["Climate", "Agriculture", "Land Use"],
    citations: 29,
    datasetIds: ["d4", "d3"],
    methods: ["Climate data", "Remote sensing", "Panel regression"],
    finding:
      "Irrigated cropland expansion on former rangeland was associated with falling water tables in over two-thirds of the studied blocks.",
    abstract: "Links cropland change to groundwater observation wells across western Rajasthan.",
  },
  {
    id: "p11",
    title: "Urban Growth Boundaries and Land Use Regulation in Uttar Pradesh",
    type: "Working paper",
    institution: "IIM Lucknow",
    authors: ["N. Verma", "S. Tripathi"],
    year: 2023,
    states: ["Uttar Pradesh"],
    topics: ["Urbanization", "Policy Reform", "Land Use"],
    citations: 14,
    datasetIds: ["d6", "d7"],
    methods: ["Policy analysis", "Remote sensing"],
    finding:
      "Master-plan land-use zoning in Lucknow and Kanpur was frequently revised to regularise existing peri-urban construction rather than to steer it.",
    abstract:
      "Compares successive master plans with observed growth to test whether zoning shapes urban expansion.",
    contradicts: true,
  },
  {
    id: "p12",
    title: "Infrastructure Corridors and Land Value Capture in Western India",
    type: "Journal article",
    institution: "IIT Bombay",
    authors: ["G. Shetty", "F. Qureshi"],
    year: 2024,
    states: ["Gujarat", "Maharashtra"],
    topics: ["Infrastructure", "Urbanization", "Policy Reform"],
    citations: 19,
    datasetIds: ["d8", "d6"],
    methods: ["Spatial econometrics", "Land records"],
    finding:
      "Land within 5 km of new expressway interchanges saw the fastest farmland-to-non-farm conversion, especially along the Samruddhi and DMIC alignments.",
    abstract:
      "Estimates how highway and freight-corridor investments reshape land use and land prices.",
  },
  {
    id: "p13",
    title: "Forest Cover Change and Mining Leases in Central India",
    type: "Journal article",
    institution: "Wildlife Institute of India",
    authors: ["J. Kujur", "M. Das"],
    year: 2021,
    states: ["Madhya Pradesh"],
    topics: ["Forest Protection", "Remote Sensing", "Land Use"],
    citations: 33,
    datasetIds: ["d1", "d10"],
    methods: ["Remote sensing", "Change detection"],
    finding:
      "Forest loss inside mining lease boundaries was several times higher than in adjacent unleased forest over the study period.",
    abstract:
      "Maps forest cover change around mining leases using multi-year satellite composites.",
  },
  {
    id: "p14",
    title: "Cadastral Resurvey with Drones: The SVAMITVA Experience",
    type: "Government report",
    institution: "Survey of India",
    authors: ["B. Rathore", "C. Iqbal"],
    year: 2024,
    states: ["Madhya Pradesh", "Uttar Pradesh", "Karnataka", "Maharashtra"],
    topics: ["Cadastral Mapping", "Digital Governance", "Land Records"],
    citations: 22,
    datasetIds: ["d9", "d2"],
    methods: ["Drone survey", "GIS", "Programme evaluation"],
    finding:
      "Drone-based village abadi surveys produced property cards far faster than conventional survey, but linking them to agricultural records remains incomplete.",
    abstract:
      "Reviews the drone-survey workflow, accuracy checks and property-card issuance under SVAMITVA.",
  },
  {
    id: "p15",
    title: "Climate Vulnerability of Coastal Land Use in Gujarat",
    type: "Journal article",
    institution: "IIT Gandhinagar",
    authors: ["H. Desai", "Y. Thakkar"],
    year: 2023,
    states: ["Gujarat"],
    topics: ["Climate", "Land Use", "Infrastructure"],
    citations: 16,
    datasetIds: ["d4", "d1"],
    methods: ["Climate data", "Remote sensing", "Vulnerability index"],
    finding:
      "Salt pans, mangroves and port-led industrial land along the Gulf of Kutch face the highest combined exposure to sea-level rise and cyclone surge.",
    abstract:
      "Builds a coastal land-use vulnerability index for Gujarat combining exposure, sensitivity and adaptive capacity.",
  },
  {
    id: "p16",
    title: "Does Land Pooling Reduce Disputes? Evidence from Amaravati and Dholera",
    type: "Working paper",
    institution: "Centre for Policy Research",
    authors: ["A. Sen", "R. Pillai"],
    year: 2022,
    states: ["Gujarat"],
    topics: ["Land Disputes", "Policy Reform", "Urbanization"],
    citations: 11,
    datasetIds: ["d2"],
    methods: ["Case study", "Court records"],
    finding:
      "Land pooling reduced litigation compared with compulsory acquisition, but disputes over reconstituted plot allotment emerged later in the process.",
    abstract: "Compares litigation outcomes under land pooling and acquisition regimes.",
  },
];

export const DATASETS: Dataset[] = [
  {
    id: "d1",
    name: "Sentinel-2 Land Use Dataset",
    source: "Copernicus / ESA",
    kind: "Satellite",
    coverage: "India",
    temporal: "2017–2025",
    resolution: "10 m",
    format: "GeoTIFF / Cloud Optimized GeoTIFF",
    license: "Copernicus open licence",
    updated: "Mar 2025",
    topics: ["Remote Sensing", "Land Use", "Agriculture"],
    description: "Annual cloud-free composites and land-cover classes for change detection.",
  },
  {
    id: "d2",
    name: "DILRMP Record-of-Rights Extracts",
    source: "Department of Land Resources",
    kind: "Land records",
    coverage: "Participating states",
    temporal: "2008–2024",
    resolution: "Parcel",
    format: "CSV / API",
    license: "Restricted — data-sharing agreement",
    updated: "Jan 2025",
    topics: ["Land Records", "Cadastral Mapping", "Digital Governance"],
    description:
      "Computerised record-of-rights attributes: ownership, area, land class, mutation history.",
  },
  {
    id: "d3",
    name: "ISRO Bhuvan Land Use Land Cover (1:50k)",
    source: "NRSC / ISRO",
    kind: "Land use",
    coverage: "India",
    temporal: "2005–2016, 2019",
    resolution: "1:50,000",
    format: "WMS / Shapefile",
    license: "Government open data",
    updated: "Aug 2023",
    topics: ["Land Use", "Remote Sensing"],
    description: "National LULC maps at three time points for decadal comparison.",
  },
  {
    id: "d4",
    name: "IMD Gridded Rainfall & Temperature",
    source: "India Meteorological Department",
    kind: "Climate",
    coverage: "India",
    temporal: "1901–2024",
    resolution: "0.25° / 1°",
    format: "NetCDF",
    license: "IMD data policy",
    updated: "Feb 2025",
    topics: ["Climate", "Agriculture"],
    description: "Daily gridded rainfall and temperature for drought and heat indicators.",
  },
  {
    id: "d5",
    name: "Census of India 2011 — Village Amenities",
    source: "Office of the Registrar General",
    kind: "Census",
    coverage: "India",
    temporal: "2011",
    resolution: "Village",
    format: "CSV",
    license: "Government open data",
    updated: "2011 (static)",
    topics: ["Land Use", "Policy Reform"],
    description: "Village land-use classes, irrigation and amenities for socio-economic baselines.",
  },
  {
    id: "d6",
    name: "Urban Built-up Extent (Global Human Settlement Layer)",
    source: "European Commission JRC",
    kind: "Land use",
    coverage: "Global",
    temporal: "1975–2030 (epochs)",
    resolution: "10–100 m",
    format: "GeoTIFF",
    license: "CC BY 4.0",
    updated: "2023",
    topics: ["Urbanization", "Remote Sensing"],
    description: "Multi-epoch built-up surface and settlement typology.",
  },
  {
    id: "d7",
    name: "Master Plan Land-Use Zoning (select cities)",
    source: "State town planning departments via data.gov.in",
    kind: "Open data",
    coverage: "Select cities",
    temporal: "2001–2031 plans",
    resolution: "Zone",
    format: "Shapefile / PDF",
    license: "Open Government Data Licence",
    updated: "2022",
    topics: ["Urbanization", "Policy Reform", "Land Use"],
    description: "Digitised zoning maps from statutory master plans.",
  },
  {
    id: "d8",
    name: "Road & Freight Corridor Network",
    source: "MoRTH / PM Gati Shakti (public layers)",
    kind: "Infrastructure",
    coverage: "India",
    temporal: "2024",
    resolution: "Vector",
    format: "GeoJSON",
    license: "Government open data",
    updated: "Dec 2024",
    topics: ["Infrastructure", "Urbanization"],
    description: "National highways, expressways and dedicated freight corridors.",
  },
  {
    id: "d9",
    name: "SVAMITVA Drone Survey Outputs",
    source: "Survey of India",
    kind: "Land records",
    coverage: "Participating villages",
    temporal: "2020–2025",
    resolution: "5 cm orthophoto",
    format: "GeoTIFF / Shapefile",
    license: "Restricted",
    updated: "Apr 2025",
    topics: ["Cadastral Mapping", "Digital Governance"],
    description: "Drone orthophotos and abadi property boundaries.",
  },
  {
    id: "d10",
    name: "Forest Cover Assessment (ISFR)",
    source: "Forest Survey of India",
    kind: "Land use",
    coverage: "India",
    temporal: "Biennial 2001–2023",
    resolution: "23.5 m",
    format: "Shapefile / tables",
    license: "Government data",
    updated: "2023",
    topics: ["Forest Protection", "Remote Sensing"],
    description: "Forest canopy density classes and change statistics by district.",
  },
];

export const POLICIES: PolicyDoc[] = [
  {
    id: "g1",
    title: "Maharashtra Land Revenue Code, 1966 — Conversion of Land Use (Sec. 42)",
    issuer: "Government of Maharashtra",
    year: 1966,
    jurisdiction: "Maharashtra",
    topics: ["Policy Reform", "Agriculture", "Urbanization"],
    summary:
      "Rules for converting agricultural land to non-agricultural use, including deemed conversion amendments.",
  },
  {
    id: "g2",
    title: "Gujarat Town Planning and Urban Development Act, 1976",
    issuer: "Government of Gujarat",
    year: 1976,
    jurisdiction: "Gujarat",
    topics: ["Urbanization", "Policy Reform", "Land Use"],
    summary: "Statutory basis for town planning schemes and land pooling / reconstitution.",
  },
  {
    id: "g3",
    title: "Digital India Land Records Modernization Programme — Guidelines",
    issuer: "Department of Land Resources, MoRD",
    year: 2008,
    jurisdiction: "India",
    topics: ["Land Records", "Digital Governance", "Cadastral Mapping"],
    summary:
      "Programme components for computerising records, digitising maps and integrating registration.",
  },
  {
    id: "g4",
    title:
      "Scheduled Tribes and Other Traditional Forest Dwellers (Recognition of Forest Rights) Act, 2006",
    issuer: "Government of India",
    year: 2006,
    jurisdiction: "India",
    topics: ["Forest Protection", "Land Disputes", "Policy Reform"],
    summary: "Recognises individual and community forest rights of forest-dwelling communities.",
  },
  {
    id: "g5",
    title: "National Action Plan on Climate Change — Sustainable Agriculture Mission",
    issuer: "Government of India",
    year: 2008,
    jurisdiction: "India",
    topics: ["Climate", "Agriculture", "Land Use"],
    summary: "Mission framework for climate-resilient agriculture and land management.",
  },
  {
    id: "g6",
    title:
      "Right to Fair Compensation and Transparency in Land Acquisition, Rehabilitation and Resettlement Act, 2013",
    issuer: "Government of India",
    year: 2013,
    jurisdiction: "India",
    topics: ["Land Disputes", "Policy Reform", "Infrastructure"],
    summary: "Acquisition procedure, social impact assessment and compensation norms.",
  },
];

export const GIS_LAYERS: GisLayer[] = [
  {
    id: "l1",
    name: "Land use / land cover (Sentinel-2)",
    source: "Nirvana LULC layer",
    topics: ["Land Use", "Agriculture", "Remote Sensing"],
  },
  {
    id: "l2",
    name: "Urban expansion 2018→2024",
    source: "Nirvana change layer",
    topics: ["Urbanization", "Land Use"],
  },
  {
    id: "l3",
    name: "Climate risk by state",
    source: "Nirvana climate layer",
    topics: ["Climate"],
  },
  {
    id: "l4",
    name: "Land dispute density",
    source: "Nirvana disputes layer",
    topics: ["Land Disputes"],
  },
  {
    id: "l5",
    name: "Infrastructure corridors",
    source: "Road & freight network",
    topics: ["Infrastructure", "Urbanization"],
  },
  {
    id: "l6",
    name: "Protected areas",
    source: "Protected area boundaries (demo)",
    topics: ["Forest Protection"],
  },
  {
    id: "l7",
    name: "Administrative boundaries",
    source: "State & district boundaries",
    topics: ["Land Records", "Digital Governance"],
  },
  {
    id: "l8",
    name: "Parcel boundaries",
    source: "Cadastral extract (demo)",
    topics: ["Cadastral Mapping", "Land Records"],
  },
];

// ---------------------------------------------------------------------------
// Institutions, researchers, network
// ---------------------------------------------------------------------------

export interface Institution {
  id: string;
  name: string;
  short: string;
  type: "Academic" | "Government" | "Research institute";
  state: string;
  areas: Topic[];
  publications: number;
  /** Position in the network diagram (0–100) */
  x: number;
  y: number;
}

export const INSTITUTIONS: Institution[] = [
  {
    id: "iitb",
    name: "IIT Bombay",
    short: "IIT-B",
    type: "Academic",
    state: "Maharashtra",
    areas: ["Urbanization", "Remote Sensing", "Infrastructure"],
    publications: 64,
    x: 22,
    y: 52,
  },
  {
    id: "iitd",
    name: "IIT Delhi",
    short: "IIT-D",
    type: "Academic",
    state: "Delhi",
    areas: ["Land Records", "Climate", "Digital Governance"],
    publications: 51,
    x: 46,
    y: 18,
  },
  {
    id: "iisc",
    name: "IISc Bengaluru",
    short: "IISc",
    type: "Academic",
    state: "Karnataka",
    areas: ["Digital Governance", "Land Records"],
    publications: 38,
    x: 40,
    y: 84,
  },
  {
    id: "iitm",
    name: "IIT Madras",
    short: "IIT-M",
    type: "Academic",
    state: "Tamil Nadu",
    areas: ["Remote Sensing", "Land Use"],
    publications: 44,
    x: 62,
    y: 86,
  },
  {
    id: "nirdpr",
    name: "NIRDPR Hyderabad",
    short: "NIRDPR",
    type: "Research institute",
    state: "Telangana",
    areas: ["Climate", "Land Use", "Policy Reform"],
    publications: 47,
    x: 55,
    y: 60,
  },
  {
    id: "dolr",
    name: "Department of Land Resources",
    short: "DoLR",
    type: "Government",
    state: "Delhi",
    areas: ["Land Records", "Cadastral Mapping", "Policy Reform"],
    publications: 22,
    x: 60,
    y: 30,
  },
  {
    id: "gom",
    name: "Govt. of Maharashtra — Revenue Dept.",
    short: "GoM",
    type: "Government",
    state: "Maharashtra",
    areas: ["Land Records", "Policy Reform"],
    publications: 12,
    x: 12,
    y: 30,
  },
  {
    id: "gog",
    name: "Govt. of Gujarat — Revenue Dept.",
    short: "GoG",
    type: "Government",
    state: "Gujarat",
    areas: ["Urbanization", "Land Records"],
    publications: 10,
    x: 14,
    y: 72,
  },
  {
    id: "cept",
    name: "CEPT University",
    short: "CEPT",
    type: "Academic",
    state: "Gujarat",
    areas: ["Urbanization", "Policy Reform"],
    publications: 29,
    x: 28,
    y: 76,
  },
  {
    id: "tiss",
    name: "Tata Institute of Social Sciences",
    short: "TISS",
    type: "Academic",
    state: "Maharashtra",
    areas: ["Land Disputes", "Forest Protection"],
    publications: 26,
    x: 30,
    y: 30,
  },
  {
    id: "soi",
    name: "Survey of India",
    short: "SoI",
    type: "Government",
    state: "Uttarakhand",
    areas: ["Cadastral Mapping", "Remote Sensing"],
    publications: 18,
    x: 78,
    y: 22,
  },
  {
    id: "cpr",
    name: "Centre for Policy Research",
    short: "CPR",
    type: "Research institute",
    state: "Delhi",
    areas: ["Policy Reform", "Land Disputes"],
    publications: 24,
    x: 78,
    y: 52,
  },
  {
    id: "wii",
    name: "Wildlife Institute of India",
    short: "WII",
    type: "Research institute",
    state: "Uttarakhand",
    areas: ["Forest Protection", "Remote Sensing"],
    publications: 31,
    x: 88,
    y: 36,
  },
  {
    id: "nalsar",
    name: "NALSAR University of Law",
    short: "NALSAR",
    type: "Academic",
    state: "Telangana",
    areas: ["Land Disputes", "Land Records"],
    publications: 17,
    x: 76,
    y: 72,
  },
];

/** Collaboration links: [a, b, joint projects] */
export const COLLABORATIONS: [string, string, number][] = [
  ["iitb", "gom", 4],
  ["iitb", "iisc", 2],
  ["iitb", "tiss", 3],
  ["iitb", "cept", 2],
  ["iitd", "dolr", 5],
  ["iitd", "soi", 2],
  ["iisc", "iitm", 3],
  ["iitm", "nirdpr", 2],
  ["nirdpr", "dolr", 3],
  ["nirdpr", "gom", 2],
  ["cept", "gog", 4],
  ["gog", "iitb", 1],
  ["tiss", "cpr", 2],
  ["cpr", "nalsar", 2],
  ["nalsar", "dolr", 1],
  ["wii", "soi", 2],
  ["wii", "tiss", 1],
  ["dolr", "soi", 4],
  ["iitd", "cpr", 2],
  ["nirdpr", "iisc", 1],
];

export interface Researcher {
  id: string;
  name: string;
  initials: string;
  institution: string;
  role: string;
  state: string;
  expertise: Topic[];
  interests: string;
  publications: number;
  projects: number;
  online: boolean;
  color: string;
}

export const RESEARCHERS: Researcher[] = [
  {
    id: "aditi",
    name: "Aditi Kulkarni",
    initials: "AK",
    institution: "IIT Bombay",
    role: "Principal investigator",
    state: "Maharashtra",
    expertise: ["Remote Sensing", "Urbanization"],
    interests: "Peri-urban transitions, change detection",
    publications: 23,
    projects: 4,
    online: true,
    color: "#0B7A4B",
  },
  {
    id: "rahul",
    name: "Rahul Deshmukh",
    initials: "RD",
    institution: "Ministry of Rural Development",
    role: "Policy advisor",
    state: "Delhi",
    expertise: ["Policy Reform", "Land Records"],
    interests: "Land conversion regulation, DILRMP",
    publications: 9,
    projects: 6,
    online: true,
    color: "#3B82F6",
  },
  {
    id: "priya",
    name: "Priya Iyer",
    initials: "PI",
    institution: "IISc Bengaluru",
    role: "Data scientist",
    state: "Karnataka",
    expertise: ["Remote Sensing", "Land Use"],
    interests: "Classification accuracy, smallholder mapping",
    publications: 17,
    projects: 3,
    online: true,
    color: "#7C5CFC",
  },
  {
    id: "arjun",
    name: "Arjun Menon",
    initials: "AM",
    institution: "Nirvana GIS Cell",
    role: "GIS analyst",
    state: "Maharashtra",
    expertise: ["Cadastral Mapping", "Remote Sensing"],
    interests: "Cadastral–imagery integration",
    publications: 6,
    projects: 5,
    online: true,
    color: "#F59E0B",
  },
  {
    id: "kavya",
    name: "Kavya Patel",
    initials: "KP",
    institution: "CEPT University",
    role: "Urban planner",
    state: "Gujarat",
    expertise: ["Urbanization", "Policy Reform"],
    interests: "Land pooling, town planning schemes",
    publications: 14,
    projects: 2,
    online: false,
    color: "#E34D4D",
  },
  {
    id: "sanjay",
    name: "Sanjay Reddy",
    initials: "SR",
    institution: "NIRDPR Hyderabad",
    role: "Senior fellow",
    state: "Telangana",
    expertise: ["Climate", "Agriculture"],
    interests: "Drought, climate-resilient land use",
    publications: 28,
    projects: 3,
    online: false,
    color: "#0B7A4B",
  },
  {
    id: "meera",
    name: "Meera Rao",
    initials: "MR",
    institution: "NALSAR University of Law",
    role: "Legal scholar",
    state: "Telangana",
    expertise: ["Land Disputes", "Land Records"],
    interests: "Record-of-rights litigation",
    publications: 11,
    projects: 2,
    online: false,
    color: "#3B82F6",
  },
  {
    id: "dev",
    name: "Dev Bhil",
    initials: "DB",
    institution: "Tata Institute of Social Sciences",
    role: "Doctoral researcher",
    state: "Madhya Pradesh",
    expertise: ["Forest Protection", "Land Disputes"],
    interests: "Forest rights, tribal land",
    publications: 5,
    projects: 1,
    online: false,
    color: "#7C5CFC",
  },
  {
    id: "harsh",
    name: "Harsh Singh",
    initials: "HS",
    institution: "IIT Delhi",
    role: "Associate professor",
    state: "Delhi",
    expertise: ["Digital Governance", "Land Records"],
    interests: "Land record platforms, interoperability",
    publications: 19,
    projects: 4,
    online: false,
    color: "#F59E0B",
  },
  {
    id: "ritu",
    name: "Ritu Meena",
    initials: "RM",
    institution: "IIT Delhi",
    role: "Research scholar",
    state: "Rajasthan",
    expertise: ["Climate", "Agriculture"],
    interests: "Groundwater, irrigated expansion",
    publications: 7,
    projects: 2,
    online: false,
    color: "#E34D4D",
  },
];

export const researcher = (id: string) => RESEARCHERS.find((r) => r.id === id);

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

export const WORKSPACE_STAGES = [
  "Question",
  "Evidence",
  "Analysis",
  "Simulation",
  "Findings",
  "Policy Brief",
] as const;

export interface Workspace {
  id: string;
  title: string;
  status: "Active" | "In review" | "Planning";
  state: string;
  institutions: string[];
  members: string[];
  progress: number;
  updated: string;
  /** index into WORKSPACE_STAGES */
  stage: number;
  question: string;
  objectives: string[];
  methods: string[];
  paperIds: string[];
  datasetIds: string[];
  layerIds: string[];
  topics: Topic[];
}

export const WORKSPACES: Workspace[] = [
  {
    id: "ws-mh-transition",
    title: "Maharashtra Agricultural Land Transition Study",
    status: "Active",
    state: "Maharashtra",
    institutions: ["IIT Bombay", "Government of Maharashtra", "IISc Bengaluru"],
    members: ["aditi", "rahul", "priya", "arjun", "sanjay", "meera"],
    progress: 68,
    updated: "2 hours ago",
    stage: 2,
    question:
      "What factors are driving agricultural land conversion around Maharashtra's major urban corridors?",
    objectives: [
      "Identify land-use transitions around the Mumbai–Pune–Nashik corridors",
      "Measure agricultural land loss 2018–2024",
      "Identify climate implications of the transition",
      "Evaluate the effectiveness of conversion regulation",
    ],
    methods: ["Remote sensing", "GIS", "Land records", "Socio-economic data", "Policy analysis"],
    paperIds: ["p1", "p2", "p5", "p9", "p12"],
    datasetIds: ["d1", "d2", "d6", "d8"],
    layerIds: ["l1", "l2", "l5"],
    topics: ["Urbanization", "Agriculture", "Land Use", "Policy Reform"],
  },
  {
    id: "ws-gj-disputes",
    title: "Gujarat Land Pooling & Dispute Resolution",
    status: "In review",
    state: "Gujarat",
    institutions: ["CEPT University", "Government of Gujarat", "NALSAR"],
    members: ["kavya", "meera", "rahul", "harsh"],
    progress: 84,
    updated: "yesterday",
    stage: 4,
    question:
      "Does town-planning-scheme land pooling reduce land disputes compared with compulsory acquisition?",
    objectives: [
      "Compare litigation under pooling and acquisition",
      "Map dispute hotspots in Dholera and Sanand",
      "Assess record quality as a dispute driver",
    ],
    methods: ["Court records", "Land records", "Case study", "GIS"],
    paperIds: ["p3", "p4", "p16"],
    datasetIds: ["d2", "d8"],
    layerIds: ["l4", "l7", "l8"],
    topics: ["Land Disputes", "Policy Reform", "Urbanization"],
  },
  {
    id: "ws-rj-climate",
    title: "Climate-Resilient Land Use in Western Rajasthan",
    status: "Planning",
    state: "Rajasthan",
    institutions: ["IIT Delhi", "NIRDPR"],
    members: ["ritu", "sanjay", "priya"],
    progress: 22,
    updated: "3 days ago",
    stage: 1,
    question:
      "How can land-use planning reduce groundwater stress from irrigated cropland expansion in western Rajasthan?",
    objectives: [
      "Quantify rangeland-to-cropland conversion",
      "Link conversion to groundwater decline",
      "Design land-use scenarios for water security",
    ],
    methods: ["Remote sensing", "Climate data", "Scenario modelling"],
    paperIds: ["p10", "p5"],
    datasetIds: ["d1", "d4", "d3"],
    layerIds: ["l1", "l3"],
    topics: ["Climate", "Agriculture", "Land Use"],
  },
];

// Canvas, tasks, discussion, versions — seeded per workspace, then edited in the UI
export type CanvasKind =
  | "Question"
  | "Hypothesis"
  | "Dataset"
  | "Paper"
  | "GIS Layer"
  | "Analysis"
  | "Finding"
  | "Policy"
  | "Simulation";

export interface CanvasNode {
  id: string;
  kind: CanvasKind;
  label: string;
  x: number;
  y: number;
}
export interface CanvasEdge {
  from: string;
  to: string;
}

export function seedCanvas(ws: Workspace): { nodes: CanvasNode[]; edges: CanvasEdge[] } {
  const paper = PAPERS.find((p) => p.id === ws.paperIds[0]);
  const dataset = DATASETS.find((d) => d.id === ws.datasetIds[0]);
  const nodes: CanvasNode[] = [
    {
      id: "n1",
      kind: "Question",
      label: ws.topics.includes("Urbanization")
        ? "Urban expansion"
        : (ws.topics[0] ?? "Research question"),
      x: 60,
      y: 40,
    },
    {
      id: "n2",
      kind: "Hypothesis",
      label: ws.topics.includes("Agriculture")
        ? "Agricultural conversion accelerates near corridors"
        : "Policy regime shapes outcomes",
      x: 60,
      y: 170,
    },
    { id: "n3", kind: "Paper", label: paper?.title ?? "Key study", x: 340, y: 40 },
    { id: "n4", kind: "Dataset", label: dataset?.name ?? "Core dataset", x: 340, y: 170 },
    { id: "n5", kind: "Analysis", label: "Land-use change analysis 2018→2024", x: 340, y: 300 },
    {
      id: "n6",
      kind: "Finding",
      label:
        ws.stage >= 3
          ? "Conversion concentrated within 5 km of interchanges"
          : "Climate impact (pending)",
      x: 620,
      y: 300,
    },
    { id: "n7", kind: "Simulation", label: "Agricultural preservation scenario", x: 620, y: 170 },
    {
      id: "n8",
      kind: "Policy",
      label: "Recommendation: corridor conversion controls",
      x: 620,
      y: 40,
    },
  ];
  const edges: CanvasEdge[] = [
    { from: "n1", to: "n2" },
    { from: "n2", to: "n4" },
    { from: "n3", to: "n2" },
    { from: "n4", to: "n5" },
    { from: "n5", to: "n6" },
    { from: "n6", to: "n7" },
    { from: "n7", to: "n8" },
  ];
  // Leave room for the canvas toolbar above the first row
  return { nodes: nodes.map((n) => ({ ...n, y: n.y + 90 })), edges };
}

export const TASK_COLUMNS = [
  "Research questions",
  "Data collection",
  "Analysis",
  "Review",
  "Completed",
] as const;
export interface Task {
  id: string;
  title: string;
  assignee: string;
  column: (typeof TASK_COLUMNS)[number];
  due: string;
  tag: Topic;
}

export function seedTasks(ws: Workspace): Task[] {
  const [a = "aditi", b = "rahul", c = "priya", d = "arjun"] = ws.members;
  return [
    {
      id: "t1",
      title: "Refine research question with state partners",
      assignee: b,
      column: "Completed",
      due: "12 Sep",
      tag: "Policy Reform",
    },
    {
      id: "t2",
      title: "Validate Sentinel-2 classification",
      assignee: c,
      column: "Analysis",
      due: "28 Sep",
      tag: "Remote Sensing",
    },
    {
      id: "t3",
      title: `Review ${ws.state} land-use policy`,
      assignee: b,
      column: "Review",
      due: "30 Sep",
      tag: "Policy Reform",
    },
    {
      id: "t4",
      title: "Calculate agricultural transition 2018→2024",
      assignee: a,
      column: "Analysis",
      due: "2 Oct",
      tag: "Agriculture",
    },
    {
      id: "t5",
      title: "Generate policy brief",
      assignee: d,
      column: "Research questions",
      due: "15 Oct",
      tag: "Policy Reform",
    },
    {
      id: "t6",
      title: "Obtain DILRMP extracts for 3 districts",
      assignee: d,
      column: "Data collection",
      due: "25 Sep",
      tag: "Land Records",
    },
    {
      id: "t7",
      title: "Field validation plan for corridor villages",
      assignee: c,
      column: "Data collection",
      due: "5 Oct",
      tag: "Remote Sensing",
    },
  ];
}

export interface Comment {
  id: string;
  author: string;
  text: string;
  time: string;
  replies: { author: string; text: string; time: string }[];
  anchor?: string;
}

export function seedComments(ws: Workspace): Comment[] {
  const [a = "aditi", b = "rahul", c = "priya", d = "arjun"] = ws.members;
  return [
    {
      id: "c1",
      author: a,
      time: "2h ago",
      anchor: "Analysis · corridor transition",
      text: `@${researcher(b)?.name.split(" ")[0] ?? "Rahul"} can you validate this land-use transition? Satellite evidence suggests a 14% conversion around the corridor.`,
      replies: [
        {
          author: b,
          text: "Cross-checking with conversion (NA) orders for Haveli and Mulshi talukas — will confirm by Friday.",
          time: "1h ago",
        },
      ],
    },
    {
      id: "c2",
      author: c,
      time: "5h ago",
      anchor: "Dataset · Sentinel-2",
      text: "Classification accuracy is 87% overall; fallow vs sparse cropland is the main confusion. Flagging for the methods section.",
      replies: [
        {
          author: d,
          text: "I can add 40 field points from the GIS cell survey to improve that class.",
          time: "4h ago",
        },
      ],
    },
  ];
}

export interface Version {
  id: string;
  label: string;
  author: string;
  time: string;
  note: string;
}

export function seedVersions(ws: Workspace): Version[] {
  const [a = "aditi", b = "rahul", c = "priya"] = ws.members;
  return [
    {
      id: "v5",
      label: "v0.5",
      author: a,
      time: "2 hours ago",
      note: "Added corridor transition analysis and updated canvas",
    },
    {
      id: "v4",
      label: "v0.4",
      author: c,
      time: "yesterday",
      note: "Replaced classification with validated Sentinel-2 run",
    },
    {
      id: "v3",
      label: "v0.3",
      author: b,
      time: "3 days ago",
      note: "Policy review notes for conversion regulation",
    },
    {
      id: "v2",
      label: "v0.2",
      author: a,
      time: "1 week ago",
      note: "Evidence base: 5 papers, 4 datasets linked",
    },
    {
      id: "v1",
      label: "v0.1",
      author: a,
      time: "2 weeks ago",
      note: `Workspace created — ${ws.title}`,
    },
  ];
}

// ---------------------------------------------------------------------------
// Snapshot metrics, gaps, case studies
// ---------------------------------------------------------------------------

export const SNAPSHOT = [
  { value: "12,480+", label: "Research publications", trend: "+18.4%", note: "research activity" },
  { value: "1,840", label: "Datasets", trend: "+12.1%", note: "new datasets" },
  { value: "426", label: "Policy documents", trend: "+6.3%", note: "added this year" },
  { value: "184", label: "Active research projects", trend: "+22.0%", note: "new workspaces" },
  { value: "72", label: "Institutions", trend: "+9", note: "joined this year" },
  { value: "31", label: "States / UTs", trend: "+4", note: "newly represented" },
];

export const GAP_THEMES = [
  "Climate resilience",
  "Urban land transition",
  "Agricultural conversion",
  "Land disputes",
  "Cadastral modernisation",
  "Digital land records",
  "Tribal land governance",
  "Forest rights",
  "District-level policy impact",
  "Coastal land use",
] as const;

/** 3 = well studied, 2 = moderately studied, 1 = under-researched, 0 = data deficient */
export const GAP_MATRIX: Record<(typeof GAP_THEMES)[number], number[]> = {
  "Climate resilience": [3, 2, 2, 2, 1, 3],
  "Urban land transition": [3, 3, 3, 1, 2, 1],
  "Agricultural conversion": [3, 2, 2, 1, 2, 2],
  "Land disputes": [2, 2, 1, 1, 1, 1],
  "Cadastral modernisation": [2, 2, 3, 2, 2, 1],
  "Digital land records": [2, 3, 3, 2, 2, 2],
  "Tribal land governance": [1, 1, 1, 2, 0, 1],
  "Forest rights": [2, 1, 1, 2, 0, 1],
  "District-level policy impact": [1, 1, 1, 0, 0, 0],
  "Coastal land use": [2, 2, 1, 0, 0, 0],
};

export const GAP_LEVELS = [
  { label: "Data deficient", short: "Data deficient" },
  { label: "Under-researched", short: "Low" },
  { label: "Moderately studied", short: "Moderate" },
  { label: "Well studied", short: "High" },
];

export interface CaseStudy {
  id: string;
  name: string;
  state: string;
  geography: string;
  transition: string;
  policy: string;
  climate: string;
  disputes: string;
  interventions: string[];
  paperIds: string[];
  datasetIds: string[];
  tone: "blue" | "orange" | "red" | "purple" | "green";
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    id: "dholera",
    name: "Dholera",
    state: "Gujarat",
    geography: "Coastal saline plain on the Gulf of Khambhat",
    transition: "Saline farmland and grazing land → planned industrial city",
    policy: "Special Investment Region Act; town planning schemes with land pooling",
    climate: "High coastal flood and salinity exposure",
    disputes: "Plot reconstitution and compensation disputes after pooling",
    interventions: ["Land pooling (TPS)", "Trunk infrastructure first", "Flood-level plinth norms"],
    paperIds: ["p3", "p16"],
    datasetIds: ["d1", "d8"],
    tone: "blue",
  },
  {
    id: "sanand",
    name: "Sanand",
    state: "Gujarat",
    geography: "Peri-urban Ahmedabad, irrigated plain",
    transition: "Irrigated cropland → automobile manufacturing cluster",
    policy: "GIDC industrial estate allotment",
    climate: "Moderate heat stress, groundwater decline",
    disputes: "Moderate — acquisition price and access roads",
    interventions: ["Industrial estate zoning", "Skill development for land-losers"],
    paperIds: ["p12"],
    datasetIds: ["d1", "d6"],
    tone: "purple",
  },
  {
    id: "mundra",
    name: "Mundra",
    state: "Gujarat",
    geography: "Kutch coast, mangroves and salt pans",
    transition: "Mangrove, grazing and salt pan → port-led SEZ",
    policy: "SEZ Act; Coastal Regulation Zone notifications",
    climate: "Cyclone surge and sea-level exposure",
    disputes: "Grazing commons and fishing access conflicts",
    interventions: ["CRZ compliance audits", "Mangrove compensatory plantation"],
    paperIds: ["p15"],
    datasetIds: ["d1", "d4"],
    tone: "orange",
  },
  {
    id: "nashik",
    name: "Nashik",
    state: "Maharashtra",
    geography: "Godavari basin, vineyards and industrial belt",
    transition: "Vineyards and cropland → industrial and residential use",
    policy: "Deemed NA conversion; MIDC industrial areas",
    climate: "Rainfall variability; flood risk along the Godavari",
    disputes: "Record-of-rights mismatches in peri-urban villages",
    interventions: ["Deemed conversion rules", "Village record digitisation"],
    paperIds: ["p1", "p4"],
    datasetIds: ["d1", "d2"],
    tone: "green",
  },
  {
    id: "pune",
    name: "Pune",
    state: "Maharashtra",
    geography: "Deccan plateau metropolitan fringe",
    transition: "Cropland → peri-urban housing and IT parks",
    policy: "PMRDA development plan; NA permissions",
    climate: "Urban heat and flash floods",
    disputes: "High — boundary and title disputes on the fringe",
    interventions: ["Metropolitan development plan", "Town planning schemes"],
    paperIds: ["p1", "p2"],
    datasetIds: ["d1", "d2", "d6"],
    tone: "red",
  },
  {
    id: "gift",
    name: "GIFT City",
    state: "Gujarat",
    geography: "Sabarmati riverfront, Gandhinagar",
    transition: "Agricultural land → financial services district",
    policy: "Special planning authority; IFSC regulation",
    climate: "Heat stress; riverine flood margins",
    disputes: "Low — largely government land",
    interventions: ["Greenfield smart infrastructure", "District cooling"],
    paperIds: ["p12"],
    datasetIds: ["d6"],
    tone: "blue",
  },
  {
    id: "gir",
    name: "Sasan Gir",
    state: "Gujarat",
    geography: "Dry deciduous forest, Asiatic lion habitat",
    transition: "Forest buffer → agriculture and tourism resorts",
    policy: "Eco-sensitive zone notification; Wildlife Protection Act",
    climate: "Drought and heat exposure",
    disputes: "Eco-sensitive zone restrictions on private land",
    interventions: ["Eco-sensitive zone", "Corridor protection"],
    paperIds: ["p13"],
    datasetIds: ["d10", "d1"],
    tone: "green",
  },
];

// ---------------------------------------------------------------------------
// Evidence retrieval
// ---------------------------------------------------------------------------

const STOP = new Set(
  "the a an of in on for to and or is are was were has have what which how does do can with by from this that across around into about between vs versus compare summarize summarise evidence research study studies exist exists any there".split(
    " ",
  ),
);

// Query words → catalogue vocabulary
const SYNONYMS: Record<string, string[]> = {
  urban: ["urbanization", "built-up", "city", "peri-urban"],
  urbanisation: ["urbanization"],
  urbanization: ["urban"],
  expansion: ["urbanization", "built-up"],
  agricultural: ["agriculture", "cropland", "farmland"],
  farmland: ["agriculture", "cropland"],
  agriculture: ["agricultural", "cropland"],
  conversion: ["transition", "converted", "conversion"],
  loss: ["conversion"],
  dispute: ["disputes", "litigation"],
  disputes: ["dispute", "litigation"],
  climate: ["drought", "rainfall", "resilience", "vulnerability"],
  resilient: ["climate", "resilience"],
  records: ["record", "dilrmp", "record-of-rights"],
  record: ["records"],
  cadastral: ["cadastral", "survey", "svamitva"],
  forest: ["forest", "tribal"],
  tribal: ["forest", "tribal"],
  satellite: ["sentinel-2", "remote"],
  remote: ["satellite", "sentinel-2"],
  digital: ["digital", "platform", "dilrmp"],
  water: ["groundwater", "water"],
  groundwater: ["water"],
  infrastructure: ["expressway", "corridor", "highway"],
};

const STATE_NAMES = [
  "Maharashtra",
  "Gujarat",
  "Karnataka",
  "Madhya Pradesh",
  "Uttar Pradesh",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Delhi",
];
const PLACE_TO_STATE: Record<string, string> = {
  pune: "Maharashtra",
  mumbai: "Maharashtra",
  nashik: "Maharashtra",
  marathwada: "Maharashtra",
  dholera: "Gujarat",
  sanand: "Gujarat",
  mundra: "Gujarat",
  kutch: "Gujarat",
  lucknow: "Uttar Pradesh",
  bengaluru: "Karnataka",
  "western india": "Gujarat",
};

export interface ParsedQuery {
  terms: string[];
  states: string[];
  topics: Topic[];
  compare: boolean;
}

const ALL_TOPICS: Topic[] = [
  "Land Use",
  "Climate",
  "Land Disputes",
  "Urbanization",
  "Agriculture",
  "Cadastral Mapping",
  "Remote Sensing",
  "Land Records",
  "Digital Governance",
  "Policy Reform",
  "Forest Protection",
  "Infrastructure",
];

const TOPIC_TRIGGERS: Record<Topic, string[]> = {
  "Land Use": ["land use", "land-use", "lulc", "land cover"],
  Climate: ["climate", "drought", "resilien", "rainfall", "heat", "flood"],
  "Land Disputes": ["dispute", "litigation", "conflict"],
  Urbanization: ["urban", "city", "built-up", "peri-urban"],
  Agriculture: ["agricultur", "farm", "crop"],
  "Cadastral Mapping": ["cadastral", "survey", "svamitva", "parcel"],
  "Remote Sensing": ["remote sensing", "satellite", "sentinel"],
  "Land Records": ["record", "dilrmp", "record-of-rights"],
  "Digital Governance": ["digital", "platform", "e-governance"],
  "Policy Reform": ["policy", "regulation", "law", "act", "reform"],
  "Forest Protection": ["forest", "tribal", "protected"],
  Infrastructure: ["infrastructure", "expressway", "corridor", "highway", "port"],
};

export function parseQuery(q: string, extraTopics: Topic[] = []): ParsedQuery {
  const lower = q.toLowerCase();
  const states = new Set<string>();
  for (const s of STATE_NAMES) if (lower.includes(s.toLowerCase())) states.add(s);
  for (const [place, s] of Object.entries(PLACE_TO_STATE)) if (lower.includes(place)) states.add(s);
  if (lower.includes("western india")) {
    states.add("Gujarat");
    states.add("Maharashtra");
    states.add("Rajasthan");
  }
  const topics = new Set<Topic>(extraTopics);
  for (const t of ALL_TOPICS) if (TOPIC_TRIGGERS[t].some((w) => lower.includes(w))) topics.add(t);
  const base = lower.split(/[^a-z0-9-]+/).filter((w) => w.length > 2 && !STOP.has(w));
  const terms = Array.from(new Set(base.flatMap((w) => [w, ...(SYNONYMS[w] ?? [])])));
  return {
    terms,
    states: [...states],
    topics: [...topics],
    compare: /\bcompare|versus|\bvs\b/.test(lower) && states.size >= 2,
  };
}

const hay = (...parts: (string | string[] | undefined)[]) =>
  parts.flat().filter(Boolean).join(" ").toLowerCase();

function score(
  text: { title: string; body: string; topics: Topic[]; states: string[]; people?: string },
  p: ParsedQuery,
) {
  let s = 0;
  const title = text.title.toLowerCase();
  const body = text.body.toLowerCase();
  for (const t of p.terms) {
    if (title.includes(t)) s += 3;
    else if (body.includes(t)) s += 1;
    if (text.people?.toLowerCase().includes(t)) s += 3;
  }
  for (const t of p.topics) if (text.topics.includes(t)) s += 4;
  for (const st of p.states)
    if (text.states.includes(st) || text.states.includes("India"))
      s += text.states.includes(st) ? 4 : 1;
  if (
    p.states.length &&
    !p.states.some((st) => text.states.includes(st) || text.states.includes("India"))
  )
    s *= 0.4;
  return s;
}

export interface SearchResults {
  papers: Paper[];
  datasets: Dataset[];
  policies: PolicyDoc[];
  layers: GisLayer[];
  parsed: ParsedQuery;
}

export function searchCatalogue(q: string, topics: Topic[] = []): SearchResults {
  const parsed = parseQuery(q, topics);
  const empty = !q.trim() && topics.length === 0;
  const rank = <T>(items: T[], f: (x: T) => number, min = 3) =>
    empty
      ? items
      : items
          .map((x) => [x, f(x)] as const)
          .filter(([, s]) => s >= min)
          .sort((a, b) => b[1] - a[1])
          .map(([x]) => x);
  return {
    parsed,
    papers: rank(PAPERS, (x) =>
      score(
        {
          title: x.title,
          body: hay(x.finding, x.abstract, x.methods, x.type),
          topics: x.topics,
          states: x.states,
          people: hay(x.authors, x.institution),
        },
        parsed,
      ),
    ),
    datasets: rank(DATASETS, (x) =>
      score(
        {
          title: x.name,
          body: hay(x.description, x.source, x.kind),
          topics: x.topics,
          states: [x.coverage.includes("India") ? "India" : x.coverage],
        },
        parsed,
      ),
    ),
    policies: rank(POLICIES, (x) =>
      score(
        {
          title: x.title,
          body: hay(x.summary, x.issuer),
          topics: x.topics,
          states: [x.jurisdiction],
        },
        parsed,
      ),
    ),
    layers: rank(
      GIS_LAYERS,
      (x) => score({ title: x.name, body: x.source, topics: x.topics, states: ["India"] }, parsed),
      4,
    ),
  };
}

export interface Claim {
  text: string;
  sources: { kind: "paper" | "dataset" | "policy"; id: string; label: string }[];
}

export interface CopilotAnswer {
  query: string;
  insight: Claim | null;
  claims: Claim[];
  comparison: { state: string; papers: Paper[]; claim: Claim | null }[] | null;
  evidence: SearchResults;
  coverage: {
    score: number;
    label: "Strong" | "Moderate" | "Limited" | "Insufficient";
    note: string;
  };
}

const paperSource = (p: Paper) => ({
  kind: "paper" as const,
  id: p.id,
  label: `${p.authors[0]} et al. ${p.year}`,
});

function claimFor(p: Paper): Claim {
  const ds = DATASETS.filter((d) => p.datasetIds.includes(d.id)).slice(0, 1);
  return {
    text: p.finding,
    sources: [
      paperSource(p),
      ...ds.map((d) => ({ kind: "dataset" as const, id: d.id, label: d.name })),
    ],
  };
}

export function answerQuestion(q: string): CopilotAnswer {
  const evidence = searchCatalogue(q);
  const papers = evidence.papers.slice(0, 5);
  const top = papers[0];
  const coverageScore = Math.min(
    100,
    papers.length * 16 +
      evidence.datasets.slice(0, 4).length * 8 +
      evidence.policies.slice(0, 3).length * 4,
  );
  const label =
    coverageScore >= 75
      ? "Strong"
      : coverageScore >= 50
        ? "Moderate"
        : coverageScore > 0
          ? "Limited"
          : "Insufficient";
  const comparison = evidence.parsed.compare
    ? evidence.parsed.states.map((state) => {
        // Prefer studies specific to this state so each column shows distinct evidence
        const topics = evidence.parsed.topics;
        const sp = evidence.papers
          .filter((p) => p.states.includes(state))
          .filter((p) => topics.length === 0 || p.topics.some((t) => topics.includes(t)))
          .sort((a, b) => a.states.length - b.states.length)
          .slice(0, 3);
        return { state, papers: sp, claim: sp[0] ? claimFor(sp[0]) : null };
      })
    : null;
  return {
    query: q,
    insight: top ? claimFor(top) : null,
    claims: papers.slice(1, 4).map(claimFor),
    comparison,
    evidence,
    coverage: {
      score: coverageScore,
      label,
      note: papers.length
        ? `${papers.length} studies, ${Math.min(4, evidence.datasets.length)} datasets and ${Math.min(3, evidence.policies.length)} policy documents in the catalogue match this question.`
        : "No catalogue items match this question yet — try broader terms or a different state.",
    },
  };
}

export interface LiteratureReview {
  query: string;
  papers: Paper[];
  byYear: { year: number; count: number }[];
  institutions: { name: string; count: number }[];
  findings: Claim[];
  contradictions: Claim[];
  methods: { name: string; count: number }[];
  datasets: Dataset[];
  gaps: { theme: string; state: string; level: number }[];
}

const tally = (items: string[]) =>
  Object.entries(
    items.reduce<Record<string, number>>((acc, x) => ((acc[x] = (acc[x] ?? 0) + 1), acc), {}),
  )
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

export function literatureReview(q: string): LiteratureReview {
  const { papers, parsed } = searchCatalogue(q);
  const years = Array.from(new Set(PAPERS.map((p) => p.year))).sort();
  const states = parsed.states.length ? parsed.states : ["Maharashtra", "Gujarat"];
  const gaps: LiteratureReview["gaps"] = [];
  GAP_THEMES.forEach((theme) => {
    FOCUS_STATES.forEach((state, i) => {
      const level = GAP_MATRIX[theme][i] ?? 0;
      if (states.includes(state) && level <= 1) gaps.push({ theme, state, level });
    });
  });
  return {
    query: q,
    papers,
    byYear: years.map((year) => ({ year, count: papers.filter((p) => p.year === year).length })),
    institutions: tally(papers.map((p) => p.institution)).slice(0, 5),
    findings: papers
      .filter((p) => !p.contradicts)
      .slice(0, 4)
      .map(claimFor),
    contradictions: papers.filter((p) => p.contradicts).map(claimFor),
    methods: tally(papers.flatMap((p) => p.methods)).slice(0, 6),
    datasets: DATASETS.filter((d) => papers.some((p) => p.datasetIds.includes(d.id))),
    gaps: gaps.sort((a, b) => a.level - b.level).slice(0, 5),
  };
}

export const paperById = (id: string) => PAPERS.find((p) => p.id === id);
export const datasetById = (id: string) => DATASETS.find((d) => d.id === id);
export const policyById = (id: string) => POLICIES.find((p) => p.id === id);
export const layerById = (id: string) => GIS_LAYERS.find((l) => l.id === id);

export const COPILOT_EXAMPLES = [
  "What research exists on agricultural land conversion in Maharashtra?",
  "Which states have studied climate-resilient land use?",
  "Compare land dispute research across Maharashtra and Gujarat.",
  "What datasets can support research on urban expansion?",
  "Summarize the evidence on urban expansion and agricultural land loss.",
];
