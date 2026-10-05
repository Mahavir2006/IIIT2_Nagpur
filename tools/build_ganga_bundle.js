// Regenerates src/basin/gangaDataBundle.js (window.GANGA_DATA) from the real
// data/ganga/*.json files, so the app's runtime data can never silently drift
// out of sync with those files the way it previously did: this bundle existed
// as a hand-committed snapshot with no generator, so edits to data/ganga/*.json
// (including a real DEM fetch) never reached the running app until someone
// happened to notice and regenerate it by hand.
//
// The bundle exists (rather than having index.html fetch() the JSON files
// directly) so dist/dam_system_rishiganga.html keeps working when opened
// straight from disk (file://), where fetch() of local files is blocked by
// most browsers - see README's "sovereign/offline operation" goal.
//
// Usage: node tools/build_ganga_bundle.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data', 'ganga');
const outPath = path.join(root, 'src', 'basin', 'gangaDataBundle.js');

const readJSON = name => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));

const GANGA_DATA = {
  rivers: readJSON('rivers.json'),
  towns: readJSON('towns.json'),
  structures: readJSON('structures.json'),
  sections: readJSON('sections.json'),
  baseflow: readJSON('baseflow.json'),
  dem: readJSON('dem_basin.json')
};

const out = `/* Auto-generated Ganga Basin Data Bundle - DO NOT EDIT BY HAND.
   Regenerate with: node tools/build_ganga_bundle.js
   Source: data/ganga/*.json (see data/ganga/SOURCES.md for provenance). */
(function (root) {
  'use strict';
  root.GANGA_DATA = ${JSON.stringify(GANGA_DATA)};
})(typeof window !== 'undefined' ? window : globalThis);
`;

fs.writeFileSync(outPath, out);
console.log('Built ' + path.relative(root, outPath) + ' (' + Math.round(out.length / 1024) + ' KB) from data/ganga/*.json');
