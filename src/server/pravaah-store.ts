import { DatabaseSync } from "node:sqlite";
import fs from "node:fs/promises";
import path from "node:path";
import { getRuntimeConfig } from "./runtime-config";

export type RiskLevel = "NORMAL" | "WATCH" | "HIGH_RISK" | "CRITICAL";

export interface PravaahRiskAssessmentRecord {
  id: string;
  area: string;
  level: RiskLevel;
  score: number;
  evidence: string[];
  sources: string[];
  generatedAt: string;
  projections: Array<{
    horizonHours: number;
    riskLevel: RiskLevel;
    score: number;
    peakRainMmHr: number;
    totalRainMm: number;
    evidence: string[];
  }>;
}

export interface PravaahAlertRecord {
  id: string;
  level: RiskLevel;
  title: string;
  summary: string;
  source: string;
  area: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface PravaahEventRecord {
  id: string;
  type: string;
  level: RiskLevel;
  title: string;
  summary: string;
  source: string;
  area: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface PravaahIngestRunRecord {
  id: string;
  source: string;
  status: "success" | "failed" | "partial";
  startedAt: string;
  finishedAt: string;
  metadata?: Record<string, unknown>;
}

export interface PravaahStoreState {
  schemaVersion: number;
  generatedAt: string;
  riskAssessments: PravaahRiskAssessmentRecord[];
  alerts: PravaahAlertRecord[];
  events: PravaahEventRecord[];
  ingestRuns: PravaahIngestRunRecord[];
}

const STORE_FILE_NAME = "pravaah.db";
let cachedDb: DatabaseSync | undefined;

function ensureDatabase(): DatabaseSync {
  if (cachedDb) return cachedDb;

  const config = getRuntimeConfig();
  const dir = path.resolve(config.dataDir);
  fs.mkdir(dir, { recursive: true }).catch(() => undefined);

  const dbPath = path.join(dir, STORE_FILE_NAME);
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS risk_assessments (
      id TEXT PRIMARY KEY,
      area TEXT NOT NULL,
      level TEXT NOT NULL,
      score REAL NOT NULL,
      evidence TEXT NOT NULL,
      sources TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      projections TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      source TEXT NOT NULL,
      area TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      level TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      source TEXT NOT NULL,
      area TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata TEXT
    );
    CREATE TABLE IF NOT EXISTS ingest_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      metadata TEXT
    );
  `);

  cachedDb = db;
  return db;
}

function parseJsonArray<T>(value: string | null | undefined, fallback: T[]): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

async function readStore(): Promise<PravaahStoreState> {
  const db = ensureDatabase();

  const riskAssessments = db.prepare("SELECT * FROM risk_assessments ORDER BY generated_at DESC").all() as Array<{
    id: string;
    area: string;
    level: string;
    score: number;
    evidence: string;
    sources: string;
    generated_at: string;
    projections: string;
  }>;

  const alerts = db.prepare("SELECT * FROM alerts ORDER BY created_at DESC").all() as Array<{
    id: string;
    level: string;
    title: string;
    summary: string;
    source: string;
    area: string;
    created_at: string;
    metadata?: string | null;
  }>;

  const events = db.prepare("SELECT * FROM events ORDER BY created_at DESC").all() as Array<{
    id: string;
    type: string;
    level: string;
    title: string;
    summary: string;
    source: string;
    area: string;
    created_at: string;
    metadata?: string | null;
  }>;

  const ingestRuns = db.prepare("SELECT * FROM ingest_runs ORDER BY finished_at DESC").all() as Array<{
    id: string;
    source: string;
    status: string;
    started_at: string;
    finished_at: string;
    metadata?: string | null;
  }>;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    riskAssessments: riskAssessments.map((row) => ({
      id: row.id,
      area: row.area,
      level: row.level as RiskLevel,
      score: Number(row.score),
      evidence: parseJsonArray<string>(row.evidence, []),
      sources: parseJsonArray<string>(row.sources, []),
      generatedAt: row.generated_at,
      projections: parseJsonArray<PravaahRiskAssessmentRecord["projections"][number]>(
        row.projections,
        [],
      ),
    })),
    alerts: alerts.map((row) => ({
      id: row.id,
      level: row.level as RiskLevel,
      title: row.title,
      summary: row.summary,
      source: row.source,
      area: row.area,
      createdAt: row.created_at,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    })),
    events: events.map((row) => ({
      id: row.id,
      type: row.type,
      level: row.level as RiskLevel,
      title: row.title,
      summary: row.summary,
      source: row.source,
      area: row.area,
      createdAt: row.created_at,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    })),
    ingestRuns: ingestRuns.map((row) => ({
      id: row.id,
      source: row.source,
      status: row.status as "success" | "failed" | "partial",
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      metadata: row.metadata ? (JSON.parse(row.metadata) as Record<string, unknown>) : undefined,
    })),
  };
}

export async function listRiskAssessments(limit = 20): Promise<PravaahRiskAssessmentRecord[]> {
  const store = await readStore();
  return store.riskAssessments.slice(0, limit);
}

export async function listAlerts(limit = 50): Promise<PravaahAlertRecord[]> {
  const store = await readStore();
  return store.alerts.slice(0, limit);
}

export async function listEvents(limit = 50): Promise<PravaahEventRecord[]> {
  const store = await readStore();
  return store.events.slice(0, limit);
}

export async function listIngestRuns(limit = 20): Promise<PravaahIngestRunRecord[]> {
  const store = await readStore();
  return store.ingestRuns.slice(0, limit);
}

export async function recordRiskAssessment(
  input: Omit<PravaahRiskAssessmentRecord, "id" | "generatedAt"> & { id?: string },
): Promise<PravaahRiskAssessmentRecord> {
  const db = ensureDatabase();
  const record: PravaahRiskAssessmentRecord = {
    id: input.id ?? `risk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    area: input.area,
    level: input.level,
    score: Number(input.score),
    evidence: input.evidence,
    sources: input.sources,
    generatedAt: new Date().toISOString(),
    projections: input.projections,
  };

