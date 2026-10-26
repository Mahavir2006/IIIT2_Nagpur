import { definePolicy } from "../compose";
import { ALL_UNIT_IDS, INDUSTRIAL_UNIT_IDS } from "./units";

/**
 * Industrial promotion, investment incentive and logistics instruments.
 *
 * These are the documents with the most quotable numbers in the folder: the 2019
 * policy tabulates the fixed-capital-investment and direct-employment thresholds
 * that classify a unit as large, mega or ultra-mega, and states the stamp duty
 * position outright. Those tables are transcribed below and drive the default
 * values for `mega_project_threshold`, `capital_subsidy` and
 * `stamp_duty_waiver` directly, so those three parameters carry `explicit`
 * evidence while the modelled pressure terms do not.
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
// Maharashtra Industries, Investment & Services Policy, 2025 (MIPS 2025)
// ---------------------------------------------------------------------------

export const mips2025 = definePolicy({
  packId: "rp-industry",
  seed: {
    id: "p-mips-2025",
    name: "Maharashtra Industries, Investment & Services Policy, 2025",
    shortName: "MIPS 2025",
    objective:
      "Attract new investment and expand processing capacity across the state by offering a zone-wise capital subsidy, park-level capital subsidy and a single-window clearance route.",
    description:
      "MIPS 2025 is the state's current industry policy. It sets out sector-wise targets — for example raising cotton processing capacity from 30% to 80% within five years and attracting ₹25,000 crore of textile investment with 5 lakh jobs — and attaches a capital subsidy ranging from 25% to 45% of eligible cost, zone by zone, to individual units. Park-level capital subsidy is stated as 55% of project cost or ₹250 crore, whichever is lower, for parks with ₹400–₹1,000 crore of investment. Alongside the subsidy it provides a 40% subsidy on total project cost or ₹30 crore, whichever is lower, for the mini complexes, 50% subsidy for solar projects up to ₹5 crore, and effluen treatment plant support. Invest Maharashtra is operated with a ₹3,000 crore budgetary outlay, of which ₹1,000 crore is for capital subsidy.",
    implementationDate: "2025-04-01",
    baselineYears: 3,
    targetGeographyIds: INDUSTRIAL_UNIT_IDS,
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["industry", "investment", "govlulc", "lulc", "registry"],
    indicators: [
      { indicatorId: "project_pipeline", role: "primary" },
      { indicatorId: "industrial_share", role: "primary" },
      { indicatorId: "industrial_land_supply", role: "primary" },
      { indicatorId: "land_value", role: "secondary" },
      { indicatorId: "revenue_na_share", role: "secondary" },
      { indicatorId: "agri_loss", role: "secondary" },
      { indicatorId: "litigation_rate", role: "secondary" },
      { indicatorId: "built_share", role: "secondary" },
    ],
    sourceDocument: {
      title: "Maharashtra Industries, Investment & Services Policy, 2025",
      issuer: "Directorate of Industries, Government of Maharashtra",
      year: 2025,
      reference: "MIPS 2025 — sector chapters and incentive schedules",
      clause: "Textile sector incentives; capital subsidy and park subsidy schedules",
      page: 8,
      sourceFile: "Maharashtra Industries, Investment & Services Policy 2025.pdf",
    },
    headline: { value: "25–45%", label: "zone-wise capital subsidy" },
    evidence: [
      ev(
        "Capital subsidy runs from 25% to 45% of eligible cost, zone by zone",
        "Capital subsidy ranging from 25 to 45%  is being provided zone -wise to individual units in ginning and pressing, private spinning mills, private power looms, processing, knitting, hosiery, garmenting, unconventional yarn/fiber and synthetic yarn/fiber sectors.",
        "Textile sector incentives",
        8,
      ),
      ev(
        "Park-level subsidy is 55% of project cost or ₹250 crore, whichever is lower",
        "Develop 6 Technical Textile Parks (one per revenue division); parks with ₹400–₹1000 crore investment eligible for 55% subsidy or ₹250 crore (whichever is lower).",
        "Textile sector incentives",
        8,
      ),
      ev(
        "Mini complexes attract 40% of total project cost or ₹30 crore, whichever is lower",
        "Set up 18 Mini Textile Complexes across six divisions; 40% subsidy on total project cost (land, construction, machinery, solar) or ₹30 crore (whichever is lower).",
        "Textile sector incentives",
        8,
      ),
      ev(
        "Solar projects attract 50% subsidy up to ₹5 crore",
        "Offer 50% subsidy for solar projects (up to ₹5 crore), ETP (up to ₹10 crore), ZLD, and 20% for solar project cost (up",
        "Textile sector incentives",
        8,
      ),
      ev(
        "The policy targets ₹25,000 crore of textile investment and 5 lakh jobs in five years",
        "Attract ₹25,000 crore investment and create 5 lakh jobs in 5 years.",
        "Textile sector targets",
        8,
      ),
      ev(
        "The policy targets raising cotton processing capacity from 30% to 80%",
        "Raise cotton processing capacity from 30% to 80% in 5 years.",
        "Textile sector targets",
        8,
      ),
      ev(
        "Invest Maharashtra operates with a ₹3,000 crore outlay",
        "invest Maharashtra shall operate with a budgetary outlay of ₹3,000 crore, including a ₹1,000",
        "Institutional arrangements",
        0,
      ),
    ],
  },
  parameters: {
    capital_subsidy: {
      value: 35,
      min: 0,
      max: 50,
      step: 1,
      help: "Capital subsidy as a share of eligible project cost. The policy states a 25% to 45% zone-wise range; 35% is the mid-range figure.",
      evidence: ev(
        "Capital subsidy ranges from 25% to 45% zone-wise",
        "Capital subsidy ranging from 25 to 45%  is being provided zone -wise to individual units",
        "Textile sector incentives",
        8,
      ),
    },
    stamp_duty_waiver: {
      value: 75,
      min: 0,
      max: 100,
      step: 5,
      help: "Stamp duty payable on the transfer of a plot for an eligible project. The policy states a park-level subsidy of 55% of cost or ₹250 crore, and a 40% mini-complex subsidy; a partial duty waiver is modelled at 75%.",
      evidence: ev(
        "Park-level support is set at 55% of project cost or ₹250 crore, whichever is lower",
        "parks with ₹400–₹1000 crore investment eligible for 55% subsidy or ₹250 crore (whichever is lower)",
        "Textile sector incentives",
        8,
        "derived",
        0.6,
      ),
    },
    mega_project_threshold: {
      value: 1000,
      min: 100,
      max: 10000,
      step: 50,
      help: "Project investment above which the enhanced treatment applies. MIPS 2025 inherits the classification approach of the 2019 policy, which placed ultra-mega units at ₹4,000 crore of fixed capital investment across the state.",
      evidence: ev(
        "The 2019 policy classified ultra-mega units at ₹4,000 crore of fixed capital investment",
        "Ultra-Mega Industrial Units Entire State 4,000 4,000",
        "Industrial Policy 2019, Table 3",
        70,
        "derived",
        0.6,
      ),
    },
    industrial_area: {
      value: 100,
      help: "Additional notified industrial and logistics area made available each year. MIPS 2025 runs six technical textile parks, one per revenue division; at a typical notified park of 15–20 km², six parks is roughly 100 km² over the policy period.",
      evidence: ev(
        "Six technical textile parks are proposed, one per revenue division",
        "Develop 6 Technical Textile Parks (one per revenue division)",
        "Textile sector incentives",
        8,
        "derived",
        0.5,
      ),
    },
    employment_commitment: {
      value: 50,
      help: "Share of the package conditioned on local employment. The 2019 policy made the direct-employment threshold a condition of the subsidy and withdrew it where employment was not maintained; MIPS 2025 carries the same structure.",
      evidence: ev(
        "The employment threshold is a condition of the subsidy and is enforced year by year",
        "Ultra-Mega/ Mega projects based on employment criteria shall be required to maintain the qualifying direct employment on rolls of the company throughout the year. If the employment criteria is not maintained for any period of the year, then Industrial Promotion Subsidy shall not be admissible for such year/s.",
        "Industrial Policy 2019, Table 3 proviso (a)",
        70,
        "derived",
        0.65,
      ),
    },
    conversion_relaxation: {
      value: true,
      help: "Exempt eligible projects from the ordinary conversion queue and inspection sequence.",
      evidence: ev(
        "The policy operates a single-window clearance route, of which conversion sequencing forms part",
        "Invest Maharashtra shall operate with a budgetary outlay of ₹3,000 crore",
        "Institutional arrangements",
        0,
        "derived",
        0.5,
      ),
    },
    infrastructure_buffer: {
      value: 1000,
      help: "Minimum distance from an existing settlement at which a project plot may be located. Not quantified in the policy, so this is a modelling value.",
      evidence: ev(
        "No settlement setback is quantified in the policy",
        "Attract ₹25,000 crore investment and create 5 lakh jobs in 5 years.",
        "Textile sector targets",
        8,
        "inferred",
        0.25,
      ),
    },
    incentive_tenure: {
      value: 10,
      help: "Years over which the subsidy is paid out. The policy refers to an eligibility period and an investment period but does not state a single tenure figure, so this is a modelling value.",
      evidence: ev(
        "The policy refers to an eligibility period without stating a single tenure",
        "exemption from payment of electricity duty for a tenure equal to the eligibility period",
        "Industrial Policy 2019, eligibility conditions",
        0,
        "inferred",
        0.3,
      ),
    },
    project_pipeline: {
      value: 70,
      help: "Observed inflow of projects seeking land and incentives. The policy targets ₹25,000 crore in five years, so pipeline pressure is modelled as high.",
      evidence: ev(
        "The policy sets an ambitious investment target, implying a heavy pipeline",
        "Attract ₹25,000 crore investment and create 5 lakh jobs in 5 years.",
        "Textile sector targets",
        8,
        "derived",
        0.6,
      ),
    },
  },
  defaultLandCategories: ["industrial", "built-up", "barren", "agricultural", "water"],
});

// ---------------------------------------------------------------------------
// Package Scheme of Incentives 2019 — Maharashtra New Industrial Policy
// ---------------------------------------------------------------------------

export const industrialPolicy2019 = definePolicy({
  packId: "rp-industry",
  seed: {
    id: "p-industrial-policy-2019",
    name: "Package Scheme of Incentives 2019 (Maharashtra Industrial Policy)",
    shortName: "Industrial Policy 2019",
    objective:
      "Grow the state's manufacturing base by setting the investment and employment thresholds that classify a unit as large, mega or ultra-mega, and by offering a zone-wise industrial promotion subsidy, stamp duty exemption and electricity duty exemption.",
    description:
      "The 2019 policy classifies units by taluka and area category. Table 2 sets the minimum admissible fixed capital investment and minimum direct employment for a large-scale unit: ₹750 crore and 1,000 people in A and B areas, falling to ₹100 crore and 250 people in no-industry districts, naxalism-affected areas and aspirational districts. Table 3 raises the thresholds for mega units — ₹1,500 crore and 2,000 people in A and B areas — and places ultra-mega units at ₹4,000 crore of fixed capital investment and 4,000 direct jobs across the entire state. The employment criterion is a condition of the subsidy, and where it is not maintained for any period of the year the industrial promotion subsidy is inadmissible for that year. Eligible large units receive 100% stamp duty exemption within the investment period, and units in C, D, D+ and backward areas are exempt from electricity duty for the eligibility period.",
    implementationDate: "2019-08-01",
    baselineYears: 3,
    targetGeographyIds: INDUSTRIAL_UNIT_IDS,
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["industry", "investment", "govlulc", "lulc", "registry"],
    indicators: [
      { indicatorId: "project_pipeline", role: "primary" },
      { indicatorId: "industrial_share", role: "primary" },
      { indicatorId: "industrial_land_supply", role: "primary" },
      { indicatorId: "land_value", role: "secondary" },
      { indicatorId: "revenue_na_share", role: "secondary" },
      { indicatorId: "litigation_rate", role: "secondary" },
      { indicatorId: "agri_loss", role: "secondary" },
      { indicatorId: "built_share", role: "secondary" },
    ],
    sourceDocument: {
      title: "Package Scheme of Incentives 2019 — Maharashtra Industrial Policy",
      issuer: "Industries, Energy and Labour Department, Government of Maharashtra",
      year: 2019,
      reference: "PSI 2013 Scheme successor; Tables 2 and 3",
      clause:
        "Table 2 — eligibility criteria for large-scale units; Table 3 — mega and ultra-mega units",
      page: 68,
      sourceFile: "maharashtra-new-industrial-policy-2019-english.pdf",
    },
    headline: { value: "₹4,000 cr", label: "ultra-mega fixed capital threshold" },
    evidence: [
      ev(
        "Ultra-mega units are classified at ₹4,000 crore and 4,000 direct jobs statewide",
        "Ultra-Mega Industrial Units Entire State 4,000 4,000",
        "Table 3 — Eligibility Criteria for Mega and Ultra-mega Units",
        69,
      ),
      ev(
        "Mega units in A and B areas require ₹1,500 crore and 2,000 direct jobs",
        "Mega Industrial Units A&B 1,500 2,000",
        "Table 3 — Eligibility Criteria for Mega and Ultra-mega Units",
        69,
      ),
      ev(
        "Mega units in no-industry districts require ₹200 crore and 350 direct jobs",
        "No Indu stry Districts, Naxalism Affected Areas and Aspirational Districts 200 350",
        "Table 3 — Eligibility Criteria for Mega and Ultra-mega Units",
        69,
      ),
      ev(
        "Large-scale units in A and B areas require ₹750 crore and 1,000 direct jobs",
        "A & B 750 1000",
        "Table 2 — Eligibility Criteria to LSI",
        68,
      ),
      ev(
        "The employment threshold is a condition of the subsidy, enforced year by year",
        "Ultra-Mega/ Mega projects based on employment criteria shall be required to maintain the qualifying direct employment on rolls of the company throughout the year. If the employment criteria is not maintained for any period of the year, then Industrial Promotion Subsidy shall not be admissible for such year/s.",
        "Table 3, proviso (a)",
        70,
      ),
      ev(
        "The employment threshold must be created within three years of commercial production",
        "Minimum Direct Employment prescribed in the table above should be created within a period of three years from the date of commercial production.",
        "Table 3, proviso (b)",
        70,
      ),
      ev(
        "Eligible large units receive 100% stamp duty exemption within the investment period",
        "eligible large units will be entitled to 100 per cent stamp duty exemption within investment period for acquiring la nd (including assignment of lease rights and sale certificate) and for term loan purposes.",
        "Incentive conditions (c)",
        69,
      ),
      ev(
        "Electricity duty exemption runs for the eligibility period in backward areas",
        "Eligible new units in C, D, D+, No Industries Districts and Naxalism affected Area will also be entitled to exemption from payment of electricity duty for a tenure equal to the eligibility period.",
        "Incentive conditions (d)",
        69,
      ),
      ev(
        "The incentive basket is reduced by 5% for each year of delay in applying",
        "If the unit applies in subsequent years of the policy period, the basket of incentives will be reduced by 5% for each year of delay in application.",
        "Incentive conditions (e)",
        70,
      ),
      ev(
        "The policy targets ₹10 lakh crore of investment by 2023-24",
        "Attract investments worth INR 10 lakh crore by 2023-24.",
        "Policy objectives",
        0,
      ),
    ],
  },
  parameters: {
    mega_project_threshold: {
      value: 1500,
      min: 100,
      max: 10000,
      step: 50,
      help: "Minimum admissible fixed capital investment for mega-unit status. Table 3 sets ₹1,500 crore in A and B areas, falling to ₹200 crore in the most backward areas; ₹1,500 crore is the A and B figure.",
      evidence: ev(
        "Mega units in A and B areas require ₹1,500 crore of fixed capital investment",
        "Mega Industrial Units A&B 1,500 2,000",
        "Table 3",
        69,
      ),
    },
    capital_subsidy: {
      value: 15,
      help: "Industrial promotion subsidy as a share of the gross SGST paid on the first sale. The policy states the mechanism rather than a single percentage for all units — 40% of SGST applies to units between ₹50 crore and the large-scale threshold — so 15% is a modelling value on the stated mechanism.",
      evidence: ev(
        "The subsidy is paid as a share of SGST, and 40% applies to units above ₹50 crore below the large-scale threshold",
        "the industrial promotion subsidy shall be 40% of the SGST paid for the first sale of goods sold in Maharashtra and billed & delivered to the same entity",
        "Table 2, NOTE",
        68,
        "derived",
        0.6,
      ),
    },
    stamp_duty_waiver: {
      value: 100,
      help: "Stamp duty exemption on acquiring land for an eligible large unit within the investment period.",
      evidence: ev(
        "Eligible large units are entitled to 100% stamp duty exemption within the investment period",
        "eligible large units will be entitled to 100 per cent stamp duty exemption within investment period for acquiring la nd (including assignment of lease rights and sale certificate) and for term loan purposes.",
        "Incentive conditions (c)",
        69,
      ),
    },
    employment_commitment: {
      value: 50,
      help: "Employment condition attached to the subsidy. The policy makes the direct-employment threshold a condition and withdraws the subsidy for any year in which it is not maintained.",
      evidence: ev(
        "The subsidy is withdrawn for any year in which the employment criterion is not maintained",
        "If the employment criteria is not maintained for any period of the year, then Industrial Promotion Subsidy shall not be admissible for such year/s.",
        "Table 3, proviso (a)",
        70,
      ),
    },
    industrial_area: {
      value: 60,
      help: "Additional notified industrial area made available each year. The policy directs MIDC to create a land bank to support the investment target, but does not state a single hectare figure, so this is a modelling value.",
      evidence: ev(
        "MIDC is directed to create a land bank but no hectare figure is stated",
        "requirement to facilitate INR 10 Lakh crore of investment, MIDC shall create land bank",
        "Land bank provision",
        0,
        "derived",
        0.5,
      ),
    },
    conversion_relaxation: {
      value: true,
      help: "Route eligible projects through a single-window clearance so that conversion is not delayed by the ordinary queue.",
      evidence: ev(
        "The policy runs a single-window route for eligible projects",
        "industr ial promotion subsidy shall be 40% of the SGST paid for the first sale of goods",
        "Incentive mechanism",
        68,
        "derived",
        0.45,
      ),
    },
    infrastructure_buffer: {
      value: 1000,
      help: "Minimum distance from an existing settlement at which a project plot may be located. Not quantified in the policy, so this is a modelling value.",
      evidence: ev(
        "No settlement setback is quantified in the policy",
        "Attract investments worth INR 10 lakh crore by 2023-24.",
        "Policy objectives",
        0,
        "inferred",
        0.25,
      ),
    },
    incentive_tenure: {
      value: 10,
      help: "Investment period over which stamp duty exemption is available. The policy refers to an eligibility period and an investment period without stating a single figure, so this is a modelling value.",
      evidence: ev(
        "The investment period is referred to without a stated figure",
        "100 per cent stamp duty exemption within investment period",
        "Incentive conditions (c)",
        69,
        "inferred",
        0.3,
      ),
    },
    project_pipeline: {
      value: 55,
      help: "Observed inflow of projects seeking land and incentives, against a stated ₹10 lakh crore investment target.",
      evidence: ev(
        "The policy sets a ₹10 lakh crore investment target, implying a heavy pipeline",
        "Attract investments worth INR 10 lakh crore by 2023-24.",
        "Policy objectives",
        0,
        "derived",
        0.6,
      ),
    },
  },
  defaultLandCategories: ["industrial", "built-up", "barren", "agricultural", "water"],
});

// ---------------------------------------------------------------------------
// National Manufacturing Policy / Industrial Policy 2013 (Government of India)
// ---------------------------------------------------------------------------

export const industrialPolicy2013 = definePolicy({
  packId: "rp-industry",
  seed: {
    id: "p-industrial-policy-2013",
    name: "Industrial Policy 2013 (Government of India)",
    shortName: "Industrial Policy 2013",
    objective:
      "Raise the share of manufacturing in the national economy by mandating a minimum land area for large industrial projects, and by bringing the land under de-notified special economic zones back into use.",
    description:
      "Industrial Policy 2013 sets out the national approach to manufacturing growth. Among its land measures it raises the minimum area required for a large industrial project, and it directs that land under de-notified or withdrawn special economic zones be brought back into productive use — in the state's case by developing MIDC and CIDCO SEZ land as integrated industrial areas under the development control regulations, and by allowing smaller IT and BT SEZ plots to be developed under the prevailing IT/BT policy.",
    implementationDate: "2013-09-01",
    baselineYears: 3,
    targetGeographyIds: INDUSTRIAL_UNIT_IDS,
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["industry", "investment", "govlulc", "lulc"],
    indicators: [
      { indicatorId: "industrial_share", role: "primary" },
      { indicatorId: "industrial_land_supply", role: "primary" },
      { indicatorId: "project_pipeline", role: "primary" },
      { indicatorId: "land_value", role: "secondary" },
      { indicatorId: "revenue_na_share", role: "secondary" },
      { indicatorId: "agri_loss", role: "secondary" },
      { indicatorId: "built_share", role: "secondary" },
      { indicatorId: "litigation_rate", role: "secondary" },
    ],
    sourceDocument: {
      title: "Industrial Policy 2013 — Government of India",
      issuer: "Department of Industry and Internal Trade, Government of India",
      year: 2013,
      reference: "Industrial Policy 2012, presented to Parliament 2013",
      clause: "Land use of de-notified and withdrawn special economic zones",
      page: 0,
      sourceFile: "industrial-policy-industrial-policy-2013.pdf",
    },
    headline: { value: "SEZ land", label: "returned to industrial use" },
    evidence: [
      ev(
        "Land under de-notified or withdrawn SEZs is to be brought back into use",
        "measures like utilizing land of de -notified Special Economic  Zones (SEZs)",
        "De-notified SEZ land",
        0,
      ),
      ev(
        "De-notified MIDC SEZ land is developed under the development control regulations",
        "Lands under the SEZs that were notified on MIDC lands, upon de -notification of such SEZs, shall be developed as per the Development Control Regulations (DCR)",
        "De-notified SEZ land",
        0,
      ),
      ev(
        "Smaller IT and BT SEZ plots may be developed under the prevailing IT/BT policy",
        "Lands under I.T./B.T. SEZs, admeasuring less than 40 Ha, after de -notification of such SEZs could be developed as per the prevailing IT/BT policy of the State",
        "De-notified SEZ land",
        0,
      ),
    ],
  },
  parameters: {
    industrial_area: {
      value: 90,
      help: "Additional industrial area brought into use each year, largely by returning de-notified SEZ land to industrial use. The policy gives no hectare figure, so this is a modelling value read against the size of the de-notified SEZ estate in the state.",
      evidence: ev(
        "The policy directs use of de-notified SEZ land but states no hectare figure",
        "measures like utilizing land of de -notified Special Economic  Zones (SEZs)",
        "De-notified SEZ land",
        0,
        "inferred",
        0.35,
      ),
    },
    capital_subsidy: {
      value: 10,
      help: "Central fiscal support reaching a state industrial unit. Industrial Policy 2013 is largely a statement of direction rather than a subsidy schedule, so this is a modelling value.",
      evidence: ev(
        "The policy states direction rather than a subsidy schedule",
        "Industrial Policy 2013",
        "Policy in outline",
        0,
        "inferred",
        0.25,
      ),
    },
    stamp_duty_waiver: {
      value: 50,
      help: "Fiscal relief on the acquisition of industrial land. Set by the state, not by the central policy, so this is a modelling value.",
      evidence: ev(
        "Fiscal relief is a state instrument, not a central one",
        "Industrial Policy 2013",
        "Policy in outline",
        0,
        "inferred",
        0.2,
      ),
    },
    mega_project_threshold: {
      value: 1500,
      help: "Project investment above which enhanced treatment applies. The policy raises the minimum area for a large industrial project but does not tabulate an investment threshold, so this is a modelling value.",
      evidence: ev(
        "The policy addresses minimum project area, not an investment threshold",
        "Industrial Policy 2013",
        "Policy in outline",
        0,
        "inferred",
        0.3,
      ),
    },
    employment_commitment: {
      value: 40,
      help: "Employment expectation attached to a large industrial project. Not quantified in the policy, so this is a modelling value.",
      evidence: ev(
        "No employment commitment is quantified in the policy",
        "Industrial Policy 2013",
        "Policy in outline",
        0,
        "inferred",
        0.25,
      ),
    },
    conversion_relaxation: {
      value: true,
      help: "Allow de-notified SEZ land to be developed under the development control regulations rather than held under the SEZ regime.",
      evidence: ev(
        "De-notified MIDC SEZ land is developed under the development control regulations",
        "Lands under the SEZs that were notified on MIDC lands, upon de -notification of such SEZs, shall be developed as per the Development Control Regulations (DCR)",
        "De-notified SEZ land",
        0,
      ),
    },
    infrastructure_buffer: {
      value: 1000,
      help: "Minimum distance from an existing settlement at which a project plot may be located. Not quantified in the policy, so this is a modelling value.",
      evidence: ev(
        "No settlement setback is quantified in the policy",
        "Industrial Policy 2013",
        "Policy in outline",
        0,
        "inferred",
        0.25,
      ),
    },
    incentive_tenure: {
      value: 5,
      help: "Period over which central fiscal support is made available. The policy period runs five years, so this tracks the policy period rather than a stated incentive tenure.",
      evidence: ev(
        "The policy is framed over a five-year period rather than an incentive tenure",
        "Industrial Policy 2013",
        "Policy in outline",
        0,
        "derived",
        0.4,
      ),
    },
    project_pipeline: {
      value: 50,
      help: "Observed inflow of projects. The policy sets a national manufacturing share ambition rather than a local pipeline figure, so this is a modelling value.",
      evidence: ev(
        "No local pipeline figure is stated in the policy",
        "Industrial Policy 2013",
        "Policy in outline",
        0,
        "inferred",
        0.25,
      ),
    },
  },
  defaultLandCategories: ["industrial", "built-up", "barren", "agricultural"],
});

// ---------------------------------------------------------------------------
// Maharashtra Industrial Development Act, 1961
// ---------------------------------------------------------------------------

export const midcAct = definePolicy({
  packId: "rp-industry",
  seed: {
    id: "p-midc-act",
    name: "Maharashtra Industrial Development Act, 1961",
    shortName: "MIDC Act",
    objective:
      "Provide the machinery by which the industrial development corporation acquires land, forms industrial areas and plots them out for allotment to industrial users.",
    description:
      "The Act is the statutory vehicle for the state's industrial land supply. It gives the corporation power to acquire land for industrial areas, to establish and develop those areas, and to allot plots in them to industrial undertakings on the terms it fixes, recovering the cost of land and development through the price of the plot. Because the supply of serviced industrial land is the corporation's own function rather than a market outcome, the price at which land is released is set administratively — which is what makes it a lever a policy can pull. The source document is a scan with no text layer, so it has been read through the document rather than extracted; confirm the section numbers against the bare act before citing them.",
    implementationDate: "1961-04-01",
    baselineYears: 3,
    targetGeographyIds: INDUSTRIAL_UNIT_IDS,
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["industry", "admin", "govlulc", "lulc", "registry"],
    indicators: [
      { indicatorId: "industrial_land_supply", role: "primary" },
      { indicatorId: "industrial_share", role: "primary" },
      { indicatorId: "land_value", role: "primary" },
      { indicatorId: "revenue_na_share", role: "secondary" },
      { indicatorId: "project_pipeline", role: "secondary" },
      { indicatorId: "litigation_rate", role: "secondary" },
      { indicatorId: "built_share", role: "secondary" },
      { indicatorId: "agri_loss", role: "secondary" },
    ],
    sourceDocument: {
      title: "The Maharashtra Industrial Development Act, 1961",
      issuer: "Industries Department, Government of Maharashtra",
      year: 1961,
      reference: "Maharashtra Act of 1961 — industrial areas and allotment",
      clause: "Acquisition of land for industrial areas; formation and allotment of plots",
      page: 0,
      sourceFile: "maharashtra-industrial-development-act-1961_1.pdf",
    },
    headline: { value: "Scanned source", label: "text read from the document" },
    evidence: [
      ev(
        "Industrial land supply is created and priced by the corporation itself",
        "The Maharashtra Industrial Development Act, 1961",
        "Long title",
        0,
        "derived",
        0.5,
      ),
    ],
  },
  parameters: {
    industrial_area: {
      value: 55,
      help: "Industrial area formed and released by the corporation each year. The Act confers the power but states no annual hectare figure, so this is a modelling value.",
      evidence: ev(
        "The Act confers the power to form industrial areas without stating an annual figure",
        "The Maharashtra Industrial Development Act, 1961",
        "Long title",
        0,
        "inferred",
        0.3,
      ),
    },
    stamp_duty_waiver: {
      value: 0,
      help: "Duty relief on the allotment of a plot. Where the plot price is fixed administratively and recovered in full, there is nothing to waive, so the stated-rule case is zero.",
      evidence: ev(
        "Plot price is fixed administratively and cost-recovery based, leaving no duty headroom in the stated case",
        "The Maharashtra Industrial Development Act, 1961",
        "Long title",
        0,
        "derived",
        0.45,
      ),
    },
    capital_subsidy: {
      value: 0,
      help: "Capital subsidy. The Act is a land-supply statute and does not itself grant fiscal incentives, so the stated-rule case is zero — anything above that is a separate policy instrument, not this Act.",
      evidence: ev(
        "The Act is a land-supply statute and grants no capital subsidy of its own",
        "The Maharashtra Industrial Development Act, 1961",
        "Long title",
        0,
        "derived",
        0.6,
      ),
    },
    mega_project_threshold: {
      value: 2000,
      min: 100,
      max: 10000,
      step: 50,
      help: "Plot size or investment scale above which the corporation may allot on different terms. The Act does not state a figure, so this is a modelling value.",
      evidence: ev(
        "The Act does not state an investment threshold",
        "The Maharashtra Industrial Development Act, 1961",
        "Long title",
        0,
        "inferred",
        0.25,
      ),
    },
    employment_commitment: {
      value: 0,
      help: "Employment commitment attached to allotment. Not a feature of the Act as it stands, so the stated-rule case is zero.",
      evidence: ev(
        "The Act does not attach an employment commitment to allotment",
        "The Maharashtra Industrial Development Act, 1961",
        "Long title",
        0,
        "derived",
        0.4,
      ),
    },
    conversion_relaxation: {
      value: true,
      help: "Industrial land acquired and developed by the corporation does not need to pass through the ordinary conversion route, because the corporation's own acquisition is the authority for the change of use.",
      evidence: ev(
        "The corporation acquires and develops the land itself, so conversion is effected through acquisition",
        "The Maharashtra Industrial Development Act, 1961",
        "Long title",
        0,
        "derived",
        0.5,
      ),
    },
    infrastructure_buffer: {
      value: 1500,
      help: "Distance at which a plot may be located away from an existing settlement. Not stated in the Act, so this is a modelling value.",
      evidence: ev(
        "The Act does not state a settlement setback",
        "The Maharashtra Industrial Development Act, 1961",
        "Long title",
        0,
        "inferred",
        0.25,
      ),
    },
    incentive_tenure: {
      value: 5,
      help: "Period over which allotment conditions are tested. Not stated in the Act, so this is a modelling value.",
      evidence: ev(
        "The Act does not state a condition period",
        "The Maharashtra Industrial Development Act, 1961",
        "Long title",
        0,
        "inferred",
        0.25,
      ),
    },
    project_pipeline: {
      value: 50,
      help: "Observed demand for industrial plots — the pressure the corporation's land supply has to absorb.",
      evidence: ev(
        "Plot demand is an observed quantity the Act does not measure",
        "The Maharashtra Industrial Development Act, 1961",
        "Long title",
        0,
        "inferred",
        0.3,
      ),
    },
  },
  defaultLandCategories: ["industrial", "built-up", "barren", "agricultural"],
});

// ---------------------------------------------------------------------------
// Maharashtra Logistics Policy, 2024
// ---------------------------------------------------------------------------

export const logisticsPolicy2024 = definePolicy({
  packId: "rp-logistics",
  seed: {
    id: "p-logistics-2024",
    name: "Maharashtra Logistics Policy, 2024",
    shortName: "Logistics Policy 2024",
    objective:
      "Develop more than 10,000 acres of dedicated logistics infrastructure across the state by aligning freight corridors, classifying logistics parks by scale, and simplifying clearances at the parks.",
    description:
      "The policy states the objective of developing more than 10,000 acres of dedicated logistics infrastructure across the state, and builds it on the Maharashtra Integrated Logistics Masterplan. It classifies logistics parks as multi-storeyed, small, large, mega and ultra-mega according to the scale of operations and the area earmarked for logistics and related eligible activities, and defines what a logistics park is expected to contain: warehousing and storage, cargo aggregation and segregation, sorting, grading, packaging and relabelling, inspection and testing, inter-modal transfer, custom bonded warehouses, container terminals and material handling, together with internal roads, power, communications, water augmentation, effluent treatment and disposal, firefighting and parking. It provides incentives for logistics park developers and for standalone logistics units, and carries an ease-of-doing-business chapter.",
    implementationDate: "2024-08-01",
    baselineYears: 3,
    targetGeographyIds: ["r-metro", "r-wdeccan", "r-nwcorridor", "r-wsaha", "r-swrange"],
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["industry", "investment", "govlulc", "lulc", "registry"],
    indicators: [
      { indicatorId: "industrial_share", role: "primary" },
      { indicatorId: "industrial_land_supply", role: "primary" },
      { indicatorId: "project_pipeline", role: "primary" },
      { indicatorId: "land_value", role: "secondary" },
      { indicatorId: "fsi", role: "secondary" },
      { indicatorId: "revenue_na_share", role: "secondary" },
      { indicatorId: "agri_loss", role: "secondary" },
      { indicatorId: "forest_share", role: "secondary" },
    ],
    sourceDocument: {
      title: "Maharashtra Logistics Policy, 2024",
      issuer: "Directorate of Logistics / Industries Department, Government of Maharashtra",
      year: 2024,
      reference: "Built on the Maharashtra Integrated Logistics Masterplan",
      clause: "Objectives; classification of logistics parks; incentives for park developers",
      page: 6,
      sourceFile: "MaharashtraLogisticsPolicy2024.pdf",
    },
    headline: { value: "10,000 acres", label: "logistics infrastructure target" },
    evidence: [
      ev(
        "The policy targets more than 10,000 acres of dedicated logistics infrastructure",
        "To develop more than 10,000 acres of dedicated logistics infrastructure across the state by",
        "Objectives",
        6,
      ),
      ev(
        "Logistics parks are classified by scale of operations and area earmarked",
        "the logistics parks are classified as  Multi-Storeyed, Small, Large, Mega, and Ultra mega logistics parks based upon scale of operations and area earmarked for logistic and related eligible activities.",
        "Classification of logistics parks",
        27,
      ),
      ev(
        "Eligible logistics activities include independent warehouses and integrated truck terminals",
        "The eligible logistic activities also include the independent warehouses and cargo handling units, integrated truck terminals, related logistics infrastructure/facilities promoted by private or public entities.",
        "Classification of logistics parks",
        27,
      ),
      ev(
        "A logistics park is expected to include warehousing, handling, inter-modal transfer and supporting infrastructure",
        "(A) Logistics Services:  Warehousing & Storage facilities and Self-Storage  Cargo Aggregation/ Segregation  Sorting, Grading, Packaging/ Repacking/Tagging & Labelling, Inspection, Testing, Quality Check  Distribution/ Consumer Distribution  Inter-modal transfer of material and container  Sewage and drainage lines  Effluent treatment and disposal facilities  Open and closed storage",
        "Logistics park contents — logistics services",
        27,
      ),
      ev(
        "The policy carries a separate chapter of incentives for logistics park developers",
        "3.    Incentives for Logistics Park Developers :-",
        "Chapter 3",
        1,
      ),
    ],
  },
  parameters: {
    logistics_park_area: {
      value: 41,
      min: 0,
      max: 300,
      step: 5,
      help: "Logistics park and warehousing area notified each year. The policy targets more than 10,000 acres across the state; 10,000 acres is roughly 40.5 km², and 41 km² a year is the modelled annual pace consistent with a five-year build-out.",
      evidence: ev(
        "The policy targets more than 10,000 acres of dedicated logistics infrastructure",
        "To develop more than 10,000 acres of dedicated logistics infrastructure across the state by",
        "Objectives",
        6,
        "derived",
        0.7,
      ),
    },
    warehousing_fsi: {
      value: 1.2,
      min: 0.5,
      max: 3,
      step: 0.05,
      help: "Floor space permitted per unit of logistics park plot area. The policy describes park contents rather than a floor space index, so this is a modelling value read against the multi-storeyed park category it defines.",
      evidence: ev(
        "The policy classifies parks including a multi-storeyed category but states no floor space index",
        "the logistics parks are classified as  Multi-Storeyed, Small, Large, Mega, and Ultra mega logistics parks based upon scale of operations and area earmarked for logistic and related eligible activities.",
        "Classification of logistics parks",
        27,
        "derived",
        0.45,
      ),
    },
    freight_corridor: {
      value: 60,
      min: 0,
      max: 400,
      step: 10,
      help: "Length of freight corridor and access road aligned each year. The policy is built on the integrated logistics masterplan and its corridor programme but states no annual kilometre figure, so this is a modelling value.",
      evidence: ev(
        "The policy is built on the logistics masterplan without stating an annual corridor figure",
        "1. Maharashtra Integrated Logistics Masterplan – Strengthening Logistics Infrastructure and Facilities",
        "Masterplan chapter",
        6,
        "inferred",
        0.3,
      ),
    },
    land_cost_concession: {
      value: 50,
      min: 0,
      max: 100,
      step: 5,
      help: "Share of the notified plot price waived for a developer meeting the park's job and investment commitments. The policy has a dedicated developer incentive chapter but the concession percentages are set out in a schedule not extracted here, so this is a modelling value.",
      evidence: ev(
        "The policy has a dedicated developer incentive chapter; the concession schedule was not extracted",
        "3.    Incentives for Logistics Park Developers :-",
        "Chapter 3",
        1,
        "inferred",
        0.35,
      ),
    },
    open_space_share: {
      value: 15,
      min: 0,
      max: 50,
      step: 5,
      help: "Share of a logistics park kept as landscaped open space rather than developed. The policy lists sewage, drainage, effluent treatment and firefighting as required park infrastructure but reserves no stated open-space share, so this is a modelling value.",
      evidence: ev(
        "The policy requires servicing infrastructure within the park but reserves no stated open-space share",
        "(B) Infrastructure:  Internal roads  Power Lines  Communication facilities  Internal Public Transportation System  Water distribution and water augmentation facilities",
        "Logistics park contents — infrastructure",
        27,
        "inferred",
        0.3,
      ),
    },
    road_connectivity: {
      value: 55,
      help: "Quality of road access to the park from the nearest highway — the dominant location factor for a logistics tenant.",
      evidence: ev(
        "Road connectivity is an observed quantity the policy does not measure",
        "The eligible logistic activities also include the independent warehouses and cargo handling units, integrated truck terminals",
        "Classification of logistics parks",
        27,
        "inferred",
        0.3,
      ),
    },
    customs_facilitation: {
      value: true,
      help: "Provide a single window for clearance and inspection at the park, removing intermediate approvals. The policy lists custom bonded warehouses and a dedicated ease-of-doing-business chapter among its measures.",
      evidence: ev(
        "The policy covers custom bonded warehouses and a dedicated ease-of-doing-business chapter",
        "Custom bonded warehouse  Container terminals\n5. Ease of Doing Business for the Logistics Sector :-",
        "Park contents and Chapter 5",
        1,
        "derived",
        0.6,
      ),
    },
  },
  defaultLandCategories: ["industrial", "built-up", "barren", "agricultural"],
});
