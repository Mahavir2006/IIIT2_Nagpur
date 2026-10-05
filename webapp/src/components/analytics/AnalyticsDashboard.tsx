'use client';

import { useMemo, useState } from 'react';
import { Info, Play, Pause, ArrowUpRight } from 'lucide-react';
import { useSim } from '@/store/sim';
import { useScenario } from '@/store/scenario';
import { useUi } from '@/store/ui';
import { useAnalytics } from '@/store/analytics';
import { dur, fmtInt, fmtNum } from '@/lib/format';

export default function AnalyticsDashboard() {
  const setUi = useUi((s) => s.set);
  const status = useSim((s) => s.status);
  // NB: do not subscribe to s.playhead / s.simT here — they change on every playback frame and
  // nothing in this dashboard renders them, so a raw subscription just re-renders the whole
  // grid at tick rate during a run (the "weird" stutter).
  const run = useSim((s) => s.run);
  const pause = useSim((s) => s.pause);

  const scn = useScenario((s) => s.config);
  const summary = useAnalytics((s) => s.summary);

  // Active hover point for temporal chart
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  // Key locations data
  const locations = useMemo(() => {
    return [
      { name: 'Raini Village', x: 22, y: 35, hazard: 'high', pop: 280, arrival: 'T+00:14', depth: '14.2 m' },
      { name: 'Tapovan Barrage', x: 38, y: 48, hazard: 'high', pop: 450, arrival: 'T+00:26', depth: '12.8 m' },
      { name: 'Joshimath Suburbs', x: 52, y: 42, hazard: 'med', pop: 1200, arrival: 'T+00:48', depth: '6.4 m' },
      { name: 'Helang Bridge', x: 65, y: 58, hazard: 'high', pop: 340, arrival: 'T+01:15', depth: '8.1 m' },
      { name: 'Pipalkoti', x: 78, y: 64, hazard: 'med', pop: 2400, arrival: 'T+01:42', depth: '4.8 m' },
      { name: 'Chamoli Town', x: 88, y: 72, hazard: 'low', pop: 5800, arrival: 'T+02:18', depth: '3.1 m' },
    ];
  }, []);

  // Compute points for temporal chart

  return (
    <div className="analytics-view">
      {/* Top Banner with Quick Simulation Status & Actions */}
      <div className="analytics-header-strip">
        <div className="strip-left">
          <div className="strip-badge">
            <span className="live-dot" />
            <span>OPERATIONAL SCENARIO</span>
          </div>
          <h2>{scn?.name ?? 'Rishiganga–Dhauliganga Outburst'}</h2>
          <span className="strip-sub">
            {scn?.dam.name ?? 'Illustrative gorge blockage'} · {fmtNum(scn?.dam.height ?? 193.7, 1)} m height · Peak Breach Inflow
          </span>
        </div>

        <div className="strip-actions">
          <div className="strip-metric">
            <span className="label">PEAK OUTFLOW</span>
            <span className="val">{summary ? fmtInt(summary.outflowNow || 5987) : '5,987'} <small>m³/s</small></span>
          </div>
          <div className="strip-metric">
            <span className="label">POPULATION AT RISK</span>
            <span className="val highlight">{summary ? fmtInt(summary.people) : '4,860'}</span>
          </div>
          <div className="strip-metric">
            <span className="label">WARNING LEAD TIME</span>
            <span className="val success">42 <small>min</small></span>
          </div>

          <button
            type="button"
            className="action-pill-btn"
            onClick={() => {
              if (status === 'running') pause();
              else run();
            }}
          >
            {status === 'running' ? <Pause size={15} /> : <Play size={15} />}
            {status === 'running' ? 'Pause Simulation' : 'Run Live Analysis'}
          </button>
        </div>
      </div>

      {/* Main 4-Card Dashboard Grid matching inspiration image */}
      <div className="analytics-grid">
        {/* Card 1: Temporal Trend Graphs */}
        <div className="dash-card">
          <div className="card-top">
            <div className="card-title-group">
              <h3>Temporal trend graphs</h3>
              <div className="legend-pills">
                <span className="pill blue"><i /> Breach outflow</span>
                <span className="pill cyan"><i /> Downstream wave</span>
                <span className="pill green"><i /> Reservoir depletion</span>
              </div>
            </div>
            <button type="button" className="card-info-btn" title="Hydrograph and discharge routing over simulation timeline">
              <Info size={15} />
            </button>
          </div>

          <div className="chart-container">
            <svg viewBox="0 0 540 220" className="trend-svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00e599" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#00e599" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="cyanLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#00e599" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines */}
              {[40, 80, 120, 160].map((y) => (
                <line key={y} x1="30" y1={y} x2="520" y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              ))}

              {/* Axis Labels */}
              <text x="12" y="44" className="axis-text">60</text>
              <text x="12" y="84" className="axis-text">50</text>
              <text x="12" y="124" className="axis-text">30</text>
              <text x="12" y="164" className="axis-text">10</text>
              <text x="18" y="200" className="axis-text">0</text>

              {/* Wave 1: Blue Outflow Area & Line */}
              <path
                d="M 40 100 Q 110 50 180 65 T 320 85 T 440 95 T 520 120 L 520 195 L 40 195 Z"
                fill="url(#blueGrad)"
              />
              <path
                d="M 40 100 Q 110 50 180 65 T 320 85 T 440 95 T 520 120"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2.2"
              />

              {/* Wave 2: Cyan/Green Routed Surge Area & Line */}
              <path
                d="M 40 150 Q 110 90 180 120 T 320 110 T 440 125 T 520 150 L 520 195 L 40 195 Z"
                fill="url(#greenGrad)"
              />
              <path
                d="M 40 150 Q 110 90 180 120 T 320 110 T 440 125 T 520 150"
                fill="none"
                stroke="#00e599"
                strokeWidth="2.2"
              />

              {/* Data points */}
              {[
                { cx: 40, cy: 100 },
                { cx: 110, cy: 75 },
                { cx: 180, cy: 65 },
                { cx: 250, cy: 95 },
                { cx: 320, cy: 85 },
                { cx: 400, cy: 105 },
                { cx: 470, cy: 98 },
                { cx: 520, cy: 120 },
              ].map((pt, i) => (
                <circle key={i} cx={pt.cx} cy={pt.cy} r="3" fill="#38bdf8" stroke="#161a22" strokeWidth="2" />
              ))}

              {[
                { cx: 40, cy: 150 },
                { cx: 110, cy: 110 },
                { cx: 180, cy: 120 },
                { cx: 250, cy: 145 },
                { cx: 320, cy: 110 },
                { cx: 400, cy: 135 },
                { cx: 470, cy: 130 },
                { cx: 520, cy: 150 },
              ].map((pt, i) => (
                <circle key={i} cx={pt.cx} cy={pt.cy} r="3" fill="#00e599" stroke="#161a22" strokeWidth="2" />
              ))}

              {/* Playhead Guideline and Value Pill matching inspiration */}
              <line x1="250" y1="30" x2="250" y2="195" stroke="#00e599" strokeWidth="1.5" strokeDasharray="3 3" />
              <g transform="translate(210, 52)">
                <rect width="80" height="24" rx="4" fill="#0f291e" stroke="#00e599" strokeWidth="1" />
                <text x="40" y="16" textAnchor="middle" fill="#00e599" fontSize="11" fontWeight="600" fontFamily="var(--font-num)">
                  5.987,37
                </text>
              </g>
            </svg>

            {/* X-axis days / hours */}
            <div className="x-axis-labels">
              <span>Mon</span>
              <span>Tues</span>
              <span>Wed</span>
              <span className="active">Thurs</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>
          </div>
        </div>

        {/* Card 2: Resource distribution and utilization */}
        <div className="dash-card">
          <div className="card-top">
            <div className="card-title-group">
              <h3>Resource distribution and utilization</h3>
              <div className="legend-pills">
                <span className="pill dark-green"><i /> Evacuated / Safe</span>
                <span className="pill bright-green"><i /> Engaged in Risk Zone</span>
              </div>
            </div>
            <button type="button" className="card-info-btn" title="Shelter capacity and active emergency deployments">
              <Info size={15} />
            </button>
          </div>

          <div className="bar-chart-container">
            <div className="bar-grid">
              {[
                { month: 'Jan', engagedH: 28, totalH: 52 },
                { month: 'Feb', engagedH: 42, totalH: 68 },
                { month: 'Mar', engagedH: 58, totalH: 85 },
                { month: 'Apr', engagedH: 72, totalH: 92 },
                { month: 'May', engagedH: 70, totalH: 88 },
              ].map((bar) => (
                <div key={bar.month} className="bar-column">
                  <div className="bar-track">
                    {/* Darker green base bar */}
                    <div className="bar-total-3d" style={{ height: `${bar.totalH}%` }}>
                      {/* Brighter 3D top block */}
                      <div className="bar-engaged-3d" style={{ height: `${bar.engagedH}%` }} />
                    </div>
                  </div>
                  <span className="bar-label">{bar.month}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Predictive Analytics Models */}
        <div className="dash-card">
          <div className="card-top">
            <div className="card-title-group">
              <h3>Predictive Analytics Models</h3>
              <div className="legend-pills">
                <span className="pill teal"><i /> High-risk reach</span>
                <span className="pill cyan"><i /> Protected settlements</span>
              </div>
            </div>
            <button type="button" className="card-info-btn" title="2D Shallow Water Equations Inundation Waveforms">
              <Info size={15} />
            </button>
          </div>

          <div className="chart-container">
            <svg viewBox="0 0 540 180" className="trend-svg" preserveAspectRatio="none">
              {/* Gridlines */}
              {[30, 65, 100, 135].map((y) => (
                <line key={y} x1="35" y1={y} x2="520" y2={y} stroke="rgba(255,255,255,0.05)" strokeDasharray="2 2" />
              ))}

              <text x="12" y="34" className="axis-text">100</text>
              <text x="16" y="69" className="axis-text">60</text>
              <text x="16" y="104" className="axis-text">20</text>
              <text x="12" y="139" className="axis-text">-20</text>
              <text x="10" y="170" className="axis-text">-100</text>

              {/* Sinusoidal predictive waves */}
              <path
                d="M 40 60 C 90 90, 120 120, 160 85 C 200 45, 230 110, 260 70 C 300 20, 340 120, 390 75 C 440 30, 480 90, 520 80"
                fill="none"
                stroke="#00e599"
                strokeWidth="2"
              />
              <path
                d="M 40 110 C 90 130, 130 140, 170 125 C 210 110, 240 145, 270 120 C 310 90, 350 145, 400 115 C 440 95, 480 135, 520 125"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2"
              />

              {/* Highlight Pin Tag */}
              <line x1="260" y1="40" x2="260" y2="170" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3 3" />
              <g transform="translate(225, 20)">
                <rect width="70" height="22" rx="4" fill="#082b3a" stroke="#38bdf8" strokeWidth="1" />
                <text x="35" y="15" textAnchor="middle" fill="#38bdf8" fontSize="10.5" fontWeight="600" fontFamily="var(--font-num)">
                  1.987,11
                </text>
              </g>
            </svg>
          </div>
        </div>

        {/* Card 4: Heat map */}
        <div className="dash-card">
          <div className="card-top">
            <div className="card-title-group">
              <h3>Heat map</h3>
              <div className="legend-pills">
                <span className="pill red"><i /> Most dangerous</span>
                <span className="pill yellow"><i /> Dangerously</span>
                <span className="pill green"><i /> Moderately dangerous</span>
              </div>
            </div>
            <button type="button" className="card-info-btn" title="GIS Reach map showing high-consequence settlement zones">
              <Info size={15} />
            </button>
          </div>

          <div className="heatmap-canvas-container">
            {/* Dark Styled Map Outline */}
            <svg viewBox="0 0 540 220" className="heatmap-svg">
              <defs>
                <radialGradient id="redGlow">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity="0.8" />
                  <stop offset="40%" stopColor="#ef4444" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="amberGlow">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                  <stop offset="40%" stopColor="#f59e0b" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="greenGlow">
                  <stop offset="0%" stopColor="#00e599" stopOpacity="0.8" />
                  <stop offset="40%" stopColor="#00e599" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#00e599" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Stylized River Corridor Line */}
              <path
                d="M 60 40 Q 120 70 180 110 T 300 130 T 420 160 T 500 180"
                fill="none"
                stroke="#1e3a5f"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path
                d="M 60 40 Q 120 70 180 110 T 300 130 T 420 160 T 500 180"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />

              {/* Dam Location Icon */}
              <circle cx="60" cy="40" r="6" fill="#f87171" stroke="#fff" strokeWidth="1.5" />
              <text x="72" y="44" fill="#fca5a5" fontSize="10" fontWeight="600">Dam Breach Site</text>

              {/* Concentric Hazard Nodes */}
              {locations.map((loc) => {
                const cx = (loc.x / 100) * 480 + 30;
                const cy = (loc.y / 100) * 160 + 30;
                const isSelected = selectedLocation === loc.name;
                const glowFill = loc.hazard === 'high' ? 'url(#redGlow)' : loc.hazard === 'med' ? 'url(#amberGlow)' : 'url(#greenGlow)';
                const strokeColor = loc.hazard === 'high' ? '#ef4444' : loc.hazard === 'med' ? '#f59e0b' : '#00e599';

                return (
                  <g key={loc.name} className="heat-node" onClick={() => setSelectedLocation(loc.name)} style={{ cursor: 'pointer' }}>
                    <circle cx={cx} cy={cy} r="22" fill={glowFill} />
                    <circle cx={cx} cy={cy} r={isSelected ? '7' : '4.5'} fill={strokeColor} stroke="#0e1117" strokeWidth="2" />
                    <text x={cx + 8} y={cy - 6} fill="#e5e7eb" fontSize="10" fontWeight="500">
                      {loc.name}
                    </text>
                    <text x={cx + 8} y={cy + 7} fill="#9ca3af" fontSize="8.5">
                      {loc.arrival} · {loc.depth}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Quick action to open 3D interactive view for selected town */}
            <div className="heat-overlay-pill">
              <span>Looking for high-res 3D digital twin terrain?</span>
              <button
                type="button"
                className="switch-map-btn"
                onClick={() => setUi({ mainView: 'map', leftOpen: false })}
              >
                Open 3D Map View <ArrowUpRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Comparison scenario & Rapid stats */}
      <div className="dash-bottom-card">
        <div className="card-top">
          <div className="card-title-group">
            <h3>Comparison scenario & Decision parameters</h3>
            <span className="card-subtitle">Sensitivity comparison between hydraulic breach configurations</span>
          </div>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => setUi({ mainView: 'map', leftTab: 'ensemble', leftOpen: true })}
          >
            Launch Full Ensemble
          </button>
        </div>

        <div className="comparison-table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>SCENARIO CASE</th>
                <th>BREACH MODE</th>
                <th>FORMATION TIME</th>
                <th>PEAK DISCHARGE</th>
                <th>TAPOVAN ARRIVAL</th>
                <th>LIFE LOSS ESTIMATE</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              <tr className="active-row">
                <td>
                  <div className="case-name">
                    <span className="active-tag" />
                    <b>Baseline Outburst (Active)</b>
                  </div>
                </td>
                <td><span className="badge-tag amber">Overtopping</span></td>
                <td>{dur(scn?.breach.formationTime ?? 1800)}</td>
                <td className="highlight-cell">5,987 m³/s</td>
                <td>T+00:26</td>
                <td><span className="tag-warning">14–38 persons</span></td>
                <td>
                  <button type="button" className="tbl-btn" onClick={() => setUi({ mainView: 'map', leftTab: 'event', leftOpen: true })}>
                    Edit Breach
                  </button>
                </td>
              </tr>
              <tr>
                <td><b>Piping Fast Breach (Worst Case)</b></td>
                <td><span className="badge-tag red">Piping</span></td>
                <td>{dur(900)}</td>
                <td>8,420 m³/s</td>
                <td>T+00:18</td>
                <td><span className="tag-danger">52–110 persons</span></td>
                <td>
                  <button type="button" className="tbl-btn" onClick={() => setUi({ mainView: 'map', leftTab: 'ensemble', leftOpen: true })}>
                    Simulate
                  </button>
                </td>
              </tr>
              <tr>
                <td><b>Gradual Slump (Controlled)</b></td>
                <td><span className="badge-tag blue">Partial</span></td>
                <td>{dur(5400)}</td>
                <td>2,850 m³/s</td>
                <td>T+00:44</td>
                <td><span className="tag-safe">&lt; 5 persons</span></td>
                <td>
                  <button type="button" className="tbl-btn" onClick={() => setUi({ mainView: 'map', leftTab: 'ensemble', leftOpen: true })}>
                    Simulate
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
