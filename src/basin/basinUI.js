/* DAM SYSTEM Basin UI: Timeline scrubber, Longitudinal attenuation chart,
   Town risk ranking table, Scenario selector, Baseflow toggle, and Model assumptions drawer. */
(function (root) {
  'use strict';

  let hostEl;
  let isBound = false;

  const BasinUI = {
    init: function (containerEl) {
      hostEl = containerEl;
      if (!hostEl) return;
      this.renderHTML();
      this.bindEvents();
      isBound = true;
    },

    renderHTML: function () {
      if ($('#basinOverlay')) $('#basinOverlay').remove();

      const html = `
        <div id="basinOverlay" class="basin-overlay" style="display:none;">
          <!-- Top Bar Controls -->
          <div class="basin-top-bar">
            <div class="breadcrumb" id="basinBreadcrumb">
              <button data-act="nav-basin" class="bc-item">Ganga Basin</button>
              <span class="bc-sep">›</span>
              <button data-act="nav-garhwal" class="bc-item">Garhwal Gorges</button>
              <span class="bc-sep">›</span>
              <button data-act="nav-local" class="bc-item active">Rishiganga Domain</button>
            </div>
            <div class="basin-controls">
              <select id="selBasinScen" class="btn">
                <option value="A">Scenario A: Rishiganga Breach (Linked 3D Model)</option>
                <option value="B">Scenario B: 7 Feb 2021 Replay (Hindcast)</option>
                <option value="C">Scenario C: Hypothetical Tehri Dam Failure (Disclaimed)</option>
              </select>
              <select id="selBasinSeason" class="btn">
                <option value="february_lean">February (Lean Season Baseflow)</option>
                <option value="august_monsoon">August (Monsoon Season Baseflow)</option>
              </select>
              <button id="btnAssumptions" class="btn">Model Assumptions</button>
              <button id="btnExportGeoJSON" class="btn">GeoJSON</button>
              <button id="btnExportKML" class="btn">KML</button>
              <button id="btnExportCSV" class="btn">Loss CSV</button>
              <button id="btnReturnLocal" class="btn primary">Focus 3D Valley</button>
            </div>
          </div>

          <!-- Scenario C Disclaimer Badge -->
          <div id="scenCDisclaimer" class="scen-disclaimer" style="display:none;">
            <b>HYPOTHETICAL WHAT-IF:</b> Scenario C models a hypothetical failure of Tehri Dam. Not an official safety assessment.
          </div>

          <!-- Left Story Panel (Chapter 11: The Whole Ganga) -->
          <div id="basinStory" class="basin-story-panel">
            <div class="scroll">
              <div class="chno"><strong>11</strong><span>of 11, Basin Hydrodynamics</span></div>
              <h1>The whole Ganga from source to sea</h1>
              <p>The flood wave does not end at Vishnuprayag. As water leaves the 3D Rishiganga gorge, 1D Muskingum-Cunge routing takes over across ~2,500 km of the Ganga main stem down to Farakka, Kolkata, and Ganga Sagar.</p>
              
              <div class="note"><b>Physical Honesty:</b> A Rishiganga scale surge (~21,000 m³/s) attenuates sharply in the Garhwal gorges and floodplains. Showing where danger stops protects emergency services from over-alerting downstream districts.</div>
              
              <h2 style="font-size:14px;margin:12px 0 4px">Town Risk Ranking</h2>
              <div id="townRankTable"></div>
            </div>
          </div>

          <!-- Right Analysis Panel (Longitudinal Attenuation Chart) -->
          <div id="basinIntel" class="basin-intel-panel">
            <h2>Longitudinal Wave Attenuation <small>0 to 2,500 km</small></h2>
            <canvas id="cvAttenuation" class="ch"></canvas>
            <div id="attenuationLegend" class="swatches">
              <span><i style="background:var(--alert)"></i>Peak Discharge (m³/s)</span>
              <span><i style="background:var(--ice)"></i>Arrival Time (hours)</span>
            </div>
            <div class="sep"></div>
            <div id="basinMassLedger"></div>
          </div>

          <!-- Bottom Timeline Scrubber -->
          <div id="basinTimeline" class="basin-timeline">
            <button id="btnBasinPlay" class="btn hot">Play Basin Routing</button>
            <span id="basinTimeText" class="t-text">Day 00, 00:00</span>
            <input type="range" id="rngBasinTime" min="0" max="432000" step="300" value="0">
            <select id="selBasinSpeed" class="btn">
              <option value="3600">1 h / sec</option>
              <option value="21600" selected>6 h / sec</option>
              <option value="86400">1 day / sec</option>
            </select>
          </div>

          <!-- Model Assumptions Drawer -->
          <div id="drawerAssumptions" class="assumptions-drawer" style="display:none;">
            <div class="hdr"><b>Model Assumptions & Data Provenance</b><button id="btnCloseDrawer">×</button></div>
            <div class="bdy">
              <ul>
                <li><b>Basin Routing:</b> 1D Muskingum-Cunge routing on 17 reaches (~2,500 km) with HAND-style town inundation.</li>
                <li><b>Basin DEM caveat:</b> the bundled basin DEM is a 64 x 64 grid over 77.5-89.5E / 21.3-31.5N, i.e. roughly 20 km per cell, not the 500 m product the production pipeline uses. It is drawn only as a coarse relief backdrop on the 2D basin map; the vector reach network and town points carry the actual detail.</li>
                <li><b>Local Resolution:</b> 54.2 m 2D Shallow Water HLL Riemann solver with WCSPH near-field breach.</li>
                <li><b>Mass Balance Ledger:</b> Conservation relative error &lt; 1e-6 relative across local and basin models.</li>
                <li><b>Padma River Branch:</b> Modelled as an outflow node at the Bangladesh border.</li>
                <li><b>Reservoir Routing:</b> Level-pool storage routing ($dS/dt = I - O$) for Tehri Dam and Srinagar HEP.</li>
              </ul>
            </div>
          </div>
        </div>
      `;

      document.body.insertAdjacentHTML('beforeend', html);
    },

    bindEvents: function () {
      $('#selBasinScen').addEventListener('change', e => {
        const val = e.target.value;
        $('#scenCDisclaimer').style.display = val === 'C' ? 'block' : 'none';
        if (root.BasinCore) {
          root.BasinCore.runRouting(val, $('#selBasinSeason').value);
          this.updateUI();
          if (root.BasinView) root.BasinView.updateData();
        }
      });

      $('#selBasinSeason').addEventListener('change', e => {
        if (root.BasinCore) {
          root.BasinCore.runRouting($('#selBasinScen').value, e.target.value);
          this.updateUI();
          if (root.BasinView) root.BasinView.updateData();
        }
      });

      $('#btnAssumptions').addEventListener('click', () => {
        const d = $('#drawerAssumptions');
        d.style.display = d.style.display === 'none' ? 'block' : 'none';
      });

      $('#btnCloseDrawer').addEventListener('click', () => {
        $('#drawerAssumptions').style.display = 'none';
      });

      $('#btnReturnLocal').addEventListener('click', () => {
        if (root.ViewManager) root.ViewManager.switchView('local');
      });

      $$('#basinBreadcrumb button').forEach(b => {
        b.addEventListener('click', () => {
          const act = b.getAttribute('data-act');
          if (act === 'nav-local' && root.ViewManager) root.ViewManager.switchView('local');
          else if (root.ViewManager) root.ViewManager.switchView('basin');
        });
      });

      $('#btnExportGeoJSON').addEventListener('click', () => this.exportGeoJSON());
      $('#btnExportKML').addEventListener('click', () => this.exportKML());
      $('#btnExportCSV').addEventListener('click', () => this.exportCSV());

      let isPlaying = false;
      let animTimer = null;
      const btnPlay = $('#btnBasinPlay');
      const rngTime = $('#rngBasinTime');

      if (btnPlay && rngTime) {
        btnPlay.addEventListener('click', () => {
          isPlaying = !isPlaying;
          btnPlay.textContent = isPlaying ? 'Pause Basin Routing' : 'Play Basin Routing';
          btnPlay.classList.toggle('hot', !isPlaying);
          if (isPlaying) {
            animTimer = setInterval(() => {
              const speed = +($('#selBasinSpeed').value || 21600);
              let val = +rngTime.value + speed * 0.1;
              if (val > +rngTime.max) val = 0;
              rngTime.value = val;
              if (root.BasinCore && root.BasinCore.ST) root.BasinCore.ST.currentTime = val;
              this.updateUI();
              if (root.BasinView) root.BasinView.updateData();
            }, 100);
          } else if (animTimer) {
            clearInterval(animTimer);
            animTimer = null;
          }
        });

        rngTime.addEventListener('input', e => {
          const val = +e.target.value;
          if (root.BasinCore && root.BasinCore.ST) root.BasinCore.ST.currentTime = val;
          this.updateUI();
          if (root.BasinView) root.BasinView.updateData();
        });
      }
    },

    exportGeoJSON: function () {
      if (!root.BasinCore) return;
      const att = root.BasinCore.getAttenuationData();
      const geojson = {
        type: "FeatureCollection",
        features: att.map(t => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: [t.lon, t.lat] },
          properties: {
            name: t.name,
            chainage_km: t.chainage_km,
            arrival_sec: t.tArrivalSec,
            peak_discharge_m3s: t.peakQ,
            peak_depth_m: t.peakDepth,
            risk_score: t.riskScore,
            hazard_class: t.hazardClass,
            exposed_population: t.exposedPop
          }
        }))
      };
      this.downloadFile(JSON.stringify(geojson, null, 2), "dam_system_inundation_assessment.geojson", "application/json");
    },

    exportKML: function () {
      if (!root.BasinCore) return;
      const att = root.BasinCore.getAttenuationData();
      let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>DAM SYSTEM Flood Inundation &amp; Hazard Assessment</name>\n`;
      att.forEach(t => {
        kml += `    <Placemark>
      <name>${t.name} (Risk ${t.riskScore})</name>
      <description>Arrival: ${t.tArrivalSec >= 0 ? Math.round(t.tArrivalSec / 60) + ' min' : 'Safe'}, Peak Discharge: ${Math.round(t.peakQ)} m3/s, Peak Depth: ${t.peakDepth.toFixed(1)} m</description>
      <Point><coordinates>${t.lon},${t.lat},0</coordinates></Point>
    </Placemark>\n`;
      });
      kml += `  </Document>\n</kml>`;
      this.downloadFile(kml, "dam_system_inundation_assessment.kml", "application/vnd.google-earth.kml+xml");
    },

    exportCSV: function () {
      if (!root.BasinCore) return;
      const att = root.BasinCore.getAttenuationData();
      let csv = "Town,Latitude,Longitude,Chainage_km,Arrival_min,PeakQ_m3s,PeakDepth_m,HazardClass,RiskScore,ExposedPopulation\n";
      att.forEach(t => {
        const arrMin = t.tArrivalSec >= 0 ? Math.round(t.tArrivalSec / 60) : -1;
        csv += `"${t.name}",${t.lat},${t.lon},${t.chainage_km},${arrMin},${Math.round(t.peakQ)},${t.peakDepth.toFixed(2)},${t.hazardClass},${t.riskScore},${t.exposedPop}\n`;
      });
      this.downloadFile(csv, "dam_system_loss_assessment.csv", "text/csv");
    },

    downloadFile: function (content, filename, mimeType) {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },

    updateUI: function () {
      if (!root.BasinCore) return;
      if (root.BasinCore.ST) {
        const curSec = root.BasinCore.ST.currentTime || 0;
        const d = Math.floor(curSec / 86400);
        const h = Math.floor((curSec % 86400) / 3600);
        const m = Math.floor((curSec % 3600) / 60);
        const timeText = $('#basinTimeText');
        if (timeText) timeText.textContent = `Day ${String(d).padStart(2, '0')}, ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        const rngTime = $('#rngBasinTime');
        if (rngTime && document.activeElement !== rngTime) rngTime.value = curSec;
      }
      this.drawAttenuationChart();
      this.renderTownTable();
      this.renderMassLedger();
    },

    drawAttenuationChart: function () {
      const cv = $('#cvAttenuation');
      if (!cv || !root.BasinCore) return;
      const att = root.BasinCore.getAttenuationData();
      if (!att || !att.length) return;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = cv.clientWidth || 300, h = cv.clientHeight || 150;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);

      const xmax = 2300;
      const maxQ = Math.max(1000, ...att.map(a => a.peakQ));
      const ymax = Math.ceil(maxQ / 5000) * 5000 || 25000;

      const padL = 40, padR = 15, padT = 15, padB = 25;
      const X = x => padL + (x / xmax) * (w - padL - padR);
      const Y = y => padT + (1 - Math.max(0, y) / ymax) * (h - padT - padB);

      // Gridlines & Y-Axis Ticks
      g.strokeStyle = 'rgba(200, 220, 230, 0.12)'; g.lineWidth = 1;
      g.fillStyle = cssv('--ink-3') || '#71858f'; g.font = '10px sans-serif'; g.textAlign = 'right';
      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const val = (ymax / steps) * i;
        const y = Y(val);
        g.beginPath(); g.moveTo(padL, y); g.lineTo(w - padR, y); g.stroke();
        g.fillText(val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val, padL - 6, y + 3);
      }

      // Fill Area under Peak Q
      const alertCol = cssv('--alert') || '#f06a52';
      g.fillStyle = 'rgba(240, 106, 82, 0.15)';
      g.beginPath();
      att.forEach((a, i) => {
        const x = X(a.chainage_km), y = Y(a.peakQ);
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      });
      g.lineTo(X(att[att.length - 1].chainage_km), Y(0));
      g.lineTo(X(att[0].chainage_km), Y(0));
      g.closePath(); g.fill();

      // Plot Peak Q Curve
      g.strokeStyle = alertCol; g.lineWidth = 2.2; g.beginPath();
      att.forEach((a, i) => {
        const x = X(a.chainage_km), y = Y(a.peakQ);
        i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      });
      g.stroke();

      // Plot Town Dots & Labels
      att.forEach(a => {
        const x = X(a.chainage_km), y = Y(a.peakQ);
        g.fillStyle = alertCol; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
        g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke();
      });

      // X-Axis Baseline
      g.strokeStyle = 'rgba(200, 220, 230, 0.3)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(padL, h - padB); g.lineTo(w - padR, h - padB); g.stroke();
      g.fillStyle = cssv('--ink-3') || '#71858f'; g.textAlign = 'center';
      [0, 500, 1000, 1500, 2000].forEach(km => {
        g.fillText(km + ' km', X(km), h - padB + 14);
      });
    },

    renderTownTable: function () {
      const el = $('#townRankTable');
      if (!el || !root.BasinCore) return;
      const att = root.BasinCore.getAttenuationData();
      let html = '<table class="t"><thead><tr><th>Town</th><th class="r">Dist</th><th class="r">Arrival</th><th class="r">Risk</th></tr></thead><tbody>';
      att.forEach(t => {
        const arr = t.tArrivalSec >= 0 ? Math.round(t.tArrivalSec / 3600) + ' h' : 'Safe';
        html += `<tr><td>${t.name}</td><td class="r">${Math.round(t.chainage_km)} km</td><td class="r">${arr}</td><td class="r"><b>${t.riskScore}</b></td></tr>`;
      });
      html += '</tbody></table>';
      el.innerHTML = html;
    },

    renderMassLedger: function () {
      const el = $('#basinMassLedger');
      if (!el || !root.BasinCore) return;
      const m = root.BasinCore.getMassLedger();
      el.innerHTML = `<div class="kv"><dt>Routing Mass Balance Error</dt><dd>${(m.err * 100).toFixed(6)}%</dd><dt>Basin Inflow</dt><dd>${(m.inflow_m3 / 1e6).toFixed(2)} Mm³</dd><dt>Basin Storage</dt><dd>${(m.storage_m3 / 1e6).toFixed(2)} Mm³</dd></div>`;
    }
  };

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  root.BasinUI = BasinUI;

})(typeof window !== 'undefined' ? window : globalThis);
