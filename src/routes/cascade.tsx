import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Building2,
  CloudRain,
  Droplets,
  Gauge,
  GitBranch,
  Map as MapIcon,
  MapPin,
  Minus,
  Plus,
  Route as RoadIcon,
  Waves,
} from "lucide-react";
import { CascadeReadinessDashboard } from "@/components/dashboards/CascadeReadinessDashboard";
import { PravaahEngine, type PravaahSimulationState } from "@/services/gis3d/pravaahEngine";
import { buildCascadeGraph, type CascadeEdge, type CascadeNode } from "@/services/cascade/graph";
import "@/components/dashboards/dashboards.css";

export const Route = createFileRoute("/cascade")({
  head: () => ({
    meta: [
      { title: "Dependency Graph — PRAVAAH" },
      {
        name: "description",
        content: "Explore the modelled dependencies behind a PRAVAAH rainfall scenario.",
      },
    ],
  }),
  component: CascadePage,
});

const engine = PravaahEngine.getInstance();
const canvasWidth = 1640;
const nodeWidth = 226;
const nodeHeight = 116;
const rowHeight = 205;
const laneOrder: CascadeNode["kind"][] = [
  "hazard",
  "drainage",
  "flood",
  "road",
  "facility",
  "vehicle",
];
const laneTitle: Record<CascadeNode["kind"], string> = {
  hazard: "Rainfall input",
  drainage: "Drainage network",
  flood: "Flood exposure",
  road: "Road corridors",
  facility: "Critical facilities",
  vehicle: "Response vehicles",
};
const nodeIcon: Record<CascadeNode["kind"], typeof Activity> = {
  hazard: CloudRain,
  drainage: Waves,
  flood: Droplets,
  road: RoadIcon,
  facility: Building2,
  vehicle: Gauge,
};

interface PositionedNode {
  node: CascadeNode;
  x: number;
  y: number;
}

function makeLayout(nodes: CascadeNode[]) {
  const positioned: PositionedNode[] = [];
  const laneLabels: Array<{ title: string; y: number; kind: CascadeNode["kind"] }> = [];
  let row = 0;
  for (const kind of laneOrder) {
    const group = nodes.filter((node) => node.kind === kind);
    if (!group.length) continue;
    laneLabels.push({ title: laneTitle[kind], y: row * rowHeight + 58, kind });
    const rows = Math.ceil(group.length / 5);
    group.forEach((node, index) => {
      const localRow = Math.floor(index / 5);
      const localIndex = index % 5;
      const count = Math.min(5, group.length - localRow * 5);
      const spacing = canvasWidth / (count + 1);
      positioned.push({
        node,
        x: spacing * (localIndex + 1) - nodeWidth / 2,
        y: (row + localRow) * rowHeight + 30,
      });
    });
    row += rows;
  }
  return { positioned, laneLabels, height: row * rowHeight + 70 };
}

function edgePath(from: PositionedNode, to: PositionedNode) {
  const x1 = from.x + nodeWidth / 2;
  const y1 = from.y + nodeHeight;
  const x2 = to.x + nodeWidth / 2;
  const y2 = to.y;
  const bend = Math.max(42, Math.abs(y2 - y1) * 0.38);
  return {
    d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
    labelX: (x1 + x2) / 2,
    labelY: (y1 + y2) / 2,
  };
}