  db.prepare(
    `INSERT INTO risk_assessments (id, area, level, score, evidence, sources, generated_at, projections)
     VALUES (@id, @area, @level, @score, @evidence, @sources, @generatedAt, @projections)
     ON CONFLICT(id) DO UPDATE SET
       area = excluded.area,
       level = excluded.level,
       score = excluded.score,
       evidence = excluded.evidence,
       sources = excluded.sources,
       generated_at = excluded.generated_at,
       projections = excluded.projections`,
  ).run({
    id: record.id,
    area: record.area,
    level: record.level,
    score: record.score,
    evidence: JSON.stringify(record.evidence),
    sources: JSON.stringify(record.sources),
    generatedAt: record.generatedAt,
    projections: JSON.stringify(record.projections),
  });

  if (record.level === "HIGH_RISK" || record.level === "CRITICAL") {
    db.prepare(
      `INSERT INTO alerts (id, level, title, summary, source, area, created_at, metadata)
       VALUES (@id, @level, @title, @summary, @source, @area, @createdAt, @metadata)`,
    ).run({
      id: `alert-${Date.now()}`,
      level: record.level,
      title: `${record.level} risk detected in ${record.area}`,
      summary: record.evidence.join("; "),
      source: "risk-assessment",
      area: record.area,
      createdAt: new Date().toISOString(),
      metadata: JSON.stringify({ score: record.score }),
    });
  }

  db.prepare(
    `INSERT INTO events (id, type, level, title, summary, source, area, created_at, metadata)
     VALUES (@id, @type, @level, @title, @summary, @source, @area, @createdAt, @metadata)`,
  ).run({
    id: `event-risk-${Date.now()}`,
    type: "risk-update",
    level: record.level,
    title: `Risk score ${record.score} for ${record.area}`,
    summary: record.evidence.join("; "),
    source: "risk-assessment",
    area: record.area,
    createdAt: new Date().toISOString(),
    metadata: JSON.stringify({ score: record.score }),
  });

