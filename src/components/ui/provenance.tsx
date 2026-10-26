import type { EvidenceClass, ReliabilityClass, DataSourceRecord } from "@/data/data-sources";
import { EVIDENCE, RELIABILITY, STATUS_LABELS, getDataSource } from "@/data/data-sources";

export type CadastralBadgeKind = "real-cadastre" | "osm-non-cadastre" | "no-public-data";

const CADASTRE_BADGE_LABEL: Record<CadastralBadgeKind, string> = {
  "real-cadastre": "REAL CADASTRAL POLYGON",
  "osm-non-cadastre": "OSM NON-CADASTRAL POLYGON",
  "no-public-data": "NO PUBLIC DATA",
};

export function EvidenceBadge({ kind }: { kind: EvidenceClass }) {
  const info = EVIDENCE[kind];
  return (
    <span className={`pv-badge pv-evidence pv-${kind}`} title={info.description}>
      {info.label}
    </span>
  );
}

export function ReliabilityBadge({ cls }: { cls: ReliabilityClass }) {
  const info = RELIABILITY[cls];
  return (
    <span className={`pv-badge pv-reliability pv-class-${cls}`} title={info.description}>
      <b>{cls}</b> {info.short}
    </span>
  );
}

export function CadastreBadge({ kind }: { kind: CadastralBadgeKind }) {
  return <span className={`pv-badge pv-cadastre pv-${kind}`}>{CADASTRE_BADGE_LABEL[kind]}</span>;
}

export function EvidenceDescription({ kind }: { kind: EvidenceClass }) {
  return <p className="pv-evidence-desc">{EVIDENCE[kind].description}</p>;
}

export function ProvenanceRows({ source }: { source: DataSourceRecord }) {
  const rows: Array<[string, string]> = [
    ["Provider", source.provider],
    ...(source.upstream ? ([["Upstream", source.upstream]] as Array<[string, string]>) : []),
    ...(source.license ? ([["License", source.license]] as Array<[string, string]>) : []),
    ...(source.spatialResolution
      ? ([["Resolution", source.spatialResolution]] as Array<[string, string]>)
      : []),
    ...(source.temporalCoverage
      ? ([["Period", source.temporalCoverage]] as Array<[string, string]>)
      : []),
    ["Coverage", source.geography],
    ["Status", STATUS_LABELS[source.status]],
    ...(source.lastVerified
      ? ([["Verified", source.lastVerified]] as Array<[string, string]>)
      : []),
  ];
  return (
    <dl className="insight-rows pv-rows">
      {rows.map(([k, v]) => (
        <div key={k} style={{ gridColumn: "1 / -1" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
      <div style={{ gridColumn: "1 / -1" }}>
        <dt>Limitations</dt>
        <dd>{source.limitations}</dd>
      </div>
    </dl>
  );
}

export function SourceProvenance({ sourceId }: { sourceId: string | null | undefined }) {
  const source = sourceId ? getDataSource(sourceId) : undefined;
  if (!source) return null;
  return (
    <section className="insight-section pv-panel" aria-label="Data provenance">
      <div className="pv-badges">
        <ReliabilityBadge cls={source.reliabilityClass} />
        <EvidenceBadge kind={source.reliabilityClass === "F" ? "synthetic" : "observed"} />
      </div>
      <ProvenanceRows source={source} />
    </section>
  );
}

/** Badge set + honesty line for whatever parcel geometry is selected. */
export function ParcelProvenance({
  sourceId,
  hasSurveyNumber,
}: {
  sourceId: string | null | undefined;
  hasSurveyNumber: boolean;
}) {
  const source = sourceId ? getDataSource(sourceId) : undefined;
  const kind: CadastralBadgeKind =
    source?.category === "CADASTRAL"
      ? "real-cadastre"
      : source
        ? "osm-non-cadastre"
        : "no-public-data";
  return (
    <section className="insight-section pv-panel" aria-label="Parcel provenance">
      <div className="pv-badges">
        <CadastreBadge kind={kind} />
        <EvidenceBadge kind="observed" />
        {source && <ReliabilityBadge cls={source.reliabilityClass} />}
      </div>
      {!hasSurveyNumber && (
        <p className="pv-honesty">
          Survey number not present in this source — verify the 7/12 extract at the Tehsil office
          before any legal use.
        </p>
      )}
      {source && <ProvenanceRows source={source} />}
    </section>
  );
}