export function CascadePage() {
  const [state, setState] = useState<PravaahSimulationState>(() => ({ ...engine.state }));
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(0.76);

  useEffect(() => {
    let lastPaint = 0;
    return engine.subscribe((next) => {
      const now = Date.now();
      if (next.isRunning && now - lastPaint < 250) return;
      lastPaint = now;
      setState({
        ...next,
        roads: [...next.roads],
        floodZones: [...next.floodZones],
        vehicles: [...next.vehicles],
      });
    });
  }, []);

  const graph = useMemo(() => buildCascadeGraph(state), [state]);
  const selected = graph.nodes.find((node) => node.id === selectedId) ?? null;
  const layout = useMemo(() => makeLayout(graph.nodes), [graph.nodes]);
  const positionById = useMemo(
    () => new Map(layout.positioned.map((item) => [item.node.id, item])),
    [layout.positioned],
  );
  const matchingIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return new Set(graph.nodes.map((node) => node.id));
    return new Set(
      graph.nodes
        .filter((node) =>
          `${node.label} ${node.detail} ${node.kind} ${node.status}`.toLowerCase().includes(q),
        )
        .map((node) => node.id),
    );
  }, [graph.nodes, query]);
  const relevant = selected
    ? graph.edges.filter((edge) => edge.from === selected.id || edge.to === selected.id)
    : [];
  const connectedIds = new Set(relevant.flatMap((edge) => [edge.from, edge.to]));
  const relevantIds = new Set(relevant.map((edge) => edge.id));

  return (
    <main className="ops-page cascade-page graph-page">
      <header className="ops-top">
        <Link to="/dashboard" className="ops-brand">
          <ArrowLeft size={15} /> PRAVAAH <span>DEPENDENCY GRAPH</span>
        </Link>
        <Link
          to="/gis-explorer-3d"
          search={{ state: undefined, layer: undefined, lat: undefined, lon: undefined }}
          className="ops-top-link"
        >
          <MapIcon size={15} /> Open GIS
        </Link>
      </header>

      <section className="ops-intro graph-intro">
        <div>
          <h1>How the cascade connects.</h1>
          <p>
            Trace scenario rainfall through drainage, flood exposure, roads, facilities, and
            response vehicles. Select any node to inspect its links.
          </p>
        </div>
        <span className="ops-source">
          <i /> SYNTHETIC / MODELLED
        </span>
      </section>

      <CascadeReadinessDashboard />

      <div className="graph-toolbar">
        <label className="graph-search">
          <MapPin size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search roads, drains, facilities…"
            aria-label="Search graph nodes"
          />
        </label>
        <span className="graph-stage">
          <Activity size={14} /> STAGE {state.stage}/9 <i />{" "}
          {state.rainfallIntensityMmHr.toFixed(0)} mm/h
        </span>
        <button
          className="graph-run"
          onClick={() => (state.isRunning ? engine.pause() : engine.start())}
        >
          {state.isRunning ? "Pause scenario" : "Run scenario"}
        </button>
        <div className="graph-zoom" aria-label="Canvas zoom controls">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((value) => Math.max(0.42, value - 0.08))}
          >
            <Minus size={14} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom((value) => Math.min(1, value + 0.08))}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <section className="graph-canvas-shell" aria-label="PRAVAAH dependency graph canvas">
        <div className="graph-canvas-scroll">
          <div
            className="graph-canvas"
            style={{ width: canvasWidth * zoom, height: layout.height * zoom }}
          >
            <div
              className="graph-canvas-world"
              style={{ width: canvasWidth, height: layout.height, transform: `scale(${zoom})` }}
            >
              <svg
                className="graph-edges"
                viewBox={`0 0 ${canvasWidth} ${layout.height}`}
                aria-label="Labeled relationships between graph nodes"
              >
                {graph.edges.map((edge, index) => {
                  const from = positionById.get(edge.from);
                  const to = positionById.get(edge.to);
                  if (!from || !to || !matchingIds.has(edge.from) || !matchingIds.has(edge.to))
                    return null;
                  const path = edgePath(from, to);
                  const highlighted = relevantIds.has(edge.id);
                  const label = edge.relation;
                  const labelWidth = Math.max(48, label.length * 6 + 12);
                  const stagger = ((index % 3) - 1) * 12;
                  return (
                    <g
                      key={edge.id}
                      className={`graph-edge ${edge.dataClass} ${highlighted ? "highlighted" : ""} ${selected && !highlighted ? "dimmed" : ""}`}
                    >
                      <title>{`${edge.relation}: ${edge.rule}`}</title>
                      <path d={path.d} />
                      <rect
                        x={path.labelX - labelWidth / 2}
                        y={path.labelY - 9 + stagger}
                        width={labelWidth}
                        height={18}
                        rx={2}
                      />
                      <text x={path.labelX} y={path.labelY + 3 + stagger} textAnchor="middle">
                        {label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {layout.laneLabels.map((lane) => (
                <div
                  key={lane.kind}
                  className={`graph-lane-label ${lane.kind}`}
                  style={{ top: lane.y - 23 }}
                >
                  <span /> {lane.title}
                </div>
              ))}

              {layout.positioned.map(({ node, x, y }) => {
                const Icon = nodeIcon[node.kind];
                const selectedNode = node.id === selected?.id;
                const isConnected = connectedIds.has(node.id);
                const match = matchingIds.has(node.id);
                return (
                  <button
                    type="button"
                    key={node.id}
                    className={`graph-node ${node.kind} ${selectedNode ? "selected" : ""} ${isConnected ? "connected" : ""} ${!match ? "search-dimmed" : ""}`}
                    style={{ left: x, top: y }}
                    onClick={() => setSelectedId(selectedNode ? "" : node.id)}
                    aria-pressed={selectedNode}
                    title={`${node.label}. ${node.detail}. ${node.status}. Click to inspect connections.`}
                  >
                    <span className="graph-node-type">
                      <Icon size={14} /> {node.kind}
                    </span>
                    <strong>{node.label}</strong>
                    <small>{node.detail}</small>
                    <span className="graph-node-status">
                      <i /> {node.status} <b>{node.dataClass}</b>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <footer className="graph-canvas-footer">
          <div className="graph-legend">
            <span>
              <i className="modelled" /> Modelled link
            </span>
            <span>
              <i className="scenario" /> Scenario link
            </span>
            <span>
              <i className="selected" /> Selected chain
            </span>
          </div>
          <span>
            {matchingIds.size} / {graph.nodes.length} nodes · {graph.edges.length} links · scroll to
            explore
          </span>
        </footer>
      </section>

      {selected ? (
        <section className="graph-inspector" aria-live="polite">
          <div className="graph-inspector-main">
            <span className={`graph-inspector-type ${selected.kind}`}>{selected.kind}</span>
            <h2>{selected.label}</h2>
            <p>
              {selected.detail} · {selected.status}
            </p>
            <div className="cascade-inspector-actions">
              <Link
                to="/gis-explorer-3d"
                search={{
                  state: undefined,
                  layer: selected.layer,
                  lat: selected.coordinates?.[1],
                  lon: selected.coordinates?.[0],
                }}
              >
                <MapIcon size={15} /> Locate on GIS
              </Link>
              <Link to="/dashboard/emergency">
                Emergency workspace <ArrowRight size={14} />
              </Link>
            </div>
          </div>
          <div className="graph-inspector-links">
            <h3>
              Connected relationships <small>{relevant.length}</small>
            </h3>
            {relevant.length ? (
              relevant.map((edge: CascadeEdge) => {
                const downstream = edge.from === selected.id;
                const other = graph.nodes.find(
                  (node) => node.id === (downstream ? edge.to : edge.from),
                );
                return (
                  <article key={edge.id}>
                    <span>{downstream ? <ArrowRight size={14} /> : <ArrowLeft size={14} />}</span>
                    <div>
                      <b>{downstream ? edge.relation : `upstream · ${edge.relation}`}</b>
                      <small>{other?.label}</small>
                      <small>{edge.rule}</small>
                    </div>
                    <em>{edge.dataClass}</em>
                  </article>
                );
              })
            ) : (
              <p>No direct model relationship is attached to this entity.</p>
            )}
          </div>
        </section>
      ) : null}

      <section className="graph-method">
        <h2>How to read this graph</h2>
        {graph.assumptions.map((item) => (
          <p key={item}>
            <ArrowDown size={13} /> {item}
          </p>
        ))}
      </section>
      <footer className="ops-footer">
        Graph relationships are derived from named fixture fields and simulation rules. No verified
        live utility-dependency graph is connected.
      </footer>
    </main>
  );
}
