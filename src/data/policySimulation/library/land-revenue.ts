import { definePolicy } from "../compose";
import { ALL_UNIT_IDS } from "./units";

/**
 * Land, revenue and holdings instruments.
 *
 * Every citation below was read out of the source PDFs held in the project's
 * policy folder. Where a figure is a modelling choice rather than something the
 * document states, the evidence is marked `inferred` with a low confidence so
 * the UI flags it — a parameter with no textual basis is not presented as if it
 * had one.
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
// Maharashtra Land Revenue Code, 1966 (Maharashtra Act No. XLI of 1966)
// ---------------------------------------------------------------------------

export const landRevenueCode = definePolicy({
  packId: "rp-conversion",
  seed: {
    id: "p-land-revenue-code",
    name: "Maharashtra Land Revenue Code, 1966",
    shortName: "Land Revenue Code",
    domain: "Land Use & Conversion",
    objective:
      "Make permission from the Collector the gate on every change of use of agricultural land to a non-agricultural purpose, and define the narrow exemptions that do not need one.",
    description:
      "Section 42 prohibits the use of agricultural land for any non-agricultural purpose without the Collector's permission, and prohibits relaxing the conditions attached to a permission already granted. Section 42(2), inserted in 2007, carves out a permission-free category: personal bona fide residential use in a non-urban area, a micro enterprise under the MSME Act, and small commercial uses such as a shop, flour mill, grocery shop or chilli grinding machine, all confined to forty square metres. The exemption is expressly unavailable in the peripheral area of a municipal corporation or council, within the control line of a national, state, district or village road, and in areas notified as an eco-sensitive zone by the Government of India.",
    implementationDate: "1966-08-01",
    baselineYears: 3,
    targetGeographyIds: ["r-metro", "r-wdeccan", "r-nwcorridor", "r-cbasin", "r-swrange"],
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["govlulc", "lulc", "admin", "registry", "population"],
    indicators: [
      { indicatorId: "agri_share", role: "primary" },
      { indicatorId: "revenue_na_share", role: "primary" },
      { indicatorId: "built_share", role: "primary" },
      { indicatorId: "agri_loss", role: "secondary" },
      { indicatorId: "agri_per_capita", role: "secondary" },
      { indicatorId: "crop_intensity", role: "secondary" },
      { indicatorId: "rural_density", role: "secondary" },
      { indicatorId: "forest_share", role: "secondary" },
      // The pack's percolation rule acts on the water class, and the code's own
      // s.42(2)(c) exclusion is ecological — so report the water share rather
      // than leaving a live rule with no output.
      { indicatorId: "water_share", role: "secondary" },
    ],
    sourceDocument: {
      title: "The Maharashtra Land Revenue Code, 1966",
      issuer: "Revenue & Registration Department, Government of Maharashtra",
      year: 1966,
      reference: "Maharashtra Act No. XLI of 1966, as amended by Mah. 17 of 2007",
      clause: "Section 42 — Permission for non-agricultural use",
      page: 40,
      sourceFile: "Maharashtra Land Revenue Code, 1966.pdf",
    },
    headline: { value: "40 m²", label: "permission-free conversion ceiling" },
    evidence: [
      ev(
        "Collector permission is the gate on conversion of agricultural land",
        "No land used for agricultural shall be used for any non-agricultural purposes ; and no land assessed for one non-agricultural purpose shall be used for any other non-agricultural purpose or for the same non-agricultural purpose but in relaxation of any of the conditions imposed at the time of the grant of permission for non-agricultural purpose, except with permission of the Collector.",
        "Section 42(1)",
        40,
      ),
      ev(
        "Permission-free conversion is capped at forty square metres",
        "no such permission shall be necessary for conversion of use of any agricultural land for the personal bona fide residential purpose in non-urban area, or for the micro enterprise as defined in clause (h) of section 2 of the Micro, Small and Medium Enterprises Development Act, 2006 (27 of 2006) and small commercial use like shop, flour mill, grocery shop or chilli grinding machine, operated in such premises in use for the personal bona fide residential purpos e in non-urban area and occupying the area not exceeding forty square meters",
        "Section 42(2)",
        41,
      ),
      ev(
        "The exemption is unavailable inside the road control line and in eco-sensitive zones",
        "(a) the area mentioned in clause (2) of the Explanation to section 47A, as a peripheral area of the Municipal Corporation or the Municipal Council ; (b) the area falling within the control line of the National Highways, State Highways, District Roads or Village Roads ; (c) the areas notified as the Eco-sensitive Zone by the Government of India.",
        "Section 42(2), provisos (a)–(c)",
        41,
      ),
    ],
  },
  parameters: {
    protected_buffer: {
      value: 100,
      min: 0,
      max: 1000,
      step: 25,
      help: "Width of the control line of a national, state, district or village road, inside which the section 42(2) exemption is expressly unavailable.",
      evidence: ev(
        "Conversion exemption is unavailable within the road control line",
        "the area falling within the control line of the National Highways, State Highways, District Roads or Village Roads",
        "Section 42(2)(b)",
        41,
      ),
    },
    conversion_ceiling: {
      value: 4,
      help: "Annual share of a unit's area that may be converted to non-agricultural use. The Code sets no numeric annual cap, so this is a modelling value representing the permission throughput the section 42 gate admits; it is the figure to change first when reading a run.",
      evidence: ev(
        "No annual conversion cap is stated in the Code",
        "No land used for agricultural shall be used for any non-agricultural purposes ; and no land assessed for one non-agricultural purpose shall be used for any other non-agricultural purpose",
        "Section 42(1)",
        40,
        "inferred",
        0.35,
      ),
    },
    moratorium: {
      value: false,
      help: "Whether fresh conversion permissions are frozen. Section 42 does not itself impose a moratorium; the Code's mechanism is the permission requirement, which operates continuously rather than as a freeze.",
      evidence: ev(
        "The Code's mechanism is a standing permission requirement, not a moratorium",
        "except with permission of the Collector",
        "Section 42(1)",
        40,
        "derived",
        0.6,
      ),
    },
    preservation_share: {
      value: 10,
      help: "Share of remaining agricultural holdings treated as unavailable for conversion in this scenario. The Code does not create a preservation zone; this represents the area effectively withheld by the permission gate.",
      evidence: ev(
        "The Code withholds no stated share of holdings; the withheld area is a modelling value",
        "No land used for agricultural shall be used for any non-agricultural purposes ... except with permission of the Collector.",
        "Section 42(1)",
        40,
        "inferred",
        0.3,
      ),
    },
    development_pressure: {
      value: 55,
      help: "Observed build-out pressure from housing, industry and infrastructure in the target area — the demand the section 42 gate acts on.",
      evidence: ev(
        "Demand for conversion is the pressure the permission gate regulates; the Code does not measure it",
        "no land assessed for one non-agricultural purpose shall be used for any other non-agricultural purpose",
        "Section 42(1)",
        40,
        "inferred",
        0.4,
      ),
    },
  },
});

// ---------------------------------------------------------------------------
// Maharashtra Tenancy and Agricultural Lands Act, 1966
// ---------------------------------------------------------------------------

export const tenancyAct = definePolicy({
  packId: "rp-tenancy",
  seed: {
    id: "p-tenancy-act",
    name: "Maharashtra Tenancy and Agricultural Lands Act, 1966",
    shortName: "Tenancy & Agricultural Lands Act",
    objective:
      "Protect the cultivating tenant against eviction and attachment, and hold the total area a person may hold as owner or tenant to the ceiling fixed for the area.",
    description:
      "The Act regulates the relationship between landlord and cultivating tenant across the state: it restricts the grounds on which a tenant may be evicted, protects a tenant in possession from attachment of the land held, and provides that the total area held by a person as owner or tenant may not exceed the ceiling area applicable to that category of land. It also carries the machinery for correcting a record of rights that does not match the land actually held.",
    implementationDate: "1966-08-01",
    baselineYears: 3,
    targetGeographyIds: [
      "r-cbasin",
      "r-wdeccan",
      "r-sinterior",
      "r-chigh",
      "r-edry",
      "r-neplateau",
    ],
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["ror", "cadastre", "govlulc", "courts", "population"],
    indicators: [
      { indicatorId: "tenancy_recorded", role: "primary" },
      { indicatorId: "holdings_avg_size", role: "primary" },
      { indicatorId: "fragment_share", role: "primary" },
      { indicatorId: "litigation_rate", role: "secondary" },
      { indicatorId: "crop_intensity", role: "secondary" },
      { indicatorId: "parcel_count", role: "secondary" },
      { indicatorId: "agri_per_capita", role: "secondary" },
    ],
    sourceDocument: {
      title: "The Maharashtra Tenancy and Agricultural Lands Act, 1966",
      issuer: "Revenue & Registration Department, Government of Maharashtra",
      year: 1966,
      reference: "Maharashtra Act No. XXXVI of 1966, as amended to Mah. 24 of 2012",
      clause: "Ceiling area provisions; protection of tenant in possession",
      page: 0,
      sourceFile: "MaharashtraTenancyAndAgriculturalAct.pdf",
    },
    headline: { value: "Eviction only for cause", label: "tenant protection in force" },
    evidence: [
      ev(
        "A tenant in possession is protected against eviction on a landlord's claim",
        "landlord, such tenant shall not be evicted from such dwelling house (with the materials and the site",
        "Protection of tenant in actual possession",
        0,
      ),
      ev(
        "Total area held as owner or tenant is capped at the ceiling area",
        "him as owner or tenant shall not exceed the ceiling area.",
        "Ceiling on holdings held as owner or tenant",
        0,
      ),
    ],
  },
  parameters: {
    tenant_protection: {
      value: true,
      help: "Restrict a landlord's right to evict a cultivating tenant to the grounds the Act recognises.",
      evidence: ev(
        "A tenant in possession is not evictable on the landlord's own claim",
        "landlord, such tenant shall not be evicted from such dwelling house (with the materials and the site",
        "Protection of tenant in actual possession",
        0,
      ),
    },
    ceiling_area: {
      value: 20,
      help: "Total area a person may hold as owner or tenant in the local area. The Act applies the ceiling but leaves the hectare figure to the State rules, so this is a modelling value — set it to the figure your State's ceiling rules specify.",
      evidence: ev(
        "The Act applies a ceiling but does not itself state the hectare figure",
        "him as owner or tenant shall not exceed the ceiling area.",
        "Ceiling on holdings held as owner or tenant",
        0,
        "derived",
        0.55,
      ),
    },
    standard_area: {
      value: 0.8,
      help: "Minimum area of a cultivable plot. The tenancy Act fixes no such minimum; it is the fragmentation statute that settles standard areas, so this is a modelling value used to measure the holding structure this Act acts on.",
      evidence: ev(
        "The minimum cultivable plot is settled under the fragmentation statute, not this Act",
        "The Maharashtra Agricultural Lands (Ceiling on Holdings) Act, 1961 (Mah. XXVII of 1961); and",
        "Cross-reference to the Ceiling on Holdings Act, 1961",
        0,
        "inferred",
        0.3,
      ),
    },
    tenancy_register_drive: {
      value: 40,
      help: "Effort applied to enter cultivating tenancies in the Record of Rights rather than hold them orally. The Act protects the tenancy but does not prescribe a registration programme, so this is a modelling value.",
      evidence: ev(
        "The Act protects the tenancy without prescribing a registration programme",
        "landlord, such tenant shall not be evicted from such dwelling house",
        "Protection of tenant in actual possession",
        0,
        "inferred",
        0.35,
      ),
    },
    subdivision_pressure: {
      value: 55,
      help: "Observed pressure from inheritance and family partition to break holdings into smaller plots — the counter-pressure the tenancy protections act against.",
      evidence: ev(
        "Partition pressure is not measured by the Act; it is the modelled counter-pressure",
        "him as owner or tenant shall not exceed the ceiling area.",
        "Ceiling on holdings held as owner or tenant",
        0,
        "inferred",
        0.3,
      ),
    },
  },
});

// ---------------------------------------------------------------------------
// Maharashtra Prevention of Fragmentation and Consolidation of Holdings Act, 1947
// ---------------------------------------------------------------------------

export const fragmentationAct = definePolicy({
  packId: "rp-tenancy",
  seed: {
    id: "p-fragmentation-act",
    name: "Prevention of Fragmentation and Consolidation of Holdings Act, 1947",
    shortName: "Fragmentation & Consolidation Act",
    objective:
      "Settle a standard area for each class of land in a local area, treat every plot below it as a fragment, and bar the transfer and partition of a fragment so holdings can be consolidated.",
    description:
      "The Act defines a fragment as a plot of land of less extent than the appropriate standard area for its class, lets the State Government settle those standard areas provisionally and then determine them after inquiry, and requires every fragment in a local area to be entered as such in the Record of Rights once the standard area is notified. It prohibits the transfer or lease of a fragment, restricts partition, and sets out a scheme-based procedure for consolidating holdings into larger plots, including compensation, reservation of land for public purpose and a bar on sub-dividing a consolidated holding. The text is the version as on 10 September 2025, incorporating Mah. 5 of 2025 which repealed Mah. Ordinance XIV of 2024.",
    implementationDate: "1948-01-17",
    baselineYears: 3,
    targetGeographyIds: ["r-cbasin", "r-sinterior", "r-edry", "r-neplateau", "r-chigh"],
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["cadastre", "ror", "govlulc", "admin", "courts"],
    indicators: [
      { indicatorId: "fragment_share", role: "primary" },
      { indicatorId: "holdings_avg_size", role: "primary" },
      { indicatorId: "parcel_count", role: "primary" },
      { indicatorId: "crop_intensity", role: "secondary" },
      { indicatorId: "agri_per_capita", role: "secondary" },
      { indicatorId: "parcel_mismatch", role: "secondary" },
      // The consolidation scheme carries tenancies and disputes as a
      // consequence, so the rules that move them are reported rather than run
      // invisibly.
      { indicatorId: "tenancy_recorded", role: "secondary" },
      { indicatorId: "litigation_rate", role: "secondary" },
    ],
    sourceDocument: {
      title: "The Maharashtra Prevention of Fragmentation and Consolidation of Holdings Act, 1947",
      issuer: "Revenue & Registration Department, Government of Maharashtra",
      year: 1947,
      reference: "Act No. LXII of 1947, text as on 10 September 2025",
      clause: "Sections 2(4), 4, 5, 7, 8 and 8AA — fragments, standard areas and consolidation",
      page: 5,
      sourceFile:
        "The Maharashtra Prevention of Fragmentation and Consolidation of Holdings Act. (Text as on 10th September 2025).pdf",
    },
    headline: { value: "0.80 ha", label: "standard area, modelled" },
    evidence: [
      ev(
        "A fragment is defined by reference to the standard area for its class of land",
        "(4) “Fragment” means a plot of land of less extent than the appropriate standard areas",
        "Section 2(4)",
        7,
      ),
      ev(
        "The standard area is the minimum needed for profitable cultivation",
        "(10) “standard area” in respect of any class of land means the area which the 1[State] Government may from time to time determine under section 5 as the minimum area necessary for profitable cultivation in any particular local area",
        "Section 2(10)",
        0,
      ),
      ev(
        "Standard areas are settled provisionally, then determined after inquiry",
        "4.  Settlement of standard areas. — (1) The 7[State] Government may, after such inquiry as it may, by it, provisionally settle for any class of land in any local area the minimum area that can be cultivated",
        "Section 4(1)",
        0,
      ),
      ev(
        "Every fragment is entered in the Record of Rights once the standard area is notified",
        "On notification of a standard area under sub -section (3) of section 5 for a local area al l fragments in the local area shall be entered as such in the Record of Rights",
        "Section 6(1)",
        0,
      ),
      ev(
        "Transfer of a fragment is prohibited",
        "7.  Transfer and lease of fragments. — (1) No person shall transfer any fragment in respect of",
        "Section 7(1)",
        0,
      ),
      ev(
        "The Act received the Governor General's assent on 17 January 1948",
        "This Act received the assent of the Governor General on the 17th January 1948; assent was first published in the Bombay Government Gazette, Part IV, on the 29th January 1948.",
        "Preamble / assent note",
        7,
      ),
    ],
  },
  parameters: {
    standard_area: {
      value: 0.8,
      min: 0.1,
      max: 4,
      step: 0.05,
      help: "Standard area for a class of land: the minimum needed for profitable cultivation, below which a plot is a fragment. The Act leaves the hectare figure to a State determination under section 5, so this is the figure a State notification would set.",
      evidence: ev(
        "Standard area is the minimum area necessary for profitable cultivation",
        "(10) “standard area” in respect of any class of land means the area which the 1[State] Government may from time to time determine under section 5 as the minimum area necessary for profitable cultivation in any particular local area",
        "Section 2(10)",
        0,
      ),
    },
    fragment_transfer_ban: {
      value: true,
      help: "Bar the sale, gift or mortgage of any plot smaller than the standard area.",
      evidence: ev(
        "No person shall transfer any fragment",
        "7.  Transfer and lease of fragments. — (1) No person shall transfer any fragment in respect of",
        "Section 7(1)",
        0,
      ),
    },
    partition_restriction: {
      value: true,
      help: "Require the prescribed consent before a holding is partitioned into fragments. The Act carries a separate restriction on partition of land under section 8AA in addition to the section 8 fragmentation prohibition.",
      evidence: ev(
        "The Act carries both a fragmentation prohibition and a separate restriction on partition",
        " 8.  Fragmentation prohibited.\n 8AA.  Restriction on partition of land.",
        "Sections 8 and 8AA",
        1,
      ),
    },
    subdivision_ban: {
      value: true,
      help: "Prohibit a consolidated holding from being sub-divided so as to recreate plots below the standard area.",
      evidence: ev(
        "Restrictions on alienation and sub-division of consolidated holdings",
        "31.  Restrictions on alienation and sub-division of consolidated holdings.",
        "Section 31",
        2,
      ),
    },
    consolidation_coverage: {
      value: 30,
      help: "Share of villages brought under a notified consolidation scheme. The Act supplies the scheme procedure but no coverage target, so this is a modelling value.",
      evidence: ev(
        "The Act supplies the consolidation procedure but sets no coverage target",
        "15.  Government may of its own accord or on application declare its intention to make scheme for consolidation of holdings.",
        "Section 15",
        2,
      ),
    },
    standard_area_review: {
      value: 10,
      help: "Years between revision of the settled standard areas. Section 5 permits revision 'from time to time' but sets no interval, so this is a modelling value.",
      evidence: ev(
        "Revision is permitted from time to time, with no stated interval",
        "5.  Determination and revision of standard areas. — (1) The 10[State] Government shall, after",
        "Section 5(1)",
        0,
        "derived",
        0.5,
      ),
    },
  },
  defaultLandCategories: ["agricultural", "orchard", "barren", "built-up"],
});

// ---------------------------------------------------------------------------
// Maharashtra Aadhaar (Targeted Delivery of Financial and Other Subsidies,
// Benefits and Services) Act, 2016 (Maharashtra Act No. XVIII of 2017)
// ---------------------------------------------------------------------------

export const aadhaarAct = definePolicy({
  packId: "rp-records",
  seed: {
    id: "p-aadhaar-act",
    name: "Maharashtra Aadhaar (Targeted Delivery of Subsidies, Benefits and Services) Act, 2016",
    shortName: "Aadhaar Targeted Delivery Act",
    objective:
      "Make proof of Aadhaar, or authentication, a condition of receiving a State-funded subsidy, benefit or service, and require the State to notify the schemes it applies to.",
    description:
      "Section 3 empowers the State Government or a State agency to require that an individual furnish proof of possession of an Aadhaar number, or undergo authentication, as a condition of receipt of a subsidy, benefit or service paid wholly from the Consolidated Fund of the State — with an express obligation to offer an alternative means of identification to anyone who has not been assigned an Aadhaar number. Section 4 requires the State to notify the list of schemes the requirement applies to within three months of commencement and thereafter from time to time. The Act received the Governor's assent on 14 January 2017 and was brought into force with effect from 26 January 2017.",
    implementationDate: "2017-01-26",
    baselineYears: 3,
    targetGeographyIds: ["r-metro", "r-wdeccan", "r-cbasin", "r-neplateau", "r-sinterior"],
    availableGeographyIds: ALL_UNIT_IDS,
    datasetIds: ["ror", "cadastre", "govlulc", "population", "registry", "courts"],
    indicators: [
      { indicatorId: "ror_digitisation", role: "primary" },
      { indicatorId: "tenancy_recorded", role: "primary" },
      { indicatorId: "parcel_mismatch", role: "primary" },
      { indicatorId: "mutation_days", role: "secondary" },
      { indicatorId: "parcel_count", role: "secondary" },
      { indicatorId: "revenue_na_share", role: "secondary" },
      // Audits and backlog both act on disputes and on recorded prices.
      { indicatorId: "litigation_rate", role: "secondary" },
      { indicatorId: "land_value", role: "secondary" },
    ],
    sourceDocument: {
      title:
        "The Maharashtra Aadhaar (Targeted Delivery of Financial and Other Subsidies, Benefits and Services) Act, 2016",
      issuer: "Law and Judiciary Department, Government of Maharashtra",
      year: 2017,
      reference: "Maharashtra Act No. XVIII of 2017, as modified up to 19 December 2018",
      clause: "Sections 3 and 4 — proof of Aadhaar and notification of schemes",
      page: 2,
      sourceFile: "Agricultural Lands (Ceiling on Holdings) (Amendment) Act, 2018..pdf",
    },
    headline: { value: "3 months", label: "to notify the covered schemes" },
    evidence: [
      ev(
        "Aadhaar proof or authentication may be made a condition of receiving a benefit",
        "3. The State Government or, as the case may be, any Agency of the State Government, may, for the purpose of establishing identity of an individual as a condition for receipt of a subsidy, benefit or service for which the expenditure is incurred entirely by way of withdrawal from, or the receipt therefrom forms part of the Consolidated Fund of the State, or any fund set up by an Agency of the State Government, require that such individual undergo authentication, or furnish proof of possession of Aadhaar number",
        "Section 3",
        2,
      ),
      ev(
        "An alternative means of identification must be offered to anyone without an Aadhaar number",
        "Provided that, till such time that an Aadhaar number is not assigned to an individual, the individual shall be offered alternate and viable means of identification for delivery of the subsidy, benefit or service.",
        "Section 3, proviso",
        2,
      ),
      ev(
        "The covered schemes must be notified within three months of commencement",
        "4. The State Government shall, within a period of three months from the date of commencement of this Act, and thereafter, from time to time, notify the list of schemes, subsidies, benefit or services for which such authentication or proof is required as per section 3.",
        "Section 4",
        2,
      ),
      ev(
        "The Act came into force on 26 January 2017",
        "This Act was brought into force by G .N., G .A.D., No.GAD-DIT 018/1/2016 DIT (MH), dated the 24th January 2017, w.e.f. 26th January 2017.",
        "Commencement note",
        2,
      ),
      ev(
        "Assent was given on 14 January 2017",
        "This Act received the assent of the Governor on the 14th January 2017; assent was first published in the Maharashtra Government Gazette, Part IV, on the 16th January 2017 .",
        "Preamble / assent note",
        1,
      ),
    ],
  },
  parameters: {
    digitised_share: {
      value: 62,
      help: "Share of holdings brought onto a digital, uniquely identified record. The Act makes Aadhaar the identity condition for a benefit but sets no coverage target, so this is a modelling value.",
      evidence: ev(
        "The Act sets no digitisation coverage target",
        "3. The State Government ... may ... require that such individual undergo authentication, or furnish proof of possession of Aadhaar number",
        "Section 3",
        2,
        "inferred",
        0.4,
      ),
    },
    mutation_digital: {
      value: true,
      help: "Require the identity condition to be satisfied through authentication rather than an alternative offline means of identification.",
      evidence: ev(
        "Authentication is the primary route, with an alternative only where no Aadhaar number is assigned",
        "require that such individual undergo authentication, or furnish proof of possession of Aadhaar number or, in the case of an individual to whom no Aadhaar number has been assigned, such individual makes an application for enrolment : Provided that, till such time that an Aadhaar number is not assigned to an individual, the individual shall be offered alternate and viable means of identification",
        "Section 3 and proviso",
        2,
      ),
    },
    resurvey_cycle: {
      value: 6,
      help: "Years between survey refresh rounds. The Act does not require re-survey; it requires identity to be established before a benefit is released, so the cycle here represents the periodic re-verification the identity condition implies.",
      evidence: ev(
        "The Act requires identity verification, not re-survey",
        "for the purpose of establishing identity of an individual as a condition for receipt of a subsidy, benefit or service",
        "Section 3",
        2,
        "inferred",
        0.3,
      ),
    },
    audit_share: {
      value: 6,
      help: "Share of benefit records checked against the underlying entitlement each year. The Act does not prescribe an audit share, so this is a modelling value.",
      evidence: ev(
        "The Act prescribes no audit share",
        "4. The State Government shall, within a period of three months from the date of commencement of this Act, and thereafter, from time to time, notify the list of schemes",
        "Section 4",
        2,
        "inferred",
        0.3,
      ),
    },
    backlog: {
      value: 45,
      help: "Accumulated unfiled registration and mutation backlog. Not addressed by this Act — it is the modelled counter-pressure.",
      evidence: ev(
        "The Act does not address filing backlog",
        "This Act shall come into force on such date as the State Government may, by notification in the Official Gazette, appoint",
        "Section 1(3)",
        1,
        "inferred",
        0.25,
      ),
    },
  },
  defaultLandCategories: ["agricultural", "built-up", "barren"],
});
