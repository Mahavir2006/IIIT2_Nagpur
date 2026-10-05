// Hand-written scenario definitions consumed by scripts/build-scenario.ts.
// Everything numeric here is either a published figure (with its source) or an explicitly
// illustrative choice (labelled as such). The builder derives everything else from data.
import type { BBox, LngLat, ScenarioConfig, Source } from '../../src/types/scenario';

export interface CheckTown {
  name: string;
  /** Coordinates used for the river-trace proximity check. */
  lngLat: LngLat;
  source: string;
}

export interface ScenarioDef {
  id: string;
  name: string;
  river: string;
  region: string;
  event: ScenarioConfig['event'];
  hypothetical: boolean;
  historical: ScenarioConfig['historical'];
  summary: string;
  year: number | null;
  bbox: BBox;
  /** Target cell size, m. */
  cell: number;
  zoom: number;
  /** Wider/coarser DEM used only to integrate the stage-storage table. */
  storage: { bbox: BBox; cell: number; zoom: number; levelStep: number };
  dam: {
    name: string;
    type: string;
    reservoir: string;
    /**
     * How to locate the dam axis on the river:
     *  - 'osm': centroid of an OSM waterway=dam element, snapped to the main channel.
     *  - 'gorge': narrowest cross-section on an OSM river between two distances from a reference point.
     */
    site:
      | { mode: 'osm'; osmId: number; fallback: LngLat }
      | { mode: 'gorge'; osmRiverId: number; ref: LngLat; minDistM: number; maxDistM: number; minAcc: number; widthAboveBedM: number };
    /** Published crest elevation (m ASL), or null => derived from targetVolume on the DEM table. */
    crestElevation: number | null;
    /** For illustrative blockages: the storage (m³) the blockage should impound at its crest. */
    targetVolume: number | null;
    publishedHeight: number | null;
    publishedCrestLength: number | null;
    publishedVolume: number | null;
    publishedVolumeSource: string | null;
    /** Water level at which publishedVolume applies (for a like-for-like comparison). */
    publishedVolumeLevel: number | null;
    /** Initial reservoir level: a number (m ASL) or 'crest'. */
    initialLevel: number | 'crest';
    /** Search distance downstream of the axis for the toe (lowest SRTM bed), m: ~half the dam's base width. */
    toeSearchM: number;
    /** Distance range upstream of the axis (m) in which the reservoir seed (lowest cell) is sought. */
    seedRangeM: [number, number];
    initialLevelNote: string;
  };
  breachMode: 'overtopping' | 'piping';
  breachModeNote: string;
  /**
   * Where the river really leaves the box. Only grid-edge cells within radiusM of this point act as
   * outlets for flow routing, so the trace cannot escape up a tributary that happens to touch another edge.
   */
  outlet: { lngLat: LngLat; radiusM: number };
  manning: number;
  checkTowns: CheckTown[];
  handoffReachId: string | null;
  notes: string[];
  sources: Source[];
}

