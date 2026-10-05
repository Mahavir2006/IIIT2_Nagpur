// File exports: evacuation CSV, places GeoJSON, KML placemarks, CAP 1.2 alert.
// All take already-computed PlaceImpact rows so the files match what the panel shows.

import type { ScenarioConfig } from '@/types/scenario';
import type { PlaceImpact } from './impact';
import type { Envelopes } from './frames';
import { cellCenter, type GridGeo } from './grid';

function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const round = (x: number, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

function sortedReached(rows: PlaceImpact[]): PlaceImpact[] {
  return rows.filter((r) => r.arrival >= 0).sort((a, b) => a.arrival - b.arrival);
}

export function evacuationCsv(rows: PlaceImpact[], cfg: ScenarioConfig): string {
  const head = [
    'rank', 'place', 'kind', 'lat', 'lon', 'population', 'population_source', 'arrival_s', 'arrival_min',
    'peak_depth_m', 'peak_speed_m_s', 'hazard_aidr', 'latest_departure_min', 'walk_to_safe_ground_m', 'flooded',
  ];
  const lines = [
    `# PRAVAAH evacuation list — ${cfg.name}${cfg.hypothetical ? ' (HYPOTHETICAL scenario, not a safety assessment)' : ''}`,
    '# arrival = first time depth > 0.1 m within 100 m of the place; flooded = peak depth >= 0.3 m; hazard = AIDR 2017 Guideline 7-3',
    '# latest departure = arrival - straight-line walk at 1.0 m/s to ground >= peak water surface + 2 m (within 2 km) - 10 min buffer',
    head.join(','),
  ];
  sortedReached(rows).forEach((r, i) => {
    const dep = r.departure;
    lines.push([
      i + 1, csvCell(r.place.name), r.place.kind, r.place.lat.toFixed(5), r.place.lng.toFixed(5),
      r.place.population ?? '', r.place.populationSource ?? '', Math.round(r.arrival), round(r.arrival / 60, 1),
      round(r.peakDepth), round(r.peakSpeed), r.hazard ? `H${r.hazard}` : '',
      dep && dep.latest != null ? round(dep.latest / 60, 1) : '', dep && dep.safe ? Math.round(dep.safe.distance) : '',
      r.flooded ? 'yes' : 'no',
    ].join(','));
  });
  return lines.join('\n') + '\n';
}

export function placesGeoJson(rows: PlaceImpact[], cfg: ScenarioConfig): string {
  return JSON.stringify({
    type: 'FeatureCollection',
    name: `${cfg.id}-places`,
    properties: { scenario: cfg.name, hypothetical: cfg.hypothetical },
    features: rows.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.place.lng, r.place.lat] },
      properties: {
        id: r.place.id, name: r.place.name, kind: r.place.kind, population: r.place.population,
        population_source: r.place.populationSource, ground_m: round(r.place.ground),
        arrival_s: r.arrival >= 0 ? Math.round(r.arrival) : null, peak_depth_m: round(r.peakDepth),
        peak_speed_m_s: round(r.peakSpeed), peak_dv_m2_s: round(r.peakDV),
        hazard: r.hazard ? `H${r.hazard}` : null, flooded: r.flooded,
        latest_departure_s: r.departure?.latest != null ? Math.round(r.departure.latest) : null,
      },
    })),
  }, null, 1);
}

function xmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const KML_STYLE: Record<number, string> = { 0: 'ff9ca3af', 1: 'ff5ec522', 2: 'ff35e6a3', 3: 'ff15ccfa', 4: 'ff1673f9', 5: 'ff4444ef', 6: 'ffd326c0' };

export function placesKml(rows: PlaceImpact[], cfg: ScenarioConfig): string {
  const styles = Object.entries(KML_STYLE).map(([h, c]) =>
    `<Style id="h${h}"><IconStyle><color>${c}</color><scale>1.1</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>`).join('');
  const marks = sortedReached(rows).map((r) => {
    const desc = [
      `Kind: ${r.place.kind}`,
      `Arrival: T+${Math.round(r.arrival / 60)} min`,
      `Peak depth: ${r.peakDepth.toFixed(2)} m`,
      `Hazard: ${r.hazard ? 'H' + r.hazard : 'dry'} (AIDR 2017)`,
      r.place.population != null ? `Population: ${r.place.population} (${r.place.populationSource})` : 'Population: unknown',
      r.departure?.latest != null ? `Latest departure: T+${Math.round(r.departure.latest / 60)} min` : '',
    ].filter(Boolean).join('<br/>');
    return `<Placemark><name>${xmlEsc(r.place.name)}</name><styleUrl>#h${r.hazard}</styleUrl><description><![CDATA[${desc}]]></description><Point><coordinates>${r.place.lng.toFixed(6)},${r.place.lat.toFixed(6)},0</coordinates></Point></Placemark>`;
  }).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlEsc(cfg.name)} — places reached by the flood</name>${styles}
