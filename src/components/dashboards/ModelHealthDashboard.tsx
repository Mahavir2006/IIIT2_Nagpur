import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Database, FlaskConical, TriangleAlert } from "lucide-react";
import "./dashboards.css";

type Metric = {
  method: "last-hour-persistence" | "weekly-seasonal-naive" | "ridge-regression";
  horizonHours: number;
  n: number;
  maeMm: number | null;
  rmseMm: number | null;
  actualMeanMm: number | null;
  predictedMeanMm: number | null;
};

type EvaluationReport = {
  reportId: string;
  generatedAt: string;
  dataset: {
    path: string;
    sha256: string;
    rows: number;
    dataClass: string;
    provider: string;
    model: string;
    attributionUrl?: string;
    license?: string;
    licenseUrl?: string;
    location: { cityId: string; zoneId: string; latitude: number; longitude: number };
  };
  target: string;
  split: { method: string; testStart: string; testEndExclusive: string; priorContextHours: number };
  baselines: Array<{ id: string; description: string }>;
  metrics: Metric[];
  models?: Array<{
    id: string;
    method: string;
    ridgeLambda: number;
    trainingRowsByHorizon: Record<string, number>;
    features: string[];
    trainingPeriod: { start: string; endExclusive: string };
    metrics: Metric[];
    limitations: string[];
  }>;
  limitations: string[];
};

type EventMetricReport = {
  n: number;
  threshold: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  accuracy: number | null;
  truePositives: number;
  falsePositiveRate: number | null;
  falseNegativeRate: number | null;
  falsePositives: number;
  falseNegatives: number;
  brierScore: number | null;
  expectedCalibrationError: number | null;
  falseNegativeExamples: Array<{
    origin: string;
    actualNext24hMm: number;
    predictedProbability: number;
  }>;
};

type OnlineEvaluationReport = {
  reportId: string;
  generatedAt: string;
  dataScope: { geography: string; dataClass: string; provider: string; target: string };
  validation: {
    decisionThresholds: { rawProbability: number; calibratedProbability: number };
    validationSamples: number;
    validationPositiveEvents: number;
    decisionThresholdSelection: string;
  };
  models: {
    regression: {
      resultsByHorizon: Array<{
        horizonHours: number;
        n: number;
        maeMm: number;
        rmseMm: number;
        baselines: Record<string, { n: number; maeMm: number | null; rmseMm: number | null }>;
        conformalInterval: { nominalCoverage: number; empiricalCoverage: number | null };
      }>;
    };
    heavyRainEvent: {
      rawProbabilityMetrics: EventMetricReport;
      calibratedProbabilityMetrics: EventMetricReport;
    };
  };
  limitations: string[];
};

const methodLabel = (method: Metric["method"]) =>
  method === "last-hour-persistence"
    ? "Last-hour persistence"
    : method === "weekly-seasonal-naive"
      ? "Weekly seasonal naïve"
      : "Ridge autoregression";
const percentLabel = (value: number | null) =>
  value === null ? "—" : `${(value * 100).toFixed(1)}%`;