  return record;
}

export const storeRiskAssessment = recordRiskAssessment;

export async function recordAlert(
  input: Omit<PravaahAlertRecord, "id" | "createdAt"> & { id?: string },
): Promise<PravaahAlertRecord> {
  const db = ensureDatabase();
  const alert: PravaahAlertRecord = {
    id: input.id ?? `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    level: input.level,
    title: input.title,
    summary: input.summary,
    source: input.source,
    area: input.area,
    createdAt: new Date().toISOString(),
    metadata: input.metadata,
  };

  db.prepare(
    `INSERT INTO alerts (id, level, title, summary, source, area, created_at, metadata)
     VALUES (@id, @level, @title, @summary, @source, @area, @createdAt, @metadata)`,
  ).run({
    id: alert.id,
    level: alert.level,
    title: alert.title,
    summary: alert.summary,
    source: alert.source,
    area: alert.area,
    createdAt: alert.createdAt,
    metadata: alert.metadata ? JSON.stringify(alert.metadata) : null,
  });

  return alert;
}

export async function recordEvent(
  input: Omit<PravaahEventRecord, "id" | "createdAt"> & { id?: string },
): Promise<PravaahEventRecord> {
  const db = ensureDatabase();
  const event: PravaahEventRecord = {
    id: input.id ?? `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    level: input.level,
    title: input.title,
    summary: input.summary,
    source: input.source,
    area: input.area,
    createdAt: new Date().toISOString(),
    metadata: input.metadata,
  };

  db.prepare(
    `INSERT INTO events (id, type, level, title, summary, source, area, created_at, metadata)
     VALUES (@id, @type, @level, @title, @summary, @source, @area, @createdAt, @metadata)`,
  ).run({
    id: event.id,
    type: event.type,
    level: event.level,
    title: event.title,
    summary: event.summary,
    source: event.source,
    area: event.area,
    createdAt: event.createdAt,
    metadata: event.metadata ? JSON.stringify(event.metadata) : null,
  });

  return event;
}

export async function recordIngestRun(
  input: Omit<PravaahIngestRunRecord, "id" | "startedAt" | "finishedAt"> & { id?: string },
): Promise<PravaahIngestRunRecord> {
  const db = ensureDatabase();
  const record: PravaahIngestRunRecord = {
    id: input.id ?? `ingest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source: input.source,
    status: input.status,
    startedAt: input.startedAt ?? new Date().toISOString(),
    finishedAt: input.finishedAt ?? new Date().toISOString(),
    metadata: input.metadata,
  };

  db.prepare(
    `INSERT INTO ingest_runs (id, source, status, started_at, finished_at, metadata)
     VALUES (@id, @source, @status, @startedAt, @finishedAt, @metadata)`,
  ).run({
    id: record.id,
    source: record.source,
    status: record.status,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    metadata: record.metadata ? JSON.stringify(record.metadata) : null,
  });

  return record;
}

export async function getStoreSummary() {
  const db = ensureDatabase();
  const risk = db.prepare("SELECT COUNT(*) AS count FROM risk_assessments").get() as { count: number };
  const alerts = db.prepare("SELECT COUNT(*) AS count FROM alerts").get() as { count: number };
  const events = db.prepare("SELECT COUNT(*) AS count FROM events").get() as { count: number };
  const ingestRuns = db.prepare("SELECT COUNT(*) AS count FROM ingest_runs").get() as { count: number };
  const latestRisk = db.prepare("SELECT generated_at FROM risk_assessments ORDER BY generated_at DESC LIMIT 1").get() as { generated_at?: string } | undefined;
  const latestAlert = db.prepare("SELECT level FROM alerts ORDER BY created_at DESC LIMIT 1").get() as { level?: string } | undefined;

  return {
    totalRiskAssessments: risk.count,
    totalAlerts: alerts.count,
    totalEvents: events.count,
    totalIngestRuns: ingestRuns.count,
    lastGeneratedAt: latestRisk?.generated_at ?? null,
    latestAlertLevel: latestAlert?.level ?? null,
  };
}
