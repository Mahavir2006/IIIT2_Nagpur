// Google Earth Engine Code Editor script generator for flood / lake water mapping over a scenario bbox.
// Method: Sentinel-1 GRD before/after change detection after the UN-SPIDER Recommended Practice
// "Flood mapping and damage assessment using Sentinel-1 SAR data in Google Earth Engine"
// (https://www.un-spider.org/advisory-support/recommended-practices/recommended-practice-google-earth-engine-flood-mapping),
// plus a Sentinel-2 NDWI (McFeeters 1996) water mask. The script is for the user to run in GEE; nothing is imported back.

import type { ScenarioConfig } from '@/types/scenario';

export interface GeeWindows {
  before: [string, string];
  after: [string, string];
  label: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function geeWindows(cfg: ScenarioConfig, now = new Date()): GeeWindows {
  if (cfg.id === 'rishiganga-2021') {
    return { before: ['2021-01-20', '2021-02-06'], after: ['2021-02-08', '2021-02-20'], label: 'Event windows around the 7 Feb 2021 Chamoli disaster' };
  }
  const day = 86400e3;
  return {
    before: [iso(new Date(now.getTime() - 60 * day)), iso(new Date(now.getTime() - 30 * day))],
    after: [iso(new Date(now.getTime() - 30 * day)), iso(now)],
    label: 'Generic: previous 30 days vs the 30 days before (no event date for this scenario)',
  };
}

export function buildGeeScript(cfg: ScenarioConfig, now = new Date()): string {
  const [w, s, e, n] = cfg.bbox;
  const win = geeWindows(cfg, now);
  const tag = cfg.id.replace(/[^a-z0-9]+/gi, '_');
  return `// Water / flood mapping for scenario "${cfg.name}" (${cfg.id})
// Generated ${iso(now)} by the dam-break console. Paste into https://code.earthengine.google.com/ and Run.
// ${win.label}
// Method: Sentinel-1 GRD VV before/after ratio change detection following the UN-SPIDER Recommended Practice
//   (https://www.un-spider.org/advisory-support/recommended-practices/recommended-practice-google-earth-engine-flood-mapping)
//   (that practice uses VH by default; VV is used here, set POL = 'VH' to follow it exactly),
// plus a Sentinel-2 NDWI = (B3 - B8) / (B3 + B8) water mask (McFeeters 1996).
// Thresholds are the practice defaults, NOT calibrated for this steep Himalayan valley. Check the output visually.

var aoi = ee.Geometry.Rectangle([${w}, ${s}, ${e}, ${n}]);
Map.centerObject(aoi, 11);

var BEFORE = ['${win.before[0]}', '${win.before[1]}'];
var AFTER  = ['${win.after[0]}', '${win.after[1]}'];
var POL = 'VV';
var RATIO_THRESHOLD = 1.25;   // UN-SPIDER default
var SMOOTH_M = 50;            // focal mean radius, m (speckle)
var NDWI_THRESHOLD = 0.0;     // McFeeters NDWI > 0 = water
var MAX_CLOUD = 30;           // % scene cloud cover for Sentinel-2

// ---------------- Sentinel-1 GRD change detection
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD')
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', POL))
  .filterBounds(aoi)
  .select(POL);

var s1Before = s1.filterDate(BEFORE[0], BEFORE[1]);
var s1After = s1.filterDate(AFTER[0], AFTER[1]);
print('S1 scenes before / after', s1Before.size(), s1After.size());
// Use one orbit direction so geometry matches (fall back to whatever the after window has).
var orbit = ee.String(ee.Algorithms.If(s1After.size().gt(0), s1After.first().get('orbitProperties_pass'), 'DESCENDING'));
var before = s1Before.filter(ee.Filter.eq('orbitProperties_pass', orbit)).mosaic().clip(aoi)
  .focal_mean(SMOOTH_M, 'circle', 'meters');
var after = s1After.filter(ee.Filter.eq('orbitProperties_pass', orbit)).mosaic().clip(aoi)
  .focal_mean(SMOOTH_M, 'circle', 'meters');

// dB values are negative: after/before > threshold means the surface got darker (new water).
var diff = after.divide(before);
var s1Flood = diff.gt(RATIO_THRESHOLD);

// Refinements from the practice: drop permanent water (JRC GSW seasonality >= 10 months),
// isolated pixels (< 8 connected) and steep slopes (> 5 deg, HydroSHEDS). The slope mask may remove
// real water in narrow gorges; inspect 's1FloodRaw' as well.
var gsw = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('seasonality');
var permanent = gsw.gte(10).unmask(0);
var slope = ee.Algorithms.Terrain(ee.Image('WWF/HydroSHEDS/03VFDEM')).select('slope');
var s1FloodRaw = s1Flood.selfMask();
var s1FloodMask = s1Flood.where(permanent, 0)
  .updateMask(s1Flood.connectedPixelCount(8).gte(8))
  .updateMask(slope.lt(5))
  .selfMask();

// ---------------- Sentinel-2 NDWI water masks
function ndwiWater(range) {
  var col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi).filterDate(range[0], range[1])
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', MAX_CLOUD));
  var img = col.median().clip(aoi);
  return img.normalizedDifference(['B3', 'B8']).rename('NDWI').gt(NDWI_THRESHOLD).selfMask();
}
var s2Before = ndwiWater(BEFORE);
var s2After = ndwiWater(AFTER);

// ---------------- Display
Map.addLayer(before, {min: -25, max: 0}, 'S1 ' + POL + ' before', false);
Map.addLayer(after, {min: -25, max: 0}, 'S1 ' + POL + ' after', false);
Map.addLayer(s1FloodRaw, {palette: ['ff9900']}, 's1FloodRaw (ratio only)', false);
Map.addLayer(s1FloodMask, {palette: ['0000ff']}, 'S1 new water (refined)');
Map.addLayer(s2Before, {palette: ['00ffff']}, 'S2 NDWI water before', false);
Map.addLayer(s2After, {palette: ['00aaff']}, 'S2 NDWI water after');

var areaKm2 = s1FloodMask.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(), geometry: aoi, scale: 10, maxPixels: 1e10, bestEffort: true});
print('S1 new-water area, km2', ee.Number(areaKm2.get(POL)).divide(1e6));

// ---------------- Export water masks (GeoTIFF to Google Drive)
Export.image.toDrive({image: s1FloodMask.unmask(0).toByte(), description: '${tag}_s1_newwater',
  region: aoi, scale: 10, maxPixels: 1e10, fileFormat: 'GeoTIFF'});
Export.image.toDrive({image: s2Before.unmask(0).toByte(), description: '${tag}_s2_ndwi_before',
  region: aoi, scale: 10, maxPixels: 1e10, fileFormat: 'GeoTIFF'});
Export.image.toDrive({image: s2After.unmask(0).toByte(), description: '${tag}_s2_ndwi_after',
  region: aoi, scale: 10, maxPixels: 1e10, fileFormat: 'GeoTIFF'});
`;
}