export function ModelHealthDashboard() {
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [onlineReport, setOnlineReport] = useState<OnlineEvaluationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/data/rainfall-baseline-2025.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("No generated evaluation report is published yet.");
        return (await response.json()) as EvaluationReport;
      })
      .then(setReport)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : "Evaluation report unavailable.");
      });
    void fetch("/data/river-online-rainfall-2025.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("No River online evaluation report has been published.");
        return (await response.json()) as OnlineEvaluationReport;
      })
      .then(setOnlineReport)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setOnlineError(
            cause instanceof Error ? cause.message : "Online evaluation report unavailable.",
          );
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="ops-page model-health-page">
      <header className="ops-top">
        <Link to="/dashboard" className="ops-brand">
          <ArrowLeft size={15} /> PRAVAAH <span>MODEL HEALTH</span>
        </Link>
        <div className="ops-top-actions">
          <Link to="/sources" className="ops-top-link">
            <Database size={14} /> Sources
          </Link>
          <Link to="/graph" className="ops-top-link">
            Cascade graph <ArrowRight size={14} />
          </Link>
        </div>
      </header>
      <section className="ops-intro">
        <div>
          <p className="ops-kicker">Rainfall baseline evaluation · Marine Lines, Mumbai</p>
          <h1>What has actually been measured.</h1>
          <p>
            Published results from a chronological holdout against historical ERA5 reanalysis. This
            is a weather baseline experiment, not flood-risk model performance.
          </p>
        </div>
        <span className="ops-source">
          <i /> REANALYSIS PROXY · NOT GAUGE VALIDATION
        </span>
      </section>
      {error && (
        <div className="replay-warning">
          <TriangleAlert size={17} />
          <p>{error}</p>
        </div>
      )}
      {report && (
        <>
          <section className="ops-kpis model-kpis" aria-label="Evaluation dataset summary">
            <article>
              <small>Held-out period</small>
              <strong>
                2025 <i>calendar year</i>
              </strong>
              <span>Chronological split · future data excluded from each origin</span>
            </article>
            <article>
              <small>Hourly archive rows</small>
              <strong>
                {report.dataset.rows.toLocaleString("en-IN")} <i>hours</i>
              </strong>
              <span>
                {report.dataset.model} · {report.dataset.dataClass.replaceAll("_", " ")}
              </span>
            </article>
            <article>
              <small>Forecast horizons</small>
              <strong>
                1 · 6 · 24 · 72 <i>hours</i>
              </strong>
              <span>Window-total precipitation in millimetres</span>
            </article>
            <article>
              <small>Source coordinates</small>
              <strong>{report.dataset.location.latitude.toFixed(3)}°N</strong>
              <span>{report.dataset.location.longitude.toFixed(3)}°E · one grid location</span>
            </article>
          </section>
          <section className="ops-panel evaluation-panel">
            <div className="ops-panel-head">
              <div>
                <h2>Rainfall benchmark errors</h2>
                <p>
                  Naïve baselines and a fitted ridge model · MAE and RMSE of horizon-total
                  precipitation; lower is better.
                </p>
              </div>
              <span>
                <FlaskConical size={14} /> MEASURED RUN
              </span>
            </div>
            <div className="evaluation-table" role="table" aria-label="Rainfall baseline metrics">
              <div className="evaluation-row evaluation-header" role="row">
                <span>Baseline</span>
                <span>Horizon</span>
                <span>Samples</span>
                <span>MAE · mm</span>
                <span>RMSE · mm</span>
              </div>
              {[...report.metrics, ...(report.models ?? []).flatMap((model) => model.metrics)].map(
                (metric) => (
                  <div
                    className="evaluation-row"
                    role="row"
                    key={`${metric.method}-${metric.horizonHours}`}
                  >
                    <strong>{methodLabel(metric.method)}</strong>
                    <span>{metric.horizonHours} h</span>
                    <span>{metric.n.toLocaleString("en-IN")}</span>
                    <span>{metric.maeMm?.toFixed(3) ?? "—"}</span>
                    <span>{metric.rmseMm?.toFixed(3) ?? "—"}</span>
                  </div>
                ),
              )}
            </div>
            <p className="evaluation-target">
              <b>Target:</b> {report.target}. <b>Split:</b> {report.split.testStart.slice(0, 10)}{" "}
              through {report.split.testEndExclusive.slice(0, 10)} (exclusive).
            </p>
          </section>
          {(report.models ?? []).map((model) => (
            <section className="ops-panel evaluation-provenance" key={model.id}>
              <div className="ops-panel-head">
                <div>
                  <h2>
                    {model.method} · {model.id}
                  </h2>
                  <p>
                    Train period {model.trainingPeriod.start.slice(0, 10)} to{" "}
                    {model.trainingPeriod.endExclusive.slice(0, 10)} (exclusive) · ridge λ=
                    {model.ridgeLambda}
                  </p>
                </div>
                <span>
                  {Object.values(model.trainingRowsByHorizon)[0]?.toLocaleString("en-IN")} training
                  origins / horizon
                </span>
              </div>
              <p>
                <b>Past-only features:</b> {model.features.join(", ")}
              </p>
              {model.limitations.map((limitation) => (
                <p key={limitation}>{limitation}</p>
              ))}
            </section>
          ))}
          <section className="evaluation-limits">
            <div>
              <TriangleAlert size={17} />
              <h2>Interpret with care</h2>
            </div>
            {report.limitations.map((limitation) => (
              <p key={limitation}>{limitation}</p>
            ))}
          </section>
          <section className="ops-panel evaluation-provenance">
            <div className="ops-panel-head">
              <div>
                <h2>Run provenance</h2>
                <p>
                  {report.reportId} · generated{" "}
                  {new Date(report.generatedAt).toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                  })}
                </p>
              </div>
              <span>{report.dataset.provider}</span>
            </div>
            <p>
              Dataset hash · <code>{report.dataset.sha256}</code>
            </p>
            <p>
              Dataset: <code>{report.dataset.path}</code> ·{" "}
              {report.dataset.rows.toLocaleString("en-IN")} rows · {report.dataset.model} reanalysis
            </p>
            {report.dataset.license && (
              <p>
                License: {report.dataset.license} ·{" "}
                <a href={report.dataset.licenseUrl} target="_blank" rel="noreferrer">
                  terms
                </a>{" "}
                ·{" "}
                <a href={report.dataset.attributionUrl} target="_blank" rel="noreferrer">
                  source documentation
                </a>
              </p>
            )}
            <a href="/data/rainfall-baseline-2025.json" target="_blank" rel="noreferrer">
              Open full machine-readable report <ArrowRight size={14} />
            </a>
          </section>
        </>
      )}
      {onlineError && (
        <div className="replay-warning">
          <TriangleAlert size={17} />
          <p>{onlineError}</p>
        </div>
      )}
      {onlineReport && (
        <>
          <section className="ops-panel evaluation-panel">
            <div className="ops-panel-head">
              <div>
                <h2>Online model replay · River 0.26.1</h2>
                <p>
                  {onlineReport.dataScope.geography} · {onlineReport.dataScope.provider} ·{" "}
                  {onlineReport.dataScope.dataClass.replaceAll("_", " ")}
                </p>
              </div>
              <span>
                <FlaskConical size={14} /> PREQUENTIAL HOLDOUT · NOT A FLOOD MODEL
              </span>
            </div>
            <p className="evaluation-target">
              {onlineReport.dataScope.target}. Validation chose thresholds on{" "}
              {onlineReport.validation.validationSamples.toLocaleString("en-IN")} prior-stream
              examples, including {onlineReport.validation.validationPositiveEvents} positive
              rainfall events. {onlineReport.validation.decisionThresholdSelection}.
            </p>
            <div
              className="evaluation-table"
              role="table"
              aria-label="Online rainfall regression comparison"
            >
              <div className="evaluation-row evaluation-header" role="row">
                <span>Model / baseline</span>
                <span>Horizon</span>
                <span>Samples</span>
                <span>MAE · mm</span>
                <span>RMSE · mm</span>
              </div>
              {onlineReport.models.regression.resultsByHorizon.flatMap((result) => [
                <div className="evaluation-row" role="row" key={`river-${result.horizonHours}`}>
                  <strong>River online SGD</strong>
                  <span>{result.horizonHours} h</span>
                  <span>{result.n.toLocaleString("en-IN")}</span>
                  <span>{result.maeMm.toFixed(3)}</span>
                  <span>{result.rmseMm.toFixed(3)}</span>
                </div>,
                ...Object.entries(result.baselines).map(([name, baseline]) => (
                  <div className="evaluation-row" role="row" key={`${name}-${result.horizonHours}`}>
                    <strong>{name.replaceAll("-", " ")}</strong>
                    <span>{result.horizonHours} h</span>
                    <span>{baseline.n.toLocaleString("en-IN")}</span>
                    <span>{baseline.maeMm?.toFixed(3) ?? "—"}</span>
                    <span>{baseline.rmseMm?.toFixed(3) ?? "—"}</span>
                  </div>
                )),
              ])}
            </div>
            <p className="evaluation-target">
              Rolling 90% conformal interval empirical coverage:{" "}
              {onlineReport.models.regression.resultsByHorizon
                .map(
                  (result) =>
                    `${result.horizonHours}h ${percentLabel(result.conformalInterval.empiricalCoverage)}`,
                )
                .join(" · ")}
              . These measured intervals under-cover in this holdout.
            </p>
          </section>
          <section className="ops-panel evaluation-panel">
            <div className="ops-panel-head">
              <div>
                <h2>Heavy-rain event classifier · false-negative audit</h2>
                <p>
                  Positive means the next 24-hour ERA5 rainfall total crosses the experiment's 64.5
                  mm threshold. This is not an observed flood outcome.
                </p>
              </div>
              <span>MEASURED · 2025 TEST YEAR</span>
            </div>
            <div
              className="evaluation-table"
              role="table"
              aria-label="Raw and calibrated heavy-rain event metrics"
            >
              <div className="evaluation-row evaluation-header" role="row">
                <span>Score stream</span>
                <span>Threshold</span>
                <span>Precision</span>
                <span>Recall</span>
                <span>FNR · FN</span>
              </div>
              {(
                [
                  [
                    "Raw probability",
                    onlineReport.models.heavyRainEvent.rawProbabilityMetrics,
                    onlineReport.validation.decisionThresholds.rawProbability,
                  ],
                  [
                    "Online-calibrated",
                    onlineReport.models.heavyRainEvent.calibratedProbabilityMetrics,
                    onlineReport.validation.decisionThresholds.calibratedProbability,
                  ],
                ] as const
              ).map(([name, metrics, threshold]) => (
                <div className="evaluation-row" role="row" key={name}>
                  <strong>{name}</strong>
                  <span>{threshold.toFixed(3)}</span>
                  <span>{percentLabel(metrics.precision)}</span>
                  <span>{percentLabel(metrics.recall)}</span>
                  <span>
                    {percentLabel(metrics.falseNegativeRate)} · {metrics.falseNegatives}
                  </span>
                </div>
              ))}
            </div>
            <p className="evaluation-target">
              Calibrated score:{" "}
              {onlineReport.models.heavyRainEvent.calibratedProbabilityMetrics.truePositives} hits ·{" "}
              {onlineReport.models.heavyRainEvent.calibratedProbabilityMetrics.falsePositives} false
              positives ·{" "}
              {onlineReport.models.heavyRainEvent.calibratedProbabilityMetrics.falseNegatives} false
              negatives · F1{" "}
              {onlineReport.models.heavyRainEvent.calibratedProbabilityMetrics.f1?.toFixed(3) ??
                "—"}{" "}
              · Brier{" "}
              {onlineReport.models.heavyRainEvent.calibratedProbabilityMetrics.brierScore?.toFixed(
                4,
              ) ?? "—"}{" "}
              · ECE{" "}
              {onlineReport.models.heavyRainEvent.calibratedProbabilityMetrics.expectedCalibrationError?.toFixed(
                4,
              ) ?? "—"}
              .
            </p>
            {onlineReport.models.heavyRainEvent.calibratedProbabilityMetrics.falseNegativeExamples
              .slice(0, 5)
              .map((example) => (
                <p className="evaluation-target" key={example.origin}>
                  Missed rainfall event ·{" "}
                  {new Date(example.origin).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} ·
                  actual {example.actualNext24hMm.toFixed(1)} mm · predicted p{" "}
                  {example.predictedProbability.toFixed(3)}
                </p>
              ))}
            <div className="evaluation-limits">
              <div>
                <TriangleAlert size={17} />
                <h2>Not suitable for alerting</h2>
              </div>
              {onlineReport.limitations.map((limitation) => (
                <p key={limitation}>{limitation}</p>
              ))}
            </div>
            <a href="/data/river-online-rainfall-2025.json" target="_blank" rel="noreferrer">
              Open full River evaluation report <ArrowRight size={14} />
            </a>
          </section>
        </>
      )}
      <footer className="ops-footer">
        PRAVAAH does not yet have verified flood outcome labels, validated risk-state probabilities,
        or measured warning lead time. Those metrics remain unavailable.
      </footer>
    </main>
  );
}
