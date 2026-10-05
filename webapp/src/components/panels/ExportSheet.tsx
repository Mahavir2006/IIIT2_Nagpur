'use client';

import { useEffect, useState } from 'react';
import { BellRing, Camera, FileSpreadsheet, Globe, MapPin, X } from 'lucide-react';
import { useUi } from '@/store/ui';
import { useSim } from '@/store/sim';
import { useScenario } from '@/store/scenario';
import { useAnalytics } from '@/store/analytics';
import { big } from '@/lib/big';
import { capAlert, download, evacuationCsv, floodedBboxPolygon, placesGeoJson, placesKml } from '@/lib/exporters';
import { mapHandle } from '@/lib/mapHandle';
import { clock } from '@/lib/format';

export default function ExportSheet() {
  const open = useUi((s) => s.exportOpen);
  const set = useUi((s) => s.set);
  const cfg = useScenario((s) => s.config);
  const status = useSim((s) => s.status);
  useAnalytics((s) => s.placesVersion);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') set({ exportOpen: false }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, set]);

  if (!open || !cfg) return null;
  const rows = big.places;
  const reached = rows.filter((r) => r.arrival >= 0).length;
  const hasRun = status !== 'idle' && status !== 'no-scenario' && rows.length > 0;
  const stamp = () => `${cfg.id}-T${clock(useSim.getState().playhead).replace(/:/g, '')}`;
  const done = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3000); };

  const png = () => {
    const src = mapHandle.capture?.();
    if (!src) { done('Map is not ready yet.'); return; }
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height + 44;
    const ctx = out.getContext('2d')!;
    ctx.fillStyle = '#0A0C0E';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    ctx.fillStyle = '#E8EDF2';
    ctx.font = '600 15px system-ui, sans-serif';
    const t = useSim.getState().playhead;
    const layer = useUi.getState().layer;
    ctx.fillText(`PRAVAAH · ${cfg.name}${cfg.hypothetical ? ' (hypothetical)' : ''} · T+${clock(t)} · layer: ${layer}`, 14, src.height + 19);
    ctx.fillStyle = '#8B949E';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Imagery © Esri, Maxar, Earthstar Geographics · Terrain: AWS Terrain Tiles (SRTM) · © OpenStreetMap contributors · model output, not an official warning', 14, src.height + 36);
    out.toBlob((b) => { if (b) { download(`${stamp()}.png`, b, 'image/png'); done('PNG snapshot saved.'); } }, 'image/png');
  };

  const items = [
    {
      icon: FileSpreadsheet, t: 'Evacuation list', fmt: 'CSV', need: true,
      d: `${reached} places sorted by arrival, with peak depth, AIDR hazard and latest departure.`,
      tip: 'Spreadsheet-ready list of every place the flood reaches, earliest first. The header lines define each column.',
      go: () => { download(`${stamp()}-evacuation.csv`, evacuationCsv(rows, cfg), 'text/csv'); done('Evacuation CSV saved.'); },
    },
    {
      icon: Globe, t: 'Places', fmt: 'GeoJSON', need: true,
      d: 'All places in the box as points with arrival, peak depth, speed, hazard.',
      tip: 'GeoJSON FeatureCollection (EPSG:4326) for QGIS/ArcGIS; unreached places have null arrival.',
      go: () => { download(`${stamp()}-places.geojson`, placesGeoJson(rows, cfg), 'application/geo+json'); done('GeoJSON saved.'); },
    },
    {
      icon: MapPin, t: 'Placemarks', fmt: 'KML', need: true,
      d: 'Reached places as placemarks coloured by hazard class, for Google Earth.',
      tip: 'KML 2.2 placemarks with the arrival time, depth and hazard in each balloon.',
      go: () => { download(`${stamp()}-places.kml`, placesKml(rows, cfg), 'application/vnd.google-earth.kml+xml'); done('KML saved.'); },
    },
    {
      icon: Camera, t: 'Map snapshot', fmt: 'PNG', need: false,
      d: 'The current map view with a caption and attribution strip.',
      tip: 'Captures the WebGL map exactly as shown (layer, camera, playhead) plus a caption line.',
      go: png,
    },
    {
      icon: BellRing, t: 'Public alert', fmt: 'CAP 1.2', need: true,
      d: 'Common Alerting Protocol message, English + Hindi, status Exercise.',
      tip: 'OASIS Common Alerting Protocol v1.2 XML with en-IN and hi-IN <info> blocks. The <area> polygon is the bounding box of every cell reached by the playhead; the place list is in <areaDesc>. Marked status=Exercise because it comes from a model run.',
      go: () => {
        const sc = big.scenario;
        const poly = sc && big.env ? floodedBboxPolygon({ bbox: sc.config.bbox, grid: sc.config.grid }, big.env, useSim.getState().playhead) : null;
        download(`${stamp()}-alert.cap.xml`, capAlert(rows, cfg, poly), 'application/xml');
        done('CAP 1.2 alert saved.');
      },
    },
  ];

  return (
    <>
      <div className="scrim" onClick={() => set({ exportOpen: false })} aria-hidden />
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Export">
        <div className="panel-head">
          <h2>Export</h2>
          <span className="micro" style={{ marginLeft: 4 }}>at T+{clock(useSim.getState().playhead)}</span>
          <span className="spacer" />
          <button type="button" className="icon-btn" aria-label="Close export" data-tip="Close (Esc)" onClick={() => set({ exportOpen: false })}><X size={16} /></button>
        </div>
        {!hasRun && <p className="note" style={{ padding: '10px 16px 0', margin: 0 }}>Run the model first. The data exports need a computed flood; the map snapshot works at any time.</p>}
        <div>
          {items.map((it) => (
            <button key={it.t} type="button" className="sheet-item" disabled={it.need && !hasRun} onClick={it.go} data-tip={it.tip}>
              <span className="ic"><it.icon size={17} /></span>
              <span className="t">{it.t}</span>
              <span className="fmt">{it.fmt}</span>
              <span className="d">{it.d}</span>
            </button>
          ))}
        </div>
        <p className="note" style={{ padding: '0 16px 14px' }} role="status">{msg ?? (cfg.hypothetical ? 'Exports from this scenario are labelled hypothetical.' : ' ')}</p>
      </div>
    </>
  );
}
