// Builds dist/dam_system_rishiganga.html: one self contained file with CSS and JS inlined.
// Usage: node tools/build.js
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

// Regenerate src/basin/gangaDataBundle.js from data/ganga/*.json first, so the
// dist build (and the dev app) can never ship a copy of the basin data that
// has silently drifted out of sync with those files - see
// tools/build_ganga_bundle.js for why this file exists as a separate bundle.
require('./build_ganga_bundle.js');

let html = read('index.html');
html = html.replace('<link rel="stylesheet" href="src/styles/main.css">', () => '<style>\n' + read('src/styles/main.css') + '</style>');
html = html.replace(/<script src="(src\/[^"]+)"><\/script>/g, (_, srcPath) => '<script>\n' + read(srcPath) + '\n</script>');
if (/src="src\/|href="src\//.test(html)) { console.error('Build failed: a source reference was not inlined.'); process.exit(1); }
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'dam_system_rishiganga.html');
fs.writeFileSync(out, html);
console.log('Built ' + path.relative(root, out) + ' (' + Math.round(html.length / 1024) + ' KB)');