const COMMON_SOURCES: Source[] = [
  { label: 'Elevation: AWS Open Data Terrain Tiles (Mapzen/Tilezen Terrarium), SRTM-derived here', url: 'https://registry.opendata.aws/terrain-tiles/' },
  { label: 'Terrain Tiles data sources and required attribution (Tilezen joerd)', url: 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md' },
  { label: 'Places, roads, bridges, hydro plants: © OpenStreetMap contributors (ODbL), via Overpass API', url: 'https://www.openstreetmap.org/copyright' },
  { label: 'Froehlich, D.C. (2008) Embankment dam breach parameters and their uncertainties. J. Hydraul. Eng. 134(12):1708-1721', url: 'https://doi.org/10.1061/(ASCE)0733-9429(2008)134:12(1708)' },
];

export const SCENARIOS: Record<string, ScenarioDef> = {
  'rishiganga-2021': {
    id: 'rishiganga-2021',
    name: 'Rishiganga–Dhauliganga–Alaknanda flood, 7 Feb 2021 (Chamoli)',
    river: 'Rishiganga → Dhauliganga → Alaknanda',
    region: 'Chamoli district, Uttarakhand, India',
    event: 'lake-outburst',
    hypothetical: false,
    historical: {
      date: '2021-02-07',
      note:
        'The real 7 Feb 2021 disaster was a rock–ice avalanche from Ronti peak (~27 million m³, Shugar et al. 2021) that turned into a debris flow down the Rishiganga and Dhauliganga. This scenario does NOT reproduce that mechanism: it reconstructs the event as a clear-water outburst from an illustrative blockage in the Rishiganga gorge upstream of Raini, holding a comparable volume. Treat it as a hindcast-style what-if for the flood path, not a reconstruction of the debris flow.',
    },
    summary:
      'Illustrative ~27 million m³ water outburst from a blockage in the Rishiganga gorge above Raini, routed over real SRTM terrain past Raini, Tapovan, Joshimath, Helang and Pipalkoti to Chamoli.',
    year: 2021,
    bbox: [79.27, 30.36, 79.83, 30.62],
    cell: 60,
    zoom: 13,
    storage: { bbox: [79.66, 30.38, 79.95, 30.56], cell: 30, zoom: 13, levelStep: 2 },
    dam: {
      name: 'Illustrative Rishiganga gorge blockage',
      type: 'Illustrative natural blockage (debris/ice dam) — not a real structure',
      reservoir: 'Illustrative blockage lake, Rishiganga',
      // OSM way 1074462194 = "Rishi Ganga"; ref = its confluence with the Dhauli Ganga at Raini.
      // Search the gorge between ~0.8 km above Raini and just below the Ronti Gad confluence (~4.7 km).
      site: { mode: 'gorge', osmRiverId: 1074462194, ref: [79.6902, 30.4877], minDistM: 800, maxDistM: 4500, minAcc: 30000, widthAboveBedM: 80 },
      crestElevation: null,
      targetVolume: 27e6,
      publishedHeight: null,
      publishedCrestLength: null,
      publishedVolume: 27e6,
      publishedVolumeSource:
        'Shugar et al. (2021), Science 373:300-306 — ~27×10⁶ m³ rock–ice avalanche volume of the real event; used only as the target volume for this illustrative water blockage (no real lake of this size existed).',
      publishedVolumeLevel: null,
      initialLevel: 'crest',
      toeSearchM: 120,
      seedRangeM: [60, 400],
      initialLevelNote: 'Lake assumed full to the blockage crest at breach start (illustrative).',
    },
    breachMode: 'overtopping',
    breachModeNote: 'overtopping (lake assumed full to the crest)',
    outlet: { lngLat: [79.31, 30.36], radiusM: 5000 },
    manning: 0.05,
    checkTowns: [
      { name: 'Raini (Reni)', lngLat: [79.6911, 30.4852], source: 'OSM place node 7833070518' },
      { name: 'Tapovan (Tapoban)', lngLat: [79.6253, 30.4885], source: 'OSM place node 7833070513' },
      { name: 'Joshimath', lngLat: [79.5613, 30.5556], source: 'OSM place node 342105699' },
      { name: 'Vishnuprayag HEP', lngLat: [79.5457, 30.5673], source: 'OSM power=plant way 1447993404 (centroid)' },
      { name: 'Helang (Helong)', lngLat: [79.5015, 30.524], source: 'OSM place node 342105686' },
      { name: 'Pipalkoti', lngLat: [79.4284, 30.4335], source: 'OSM place node 342104895' },
      { name: 'Birahi', lngLat: [79.3858, 30.4074], source: 'OSM place node 342109786' },
      { name: 'Chamoli (town, approx.)', lngLat: [79.33, 30.40], source: 'approximate town coordinate from the task brief (OSM "Chamoli" node 6588203951 sits at 79.3685E and is a different locality)' },
    ],
    handoffReachId: 'alaknanda_2',
    notes: [
      'The blockage location, height and volume are ILLUSTRATIVE. The site is the narrowest 60 m-grid cross-section of the Rishiganga between ~0.8 km above Raini and the Ronti Gad confluence; the crest height is whatever the DEM stage-storage needs to hold ~27 million m³ there.',
      'The real 2021 flow was a sediment-laden debris flow with far higher density and bulking than clear water; peak stages and travel times from a clear-water shallow-water model will differ from the observed event.',
    ],
    sources: [
      ...COMMON_SOURCES,
      { label: 'Shugar, D.H. et al. (2021) A massive rock and ice avalanche caused the 2021 disaster at Chamoli, Indian Himalaya. Science 373(6552):300-306', url: 'https://doi.org/10.1126/science.abh4455' },
    ],
  },

  tehri: {
    id: 'tehri',
    name: 'Tehri Dam break (hypothetical)',
    river: 'Bhagirathi → Ganga',
    region: 'Tehri Garhwal / Pauri Garhwal / Dehradun, Uttarakhand, India',
    event: 'dam-break',
    hypothetical: true,
    historical: null,
    summary:
      'Hypothetical breach of the 260.5 m Tehri earth-and-rockfill dam with the reservoir at FRL, routed over real SRTM terrain down the Bhagirathi past Koteshwar to Devprayag and down the Ganga to Rishikesh.',
    year: null,
    bbox: [78.25, 30.05, 78.62, 30.45],
    cell: 60,
    zoom: 13,
    storage: { bbox: [78.25, 30.3, 78.8, 30.75], cell: 90, zoom: 12, levelStep: 5 },
    dam: {
      name: 'Tehri Dam',
      type: 'Earth and rockfill embankment dam',
      reservoir: 'Tehri reservoir (Bhagirathi and Bhilangana arms)',
      site: { mode: 'osm', osmId: 93091865, fallback: [78.48056, 30.37778] },
      crestElevation: 839.5,
      targetVolume: null,
      publishedHeight: 260.5,
      publishedCrestLength: 575,
      publishedVolume: 3.54e9,
      publishedVolumeSource:
        'Gross storage 3.54 km³ (THDC India figure, as given in Wikipedia "Tehri Dam"); compared with the DEM table at FRL EL 830 m (THDC).',
      publishedVolumeLevel: 830,
      initialLevel: 830,
      toeSearchM: 700,
      seedRangeM: [900, 2500],
      initialLevelNote: 'Reservoir at Full Reservoir Level EL 830 m (THDC) at breach start.',
    },
    breachMode: 'piping',
    breachModeNote: 'piping (internal erosion): with the reservoir at FRL 830 m, 9.5 m below the crest, overtopping cannot start the breach',
    outlet: { lngLat: [78.26, 30.05], radiusM: 6000 },
    manning: 0.05,
    checkTowns: [
      { name: 'Koteshwar Dam', lngLat: [78.4977, 30.2603], source: 'OSM waterway=dam way 429714427 (centroid)' },
      { name: 'Devprayag', lngLat: [78.5986, 30.1461], source: 'OSM place node 342114339' },
      { name: 'Shivpuri', lngLat: [78.3922, 30.1381], source: 'OSM place node 7886624339' },
      { name: 'Rishikesh', lngLat: [78.2916, 30.1087], source: 'OSM place node 3735821429' },
    ],
    handoffReachId: 'ganga_1',
    notes: [
      'Hypothetical scenario for education and research; not a safety assessment of Tehri Dam, which is a heavily engineered and monitored structure.',
      'The published 260.5 m height with top of dam at 839.5 m implies a base at EL 579 m, below the SRTM river bed (~615 m), i.e. it is measured from foundation level; DamSpec.height here is crest minus the SRTM valley floor just downstream of the dam, as the contract defines it.',
      'SRTM (Feb 2000) predates impoundment (2006), so the reservoir basin is dry terrain in the DEM; the Koteshwar dam and reservoir (commissioned 2011-12) and the partially built Tehri embankment of 2000 are not represented as structures.',
    ],
    sources: [
      ...COMMON_SOURCES,
      { label: 'THDC India Ltd — Tehri HPP (Stage-I): dam height 260.5 m, length at top 575 m, FRL EL 830 m, MFL EL 835 m, dead storage level EL 740 m', url: 'https://www.thdc.co.in/en/projects/hydro/tehri-dam-HPP-stage-I' },
      { label: 'Wikipedia, "Tehri Dam": 3.54 km³ reservoir, 52 km² surface area, base width 1,128 m', url: 'https://en.wikipedia.org/wiki/Tehri_Dam' },
      { label: 'Top of dam EL 839.5 m: THDC salient-features tables as reproduced in secondary documents (not on THDC\'s live page at retrieval)' },
    ],
  },
};
