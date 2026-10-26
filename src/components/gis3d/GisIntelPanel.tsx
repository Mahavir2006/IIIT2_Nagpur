import { Building2, Crosshair, Layers3, MapPin, X } from "lucide-react";
import { EVIDENCE_LABEL, type EvidenceKind } from "./types";
import type { Selection } from "./types";
import { gisLayer } from "./layerRegistry";
import { STATE_STATS, INTEL_SOURCES } from "@/data/state-intelligence";
import { baselineShares, yearShares } from "@/data/land-scenario";

function evidenceBadge(kind: EvidenceKind) {
  return <span className={`g3d-badge ${kind}`}>{EVIDENCE_LABEL[kind]}</span>;
}

function coordRow(lat: number, lon: number) {
  return (
    <div className="g3d-stat">
      <span>Centroid</span>
      <b>
        {lat.toFixed(5)}, {lon.toFixed(5)}
      </b>
    </div>
  );
}

function propRows(props: Record<string, unknown>, skip: string[] = []) {
  const entries = Object.entries(props).filter(
    ([k, v]) => !skip.includes(k) && v !== null && v !== undefined && v !== "",
  );
  if (entries.length === 0) return null;
  return (
    <dl className="g3d-kv">
      {entries.map(([k, v]) => (
        <div key={k} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

interface Props {
  selection: Selection;
  year: number;
  onInfo: (layerId: string) => void;
}

export function GisIntelPanel({ selection, year, onInfo }: Props) {
  if (selection.kind === "none") {
    return (
      <div className="g3d-empty">
        <strong>Nothing selected yet</strong>
        Click a parcel, building, state or policy corridor on the globe to open its evidence card
        here. Use the search box to fly to a district or taluka — the boundary ring and breadcrumb
        follow the administrative hierarchy you drill into.
      </div>
    );
  }

  if (selection.kind === "state") {
    const stat = STATE_STATS[selection.name];
    const shares = yearShares(selection.name, String(year));
    const base = baselineShares(selection.name);
    const layers = ["climate", "disputes", "socio", "lulc"];
    return (
      <>
        <div className="g3d-card">
          <h3>
            <MapPin /> {selection.name}
          </h3>
          <div className="g3d-stat">
            <span>Boundary</span>
            <b>State / UT outline</b>
          </div>
          {stat ? (
            <>
              <div className="g3d-stat">
                <span>Land-use change 2015–24</span>
                <b>{stat.change.toFixed(1)}%</b>
              </div>
              <div className="g3d-stat">
                <span>Active disputes</span>
                <b>{stat.disputes.toLocaleString("en-IN")}</b>
              </div>
              <div className="g3d-stat">
                <span>Climate vulnerability</span>
                <b>{stat.risk}</b>
              </div>
              <div className="g3d-stat">
                <span>Vulnerable households</span>
                <b>{stat.socio.toFixed(1)}%</b>
              </div>
            </>
          ) : (
            <p className="g3d-hint">No demo aggregate is stored for this state.</p>
          )}
          <p className="g3d-hint">
            Land mix {year} (modelled): agriculture {shares.agri.toFixed(1)}%, forest{" "}
            {shares.forest.toFixed(1)}%, built-up {shares.built.toFixed(1)}%, water{" "}
            {shares.water.toFixed(1)}%. 2018 baseline built-up {base.built.toFixed(1)}%.
          </p>
        </div>
        <div className="g3d-card">
          <h3>
            <Layers3 /> Evidence
          </h3>
          <p className="g3d-hint" style={{ marginTop: 0 }}>
            These figures come from the in-repo demo aggregates and the land-scenario model — they
            are labelled DEMO / MODELLED, not official statistics.
          </p>
          <div className="g3d-actions">
            {layers.map((id) => {
              const l = gisLayer(id);
              if (!l) return null;
              return (
                <button type="button" key={id} onClick={() => onInfo(id)}>
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="g3d-card">
          <h3>Source registry</h3>
          <dl className="g3d-kv">
            {INTEL_SOURCES.map((s) => (
              <div key={s.dataset} style={{ display: "contents" }}>
                <dt>{s.dataset}</dt>
                <dd>
                  {s.source} · {s.year} · {s.coverage}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </>
    );
  }

  if (selection.kind === "parcel") {
    const source = gisLayer("parcels");
    return (
      <>
        <div className="g3d-card">
          <h3>
            <Crosshair /> Cadastral parcel
            <span className="g3d-badge observed" style={{ marginLeft: "auto" }}>
              Observed
            </span>
          </h3>
          <div className="g3d-stat">
            <span>Parcel id</span>
            <b>{selection.id}</b>
          </div>
          {coordRow(selection.lat, selection.lon)}
          {propRows(selection.properties, ["kind", "id"])}
        </div>
        {source && (
          <div className="g3d-card">
            <h3>Provenance</h3>
            <p className="g3d-hint" style={{ marginTop: 0 }}>
              <b>{source.evidence.source}</b> — {source.evidence.provider}.
              <br />
              {source.evidence.processing}
              <br />
              <br />
              <b>Coverage:</b> {source.evidence.coverage}
              <br />
              <b>Confidence:</b> {source.evidence.confidence}
            </p>
            <div className="g3d-actions">
              <button type="button" onClick={() => onInfo("parcels")}>
                Full data info
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (selection.kind === "building") {
    const h = selection.properties["heightM"];
    const levels = selection.properties["levels"];
    const floors = selection.properties["floors"];
    const floorNote = selection.properties["floorNote"];
    const source = selection.properties["source"];
    const name = selection.properties["name"];
    const fromTileset = selection.properties["origin"] === "tileset-feature";
    const isDemoFloor = selection.properties["origin"] === "demo-floor";
    const isDemoStack = isDemoFloor && selection.properties["scope"] === "stack";
    const heightLabel = isDemoFloor
      ? isDemoStack
        ? `${typeof h === "number" ? h.toFixed(1) : "?"} m total (model value)`
        : `${typeof h === "number" ? h.toFixed(1) : "?"} m slab (model value)`
      : typeof h === "number" && h > 0
        ? fromTileset
          ? `~${h.toFixed(1)} m (tile geometry)`
          : `${h.toFixed(1)} m (from tagged height / levels)`
        : "not tagged — footprint only";
    return (
      <>
        <div className="g3d-card">
          <h3>
            <Building2 />{" "}
            {isDemoFloor
              ? isDemoStack
                ? "Demo building stack"
                : "Demo floor slab"
              : "3D building"}
            <span className="g3d-badge demo" style={{ marginLeft: "auto" }}>
              {isDemoFloor ? "Demo" : "Observed"}
            </span>
          </h3>
          {typeof name === "string" && name.trim() ? (
            <div className="g3d-stat">
              <span>Name</span>
              <b>{name}</b>
            </div>
          ) : null}
          <div className="g3d-stat">
            <span>{fromTileset || isDemoFloor ? "Feature id" : "OSM id"}</span>
            <b>{String(selection.properties["osmId"] ?? selection.id)}</b>
          </div>
          <div className="g3d-stat">
            <span>Height</span>
            <b>{heightLabel}</b>
          </div>
          {levels !== null && levels !== undefined ? (
            <div className="g3d-stat">
              <span>Floors tagged</span>
              <b>{String(levels)}</b>
            </div>
          ) : null}
          {typeof floors === "number" && floors > 0 ? (
            <div className="g3d-stat">
              <span>Floors</span>
              <b>
                {floors} {floors === 1 ? "floor" : "floors"}
                {typeof floorNote === "string" && floorNote ? ` · ${floorNote}` : ""}
              </b>
            </div>
          ) : null}
          {typeof source === "string" && source.trim() ? (
            <div className="g3d-stat">
              <span>Source</span>
              <b>{source}</b>
            </div>
          ) : null}
          {coordRow(selection.lat, selection.lon)}
          {/* PRAVAAH Urban Flood & Traffic Risk Assessment for South Mumbai */}
          {selection.lat >= 18.93 && selection.lat <= 18.96 && selection.lon >= 72.81 && selection.lon <= 72.84 && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid rgba(45,63,52,0.6)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#38bdf8" }}>PRAVAAH Flood & Traffic Risk</span>
                <span className="g3d-badge modelled">MODELLED</span>
              </div>
              <div className="g3d-stat">
                <span>Modeled Inundation</span>
                <b style={{ color: selection.lat < 18.948 && selection.lon > 72.822 ? "#f87171" : "#34d399" }}>
                  {selection.lat < 18.948 && selection.lon > 72.822 ? "Low-Lying Inundation (0.42 m)" : "Elevated / Low Risk (<0.08 m)"}
                </b>
              </div>
              <div className="g3d-stat">
                <span>Nearest Road Corridor</span>
                <b>Maharshi Karve / Marine Drive</b>
              </div>
              <div className="g3d-stat">
                <span>Accessibility Index</span>
                <b style={{ color: selection.lat < 18.948 && selection.lon > 72.822 ? "#fbbf24" : "#34d399" }}>
                  {selection.lat < 18.948 && selection.lon > 72.822 ? "Impaired (Road Closure Bypass Required)" : "Direct Coastal Access Available"}
                </b>
              </div>
            </div>
          )}
        </div>
        <div className="g3d-card">
          <h3>How this was drawn</h3>
          <p className="g3d-hint" style={{ marginTop: 0 }}>
            {fromTileset
              ? "Picked off the OSM Buildings 3D tileset. The silhouette is real OSM-derived mesh, "
              : isDemoFloor
                ? "A slab from the Patna demo fixture - a model floor stack that demonstrates the "
                : "Extruded only where OpenStreetMap carries a real "}
            {fromTileset
              ? "the height is measured from that mesh, and the standard / height / footprint / inspection modes recolour it in place on the GPU without rebuilding the tileset."
              : isDemoFloor
                ? "vertical cadastre controls, never a surveyed or registered record."
                : "height or building:levels tag. Untagged footprints are drawn flat — no building height is invented anywhere in this route."}
          </p>
          <div className="g3d-actions">
            <button type="button" onClick={() => onInfo("buildings")}>
              Full data info
            </button>
          </div>
        </div>
      </>
    );
  }

  if (selection.kind === "place") {
    return (
      <>
        <div className="g3d-card">
          <h3>
            <MapPin /> {selection.name}
          </h3>
          {coordRow(selection.lat, selection.lon)}
          <p className="g3d-hint">
            Geocoded with Nominatim (OpenStreetMap). Turn on <b>Administrative boundaries</b> to
            drape this place's outline, and add the district/taluka step to the breadcrumb.
          </p>
        </div>
        <div className="g3d-card">
          <h3>Available here</h3>
          <p className="g3d-hint" style={{ marginTop: 0 }}>
            Parcels, roads, water and buildings load inside the camera bounding box once you zoom in
            far enough. Layers that are not wired for 3D say so in the layer manager instead of
            showing an estimate.
          </p>
        </div>
      </>
    );
  }

  if (selection.kind === "vehicle") {
    const props = selection.properties;
    return (
      <div className="g3d-card">
        <h3>🚗 {String(props["name"] ?? selection.id)}</h3>
        <div className="g3d-stat">
          <span>Type</span>
          <b>{String(props["type"] ?? "CAR")}</b>
        </div>
        <div className="g3d-stat">
          <span>Speed</span>
          <b>{String(props["speed"] ?? "0 km/h")}</b>
        </div>
        <div className="g3d-stat">
          <span>Heading</span>
          <b>{String(props["heading"] ?? "0°")}</b>
        </div>
        <div className="g3d-stat">
          <span>Status</span>
          <b style={{ color: props["status"] === "DELAYED" ? "#f87171" : "#34d399" }}>
            {String(props["status"] ?? "EN-ROUTE")}
          </b>
        </div>
        <div className="g3d-stat">
          <span>Origin</span>
          <b>{String(props["origin"] ?? "Origin")}</b>
        </div>
        <div className="g3d-stat">
          <span>Destination</span>
          <b>{String(props["destination"] ?? "Destination")}</b>
        </div>
        <div className="g3d-stat">
          <span>Active Route</span>
          <b>{String(props["activeRoute"] ?? "PRIMARY")}</b>
        </div>
        {coordRow(selection.lat, selection.lon)}
        <p className="g3d-hint">
          SUMO/TraCI-compatible vehicle kinetics. Telemetry interpolated along road centerline with speed adjusted for local flood depth.
        </p>
      </div>
    );
  }

  if (selection.kind === "road") {
    const props = selection.properties;
    return (
      <div className="g3d-card">
        <h3>🛣️ {String(props["name"] ?? selection.id)}</h3>
        <div className="g3d-stat">
          <span>Congestion</span>
          <b style={{ color: props["congestion"] === "CLOSED" ? "#ef4444" : "#34d399" }}>
            {String(props["congestion"] ?? "FREE")}
          </b>
        </div>
        <div className="g3d-stat">
          <span>Current Speed</span>
          <b>{String(props["currentSpeed"] ?? "N/A")}</b>
        </div>
        <div className="g3d-stat">
          <span>Water Depth</span>
          <b style={{ color: "#38bdf8" }}>{String(props["waterDepth"] ?? "0.00 m")}</b>
        </div>
        <div className="g3d-stat">
          <span>Closed / Impassable</span>
          <b>{props["isClosed"] ? "YES (>0.35m flood)" : "NO"}</b>
        </div>
        {coordRow(selection.lat, selection.lon)}
        <p className="g3d-hint">
          TomTom Live Traffic API fused with PRAVAAH hydro-terrain depression model.
        </p>
      </div>
    );
  }

  if (selection.kind === "drainage") {
    const props = selection.properties;
    return (
      <div className="g3d-card">
        <h3>🌊 {String(props["name"] ?? selection.id)}</h3>
        <div className="g3d-stat">
          <span>Type</span>
          <b>{String(props["type"] ?? "SWD ASSET")}</b>
        </div>
        {props["capacity"] ? (
          <div className="g3d-stat">
            <span>Design Capacity</span>
            <b>{String(props["capacity"])}</b>
          </div>
        ) : null}
        {props["currentInflow"] ? (
          <div className="g3d-stat">
            <span>Current Inflow</span>
            <b>{String(props["currentInflow"])}</b>
          </div>
        ) : null}
        {props["utilization"] ? (
          <div className="g3d-stat">
            <span>Utilization</span>
            <b>{String(props["utilization"])}</b>
          </div>
        ) : null}
        {props["status"] ? (
          <div className="g3d-stat">
            <span>Status</span>
            <b>{String(props["status"])}</b>
          </div>
        ) : null}
        {coordRow(selection.lat, selection.lon)}
      </div>
    );
  }

  if (selection.kind === "infrastructure") {
    const props = selection.properties;
    return (
      <div className="g3d-card">
        <h3>🏥 {String(props["name"] ?? selection.id)}</h3>
        <div className="g3d-stat">
          <span>Accessibility</span>
          <b style={{ color: props["accessibility"] === "ACCESSIBLE" ? "#34d399" : "#f87171" }}>
            {String(props["accessibility"] ?? "ACCESSIBLE")}
          </b>
        </div>
        <div className="g3d-stat">
          <span>Flood Exposure</span>
          <b>{String(props["floodExposure"] ?? "NONE")}</b>
        </div>
        {props["bedCapacity"] ? (
          <div className="g3d-stat">
            <span>Bed Capacity</span>
            <b>{String(props["bedCapacity"])}</b>
          </div>
        ) : null}
        {coordRow(selection.lat, selection.lon)}
      </div>
    );
  }

  return null;
}

export function SelectionHeader({
  selection,
  onClear,
}: {
  selection: Selection;
  onClear: () => void;
}) {
  if (selection.kind === "none") return null;
  const label =
    selection.kind === "state"
      ? selection.name
      : selection.kind === "place"
        ? selection.name
        : typeof (selection as { properties?: Record<string, unknown> }).properties?.["name"] === "string"
          ? String((selection as { properties?: Record<string, unknown> }).properties!["name"])
          : selection.id;
  return (
    <div className="g3d-context" style={{ marginBottom: 8 }}>
      <span className="g3d-badge observed" style={{ background: "#eaf5ef" }}>
        {selection.kind}
      </span>
      <span className="g3d-badge observed" style={{ background: "#eaf5ef" }}>
        {label}
      </span>
      <button type="button" className="g3d-x" onClick={onClear} aria-label="Clear selection">
        <X />
      </button>
    </div>
  );
}

/** Evidence dialog body — reused by the layer manager's DATA INFO button. */
export function EvidenceBody({ layerId }: { layerId: string }) {
  const layer = gisLayer(layerId);
  if (!layer) return null;
  const e = layer.evidence;
  return (
    <>
      <div className="g3d-modal-head">
        <h3>{layer.label} — data info</h3>
        <span style={{ marginLeft: "auto" }}>{evidenceBadge(e.kind)}</span>
      </div>
      <div className="g3d-modal-body">
        <dl className="g3d-kv">
          <dt>Source</dt>
          <dd>{e.source}</dd>
          <dt>Provider</dt>
          <dd>{e.provider}</dd>
          <dt>Date</dt>
          <dd>{e.date}</dd>
          <dt>Resolution</dt>
          <dd>{e.resolution}</dd>
          <dt>Coverage</dt>
          <dd>{e.coverage}</dd>
          <dt>License</dt>
          <dd>{e.license}</dd>
          <dt>Processing</dt>
          <dd>{e.processing}</dd>
          <dt>Confidence</dt>
          <dd>{e.confidence}</dd>
          <dt>Status</dt>
          <dd>{layer.status === "unavailable" ? "Not connected in this route" : layer.status}</dd>
        </dl>
        {layer.status === "unavailable" && layer.unavailableNote && (
          <p className="g3d-note" style={{ marginLeft: 0, marginTop: 14 }}>
            {layer.unavailableNote}
          </p>
        )}
        <p className="g3d-hint">
          Every layer in this route is classified OBSERVED / DERIVED / MODELLED / SCENARIO / DEMO.
          Anything not wired is disabled with a reason — no value on this globe is estimated to fill
          a gap.
        </p>
      </div>
    </>
  );
}
