/** Stub: server copilot-data types (original lives in bhuniti) */
export interface DataResult {
  label: string;
  value: string;
  source?: string;
}

export interface EvidenceItem {
  kind: string;
  title: string;
  summary: string;
  source?: string;
  confidence?: number;
}