${marks}
</Document></kml>
`;
}

/** CAP dateTime with explicit offset (CAP 1.2 forbids "Z"). IST +05:30. */
function capTime(d: Date): string {
  const ist = new Date(d.getTime() + 5.5 * 3600e3);
  return ist.toISOString().replace(/\.\d{3}Z$/, '+05:30');
}

/** Polygon (CAP "lat,lon" pairs, closed) around every cell reached by the flood by time t. */
export function floodedBboxPolygon(g: GridGeo, env: Envelopes, t: number): string | null {
  if (!env.box) return null;
  const [r0, c0, r1, c1] = env.box;
  const cols = g.grid.cols;
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const k = r * cols + c;
      const a = env.arrival[k];
      if (a < 0 || a > t) continue;
      const [lng, lat] = cellCenter(g, k);
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (!Number.isFinite(minLat)) return null;
  const p = (la: number, lo: number) => `${la.toFixed(5)},${lo.toFixed(5)}`;
  return [p(minLat, minLng), p(minLat, maxLng), p(maxLat, maxLng), p(maxLat, minLng), p(minLat, minLng)].join(' ');
}

export function capAlert(rows: PlaceImpact[], cfg: ScenarioConfig, polygon: string | null, now = new Date()): string {
  const reached = sortedReached(rows).filter((r) => r.flooded);
  const first = reached[0];
  const names = reached.slice(0, 25).map((r) => r.place.name).join(', ') || 'Flood path downstream of the dam';
  const firstEn = first ? `First place reached: ${first.place.name}, about ${Math.round(first.arrival / 60)} minutes after breach.` : '';
  const firstHi = first ? `पहला स्थान: ${first.place.name}, बाँध टूटने के लगभग ${Math.round(first.arrival / 60)} मिनट बाद।` : '';
  const id = `damsystem-${cfg.id}-${now.getTime()}`;
  const expires = new Date(now.getTime() + 6 * 3600e3);
  const area = `<area><areaDesc>${xmlEsc(names)}</areaDesc>${polygon ? `<polygon>${polygon}</polygon>` : ''}</area>`;
  const info = (lang: string, event: string, headline: string, description: string, instruction: string) => `
  <info>
    <language>${lang}</language>
    <category>Infra</category>
    <category>Safety</category>
    <event>${xmlEsc(event)}</event>
    <responseType>Evacuate</responseType>
    <urgency>Immediate</urgency>
    <severity>Extreme</severity>
    <certainty>Possible</certainty>
    <effective>${capTime(now)}</effective>
    <expires>${capTime(expires)}</expires>
    <senderName>PRAVAAH digital twin (simulation)</senderName>
    <headline>${xmlEsc(headline)}</headline>
    <description>${xmlEsc(description)}</description>
    <instruction>${xmlEsc(instruction)}</instruction>
    ${area}
  </info>`;
  const exerciseNote = 'EXERCISE — generated from a model run, not an official warning.';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Common Alerting Protocol v1.2 (OASIS Standard, 1 July 2010). status=Exercise because this is a
     simulated scenario${cfg.hypothetical ? ' (hypothetical, not a dam-safety assessment)' : ''}. -->
<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">
  <identifier>${id}</identifier>
  <sender>damsystem@localhost</sender>
  <sent>${capTime(now)}</sent>
  <status>Exercise</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <note>${xmlEsc(exerciseNote)}</note>${info(
    'en-IN',
    'Dam-break flood',
    `${exerciseNote} Flash flood from ${cfg.dam.name} on the ${cfg.river}`,
    `A model run predicts a flood wave reaching ${reached.length} places downstream of ${cfg.dam.name}. ${firstEn}`,
    'Move to high ground immediately. Keep away from the river bank and bridges. Follow instructions from local authorities.',
  )}${info(
    'hi-IN',
    'बाँध टूटने से बाढ़',
    `अभ्यास — मॉडल आधारित, आधिकारिक चेतावनी नहीं। ${cfg.dam.name} से ${cfg.river} नदी में अचानक बाढ़`,
    `मॉडल के अनुसार बाढ़ की लहर ${cfg.dam.name} के नीचे ${reached.length} स्थानों तक पहुँच सकती है। ${firstHi}`,
    'तुरंत ऊँचे स्थान पर जाएँ। नदी के किनारे और पुलों से दूर रहें। स्थानीय प्रशासन के निर्देशों का पालन करें।',
  )}
</alert>
`;
}

export function download(name: string, content: string | Blob, mime: string): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
