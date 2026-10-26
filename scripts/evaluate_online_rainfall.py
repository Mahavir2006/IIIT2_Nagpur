#!/usr/bin/env python3
"""Leakage-safe River online rainfall model replay for PRAVAAH.

The target is ERA5 reanalysis rainfall at Marine Lines, not observed flooding.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import statistics
import sys
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from river import drift, linear_model, optim, preprocessing

HORIZONS = (1, 6, 24, 72)
FEATURE_COLUMNS = (
    "rain_lag_1h_mm",
    "rain_sum_prev_6h_mm",
    "rain_sum_prev_24h_mm",
    "rain_sum_prev_72h_mm",
    "origin_local_hour_ist",
    "origin_month_ist",
)
HEAVY_RAIN_24H_MM = 64.5
MAX_VALID_HOURLY_RAIN_MM = 500.0
CALIBRATION_BINS = 10
CONFORMAL_WINDOW = 5000
MIN_CONFORMAL_SAMPLES = 100
MIN_ROWS_BEFORE_TEST_HOURS = 24 * 90


class NowClock:
    """Guard labels by their event-time availability."""

    def __init__(self, now: datetime):
        self.now = now

    def observe_label(self, available_at: datetime, value: float) -> float:
        if available_at > self.now:
            raise ValueError("Future label access is forbidden.")
        return value


@dataclass(frozen=True)
class FeatureRow:
    origin: datetime
    features: dict[str, float]
    targets: dict[int, float]

    def label_available_at(self, horizon: int) -> datetime:
        return self.origin + timedelta(hours=horizon)


def parse_timestamp(raw: str) -> datetime:
    value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if value.tzinfo is None:
        raise ValueError(f"Timestamp must include a timezone: {raw}")
    return value.astimezone(timezone.utc)


def parse_finite(raw: str | None) -> float | None:
    if raw is None or not raw.strip():
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    return value if math.isfinite(value) else None


def load_feature_rows(path: Path) -> tuple[list[FeatureRow], dict[str, int]]:
    rows: list[FeatureRow] = []
    rejected = defaultdict(int)
    with path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        required = {
            "origin_valid_at_utc",
            "data_class",
            "feature_quality",
            *FEATURE_COLUMNS,
            *(f"target_sum_next_{horizon}h_mm" for horizon in HORIZONS),
        }
        missing_columns = required.difference(reader.fieldnames or ())
        if missing_columns:
            raise ValueError(f"Feature CSV is missing columns: {', '.join(sorted(missing_columns))}")

        previous_origin: datetime | None = None
        for raw in reader:
            if raw.get("data_class") != "historical_reanalysis":
                rejected["non_reanalysis"] += 1
                continue
            if raw.get("feature_quality") != "complete":
                rejected["incomplete_features_or_targets"] += 1
                continue
            try:
                origin = parse_timestamp(raw["origin_valid_at_utc"])
            except (TypeError, ValueError):
                rejected["invalid_timestamp"] += 1
                continue
            if previous_origin is not None and origin <= previous_origin:
                rejected["non_monotonic_or_duplicate_timestamp"] += 1
                continue

            parsed_features = {name: parse_finite(raw.get(name)) for name in FEATURE_COLUMNS}
            targets = {
                horizon: parse_finite(raw.get(f"target_sum_next_{horizon}h_mm"))
                for horizon in HORIZONS
            }
            if any(value is None for value in parsed_features.values()) or any(
                value is None for value in targets.values()
            ):
                rejected["missing_or_non_finite_value"] += 1
                continue
            if any(value < 0 for value in targets.values() if value is not None):
                rejected["negative_rainfall_target"] += 1
                continue
            if parsed_features["rain_lag_1h_mm"] is None or not (
                0 <= parsed_features["rain_lag_1h_mm"] <= MAX_VALID_HOURLY_RAIN_MM
            ):
                rejected["implausible_hourly_rainfall"] += 1
                continue

            rows.append(
                FeatureRow(
                    origin=origin,
                    features={name: float(value) for name, value in parsed_features.items() if value is not None},
                    targets={horizon: float(value) for horizon, value in targets.items() if value is not None},
                )
            )
            previous_origin = origin
    if len(rows) < 2:
        raise ValueError("Not enough valid chronological feature rows.")
    return rows, dict(rejected)


def make_regressor() -> Any:
    return preprocessing.StandardScaler() | linear_model.LinearRegression(
        optimizer=optim.SGD(lr=0.0001),
        l2=0.01,
        clip_gradient=1.0,
    )


def make_classifier() -> Any:
    return preprocessing.StandardScaler() | linear_model.LogisticRegression(
        optimizer=optim.SGD(lr=0.001),
        l2=0.001,
        clip_gradient=1.0,
    )


def set_learning_rate(model: Any, learning_rate: float) -> None:
    """Increase River SGD's learning rate after detected residual drift."""
    model[-1].optimizer.lr = optim.schedulers.Constant(learning_rate)


def logistic_probability(model: Any, features: dict[str, float]) -> float:
    probabilities = model.predict_proba_one(features)
    return min(max(float(probabilities.get(True, 0.0)), 0.0), 1.0)


class OnlineProbabilityCalibrator:
    """Online equal-width histogram calibration with a Beta(1, 1) prior."""

    def __init__(self) -> None:
        self.counts = [0] * CALIBRATION_BINS
        self.positives = [0] * CALIBRATION_BINS

    @staticmethod
    def bin_for(probability: float) -> int:
        return min(int(probability * CALIBRATION_BINS), CALIBRATION_BINS - 1)

    def predict(self, probability: float) -> float:
        index = self.bin_for(probability)
        return (self.positives[index] + 1) / (self.counts[index] + 2)

    def learn(self, probability: float, actual: bool) -> None:
        index = self.bin_for(probability)
        self.counts[index] += 1
        self.positives[index] += int(actual)


def conformal_interval(prediction: float, errors: deque[float]) -> tuple[float, float] | None:
    if len(errors) < MIN_CONFORMAL_SAMPLES:
        return None
    ordered = sorted(errors)
    rank = min(math.ceil((len(ordered) + 1) * 0.9), len(ordered)) - 1
    radius = ordered[rank]
    return max(0.0, prediction - radius), prediction + radius


def choose_f2_threshold(rows: list[tuple[float, bool]]) -> float:
    if not rows or not any(actual for _, actual in rows):
        return 0.5
    candidates = sorted(
        {0.005, 0.01, 0.02, 0.05, 0.5, 0.95, *(round(i / 100, 2) for i in range(5, 96, 5))}
    )
    best_threshold = 0.5
    best_f2 = -1.0
    for threshold in candidates:
        tp = sum(probability >= threshold and actual for probability, actual in rows)
        fp = sum(probability >= threshold and not actual for probability, actual in rows)
        fn = sum(probability < threshold and actual for probability, actual in rows)
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f2 = 5 * precision * recall / (4 * precision + recall) if 4 * precision + recall else 0.0
        if f2 > best_f2 or (f2 == best_f2 and threshold < best_threshold):
            best_f2 = f2
            best_threshold = threshold
    return best_threshold


def classification_metrics(
    rows: list[dict[str, Any]],
    threshold: float,
    score_key: str = "calibratedProbability",
) -> dict[str, Any]:
    tp = fp = tn = fn = 0
    brier_sum = 0.0
    ece_sum = 0.0
    bins: list[list[float]] = [[] for _ in range(CALIBRATION_BINS)]
    false_negatives: list[dict[str, Any]] = []
    false_positives: list[dict[str, Any]] = []
    for row in rows:
        probability = row[score_key]
        actual = row["actual"]
        predicted = probability >= threshold
        if actual and predicted:
            tp += 1
        elif not actual and predicted:
            fp += 1
            if len(false_positives) < 100:
                false_positives.append(
                    {
                        "origin": row["origin"],
                        "actualNext24hMm": round(row["actualMm"], 3),
                        "predictedProbability": round(probability, 5),
                    }
                )
        elif actual and not predicted:
            fn += 1
            if len(false_negatives) < 100:
                false_negatives.append(
                    {
                        "origin": row["origin"],
                        "actualNext24hMm": round(row["actualMm"], 3),
                        "predictedProbability": round(probability, 5),
                    }
                )
        else:
            tn += 1
        outcome = float(actual)
        brier_sum += (probability - outcome) ** 2
        bins[OnlineProbabilityCalibrator.bin_for(probability)].append((probability, outcome))

    count = len(rows)
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    ece = 0.0
    reliability = []
    for index, entries in enumerate(bins):
        if not entries:
            continue
        mean_prediction = statistics.fmean(probability for probability, _ in entries)
        event_rate = statistics.fmean(outcome for _, outcome in entries)
        ece += len(entries) / max(count, 1) * abs(mean_prediction - event_rate)
        reliability.append(
            {
                "binStart": index / CALIBRATION_BINS,
                "binEnd": (index + 1) / CALIBRATION_BINS,
                "count": len(entries),
                "meanPredictedProbability": mean_prediction,
                "observedEventRate": event_rate,
            }
        )
    return {
        "threshold": threshold,
        "positiveClass": f"next 24-hour ERA5 rainfall >= {HEAVY_RAIN_24H_MM} mm",
        "n": count,
        "truePositives": tp,
        "falsePositives": fp,
        "trueNegatives": tn,
        "falseNegatives": fn,
        "accuracy": (tp + tn) / count if count else None,
        "precision": precision if count else None,
        "recall": recall if count else None,
        "f1": f1 if count else None,
        "falsePositiveRate": fp / (fp + tn) if fp + tn else None,
        "falseNegativeRate": fn / (fn + tp) if fn + tp else None,
        "brierScore": brier_sum / count if count else None,
        "expectedCalibrationError": ece if count else None,
        "calibrationMethod": "online equal-width probability bins with Beta(1,1) smoothing",
        "reliabilityBins": reliability,
        "falseNegativeExamples": false_negatives,
        "falsePositiveExamples": false_positives,
    }


def evaluate(path: Path, test_year: int, output: Path) -> dict[str, Any]:
    rows, rejected = load_feature_rows(path)
    test_start = datetime(test_year, 1, 1, tzinfo=timezone(timedelta(hours=5, minutes=30))).astimezone(timezone.utc)
    test_end = datetime(test_year + 1, 1, 1, tzinfo=timezone(timedelta(hours=5, minutes=30))).astimezone(timezone.utc)
    if rows[0].origin >= test_start or rows[-1].origin <= test_start:
        raise ValueError(f"Dataset must include training data and rows before {test_year}.")
    if len([row for row in rows if row.origin < test_start]) < MIN_ROWS_BEFORE_TEST_HOURS:
        raise ValueError("At least 90 days of pre-test training rows are required.")

    regressors = {horizon: make_regressor() for horizon in HORIZONS}
    regression_detectors = {horizon: drift.ADWIN() for horizon in HORIZONS}
    absolute_errors = {horizon: deque(maxlen=CONFORMAL_WINDOW) for horizon in HORIZONS}
    regression_learning_rates = {horizon: 0.0001 for horizon in HORIZONS}
    classifier = make_classifier()
    classifier_detector = drift.ADWIN()
    classifier_learning_rate = 0.001
    calibrator = OnlineProbabilityCalibrator()
    pending: dict[datetime, list[tuple[FeatureRow, int, float, float | None]]] = defaultdict(list)
    validation_probabilities: list[tuple[float, float, bool]] = []
    test_regression: dict[int, list[dict[str, Any]]] = {horizon: [] for horizon in HORIZONS}
    test_classification: list[dict[str, Any]] = []
    drift_events: list[dict[str, Any]] = []
    interval_results: dict[int, list[dict[str, Any]]] = {horizon: [] for horizon in HORIZONS}

    validation_start = test_start - timedelta(days=365)
    test_predictions_start_count = 0
    rows_by_origin = {row.origin: row for row in rows}
    test_regression_baselines: dict[str, dict[int, list[dict[str, float]]]] = {
        "last-hour-persistence": {horizon: [] for horizon in HORIZONS},
        "weekly-seasonal-naive": {horizon: [] for horizon in HORIZONS},
    }

    def release_labels(now: datetime) -> None:
        nonlocal classifier_learning_rate
        matured = [available_at for available_at in pending if available_at <= now]
        for available_at in sorted(matured):
            for row, horizon, prediction, raw_event_probability in pending.pop(available_at):
                clock = NowClock(now)
                actual = clock.observe_label(row.label_available_at(horizon), row.targets[horizon])
                error = abs(prediction - actual)
                absolute_errors[horizon].append(error)
                regressors[horizon].learn_one(row.features, actual / horizon)
                regression_detectors[horizon].update(error / horizon)
                if regression_detectors[horizon].drift_detected:
                    regression_learning_rates[horizon] = min(regression_learning_rates[horizon] * 1.5, 0.001)
                    set_learning_rate(regressors[horizon], regression_learning_rates[horizon])
                    drift_events.append(
                        {
                            "at": now.isoformat(),
                            "model": f"rainfall-{horizon}h-regressor",
                            "signal": "absolute-error",
                            "learningRate": regression_learning_rates[horizon],
                        }
                    )

                if horizon == 24 and raw_event_probability is not None:
                    actual_event = actual >= HEAVY_RAIN_24H_MM
                    classifier.learn_one(row.features, actual_event)
                    classifier_detector.update(float((raw_event_probability >= 0.5) != actual_event))
                    calibrator.learn(raw_event_probability, actual_event)
                    if classifier_detector.drift_detected:
                        classifier_learning_rate = min(classifier_learning_rate * 1.5, 0.002)
                        set_learning_rate(classifier, classifier_learning_rate)
                        drift_events.append(
                            {
                                "at": now.isoformat(),
                                "model": "heavy-rain-event-classifier",
                                "signal": "classification-error",
                                "learningRate": classifier_learning_rate,
                            }
                        )

    for row in rows:
        if row.origin >= test_end:
            break
        release_labels(row.origin)
        raw_predictions = {
            horizon: max(0.0, float(regressors[horizon].predict_one(row.features) or 0.0) * horizon)
            for horizon in HORIZONS
        }
        raw_event_probability = logistic_probability(classifier, row.features)
        calibrated_probability = calibrator.predict(raw_event_probability)
        is_test = test_start <= row.origin < test_end

        if is_test:
            test_predictions_start_count += 1
            for horizon in HORIZONS:
                prediction = raw_predictions[horizon]
                actual = row.targets[horizon]
                interval = conformal_interval(prediction, absolute_errors[horizon])
                test_regression[horizon].append(
                    {
                        "prediction": prediction,
                        "actual": actual,
                        "absoluteError": abs(prediction - actual),
                        "squaredError": (prediction - actual) ** 2,
                    }
                )
                test_regression_baselines["last-hour-persistence"][horizon].append(
                    {
                        "prediction": row.features["rain_lag_1h_mm"] * horizon,
                        "actual": actual,
                    }
                )
                previous_week = rows_by_origin.get(row.origin - timedelta(days=7))
                if previous_week is not None:
                    test_regression_baselines["weekly-seasonal-naive"][horizon].append(
                        {"prediction": previous_week.targets[horizon], "actual": actual}
                    )
                if interval is not None:
                    interval_results[horizon].append(
                        {
                            "lower": interval[0],
                            "upper": interval[1],
                            "actual": actual,
                        }
                    )
            test_classification.append(
                {
                    "origin": row.origin.isoformat(),
                    "actual": row.targets[24] >= HEAVY_RAIN_24H_MM,
                    "actualMm": row.targets[24],
                    "rawProbability": raw_event_probability,
                    "calibratedProbability": calibrated_probability,
                }
            )
        elif validation_start <= row.origin < test_start and row.label_available_at(24) <= test_start:
            validation_probabilities.append(
                (raw_event_probability, calibrated_probability, row.targets[24] >= HEAVY_RAIN_24H_MM)
            )

        for horizon in HORIZONS:
            due_at = row.label_available_at(horizon)
            if due_at < test_end:
                pending[due_at].append(
                    (
                        row,
                        horizon,
                        raw_predictions[horizon],
                        raw_event_probability if horizon == 24 else None,
                    )
                )

    # Validation labels are matured strictly before the test boundary.
    release_labels(test_end)
    if test_predictions_start_count == 0:
        raise ValueError(f"No valid holdout predictions found for {test_year}.")

    raw_threshold = choose_f2_threshold([(raw, actual) for raw, _, actual in validation_probabilities])
    calibrated_threshold = choose_f2_threshold([(calibrated, actual) for _, calibrated, actual in validation_probabilities])
    classification = classification_metrics(test_classification, calibrated_threshold)
    raw_classification = classification_metrics(test_classification, raw_threshold, "rawProbability")

    horizon_reports = []
    for horizon in HORIZONS:
        errors = test_regression[horizon]
        intervals = interval_results[horizon]
        baseline_reports = {}
        for method, by_horizon in test_regression_baselines.items():
            baseline_rows = by_horizon[horizon]
            baseline_reports[method] = {
                "n": len(baseline_rows),
                "maeMm": (
                    statistics.fmean(abs(item["prediction"] - item["actual"]) for item in baseline_rows)
                    if baseline_rows
                    else None
                ),
                "rmseMm": (
                    math.sqrt(
                        statistics.fmean((item["prediction"] - item["actual"]) ** 2 for item in baseline_rows)
                    )
                    if baseline_rows
                    else None
                ),
            }
        horizon_reports.append(
            {
                "horizonHours": horizon,
                "n": len(errors),
                "maeMm": statistics.fmean(item["absoluteError"] for item in errors),
                "rmseMm": math.sqrt(statistics.fmean(item["squaredError"] for item in errors)),
                "baselines": baseline_reports,
                "conformalInterval": {
                    "nominalCoverage": 0.9,
                    "n": len(intervals),
                    "empiricalCoverage": (
                        sum(item["lower"] <= item["actual"] <= item["upper"] for item in intervals) / len(intervals)
                        if intervals
                        else None
                    ),
                    "meanWidthMm": (
                        statistics.fmean(item["upper"] - item["lower"] for item in intervals)
                        if intervals
                        else None
                    ),
                    "method": "rolling absolute-error split-conformal interval; empirical holdout coverage only",
                },
            }
        )

    source_text = path.read_bytes()
    report = {
        "reportId": f"river-online-rainfall-{test_year}-marine-lines-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "modelStatus": "measured_historical_reanalysis_holdout",
        "dataScope": {
            "geography": "Marine Lines, Mumbai, Maharashtra",
            "dataClass": "historical_reanalysis",
            "provider": "Open-Meteo Historical Weather API, ERA5",
            "target": "hourly-gridpoint rainfall accumulation, not flood/road impact",
            "testYear": test_year,
            "featureRows": len(rows),
            "rejectedRows": rejected,
            "featureCsvSha256": hashlib.sha256(source_text).hexdigest(),
            "thresholdForHeavyRainLabelMmPer24h": HEAVY_RAIN_24H_MM,
            "thresholdSource": "Fixed rainfall-amount benchmark threshold for this experiment; it is not an operational flood warning threshold.",
        },
        "validation": {
            "method": "chronological prequential replay, test before learn, supervised labels released only at event time + horizon",
            "testStart": test_start.isoformat(),
            "testEndExclusive": test_end.isoformat(),
            "decisionThresholds": {
                "rawProbability": raw_threshold,
                "calibratedProbability": calibrated_threshold,
            },
            "decisionThresholdSelection": "maximum F2 on the final 365-day pre-test prequential validation stream, independently for raw and calibrated scores; thresholds frozen for test period",
            "validationSamples": len(validation_probabilities),
            "validationPositiveEvents": sum(actual for _, _, actual in validation_probabilities),
            "futureLeakageGuard": "NowClock rejects labels whose horizon has not matured at replay time.",
            "qualityPolicy": "Reject malformed, non-monotonic, duplicate, incomplete, non-finite and negative-target rows; do not trim physically plausible high rainfall as false positives.",
        },
        "models": {
            "regression": {
                "library": "River",
                "algorithm": "online standardized SGD linear regression",
                "pythonVersion": sys.version.split()[0],
                "resultsByHorizon": horizon_reports,
            },
            "heavyRainEvent": {
                "library": "River",
                "algorithm": "online standardized SGD logistic regression",
                "pythonVersion": sys.version.split()[0],
                "positiveClass": f"next 24-hour ERA5 rainfall >= {HEAVY_RAIN_24H_MM} mm",
                "rawProbabilityMetrics": raw_classification,
                "calibratedProbabilityMetrics": classification,
                "drift": {
                    "detector": "River ADWIN",
                    "events": drift_events,
                    "learningRatePolicy": "Multiply online SGD learning rate by 1.5 after detector signal, subject to 0.001 regression and 0.002 classification caps; gradients are clipped to 1.0.",
                },
            },
        },
        "limitations": [
            "This is a single-gridpoint rainfall forecast replay against ERA5 reanalysis, not a flood, road-closure, or city-cascade warning model.",
            "ERA5 reanalysis is not an independent gauge observation or archived issued forecast; metrics do not establish operational forecast skill.",
            "The heavy-rain event label is a rainfall-amount category only. No verified flood incident labels are available for precision/recall of flood predictions.",
            "Online binned calibration and conformal intervals are estimated from this data stream; report scores are not a deployment guarantee under spatial or temporal shift.",
            "Only one Marine Lines location has historical input coverage. No all-India state/district accuracy or geographic transfer is claimed.",
            "River is used by the offline training/evaluation CLI. The current Node/Vercel API does not host a Python River inference worker.",
        ],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=Path("data/features/era5-rainfall-features-2023-2025.csv"))
    parser.add_argument("--test-year", type=int, default=2025)
    parser.add_argument("--out", type=Path, default=Path("data/evaluation/river-online-rainfall-2025.json"))
    parser.add_argument("--public-out", type=Path, default=Path("public/data/river-online-rainfall-2025.json"))
    args = parser.parse_args()
    try:
        report = evaluate(args.input, args.test_year, args.out)
        args.public_out.parent.mkdir(parents=True, exist_ok=True)
        args.public_out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    except (OSError, ValueError, csv.Error) as error:
        print(f"Online rainfall evaluation failed: {error}", file=sys.stderr)
        return 1

    event = report["models"]["heavyRainEvent"]["calibratedProbabilityMetrics"]
    print(f"Saved leakage-safe River online replay report: {args.out}")
    print(
        f"24h rainfall event n={event['n']} precision={event['precision']} recall={event['recall']} "
        f"F1={event['f1']} FPR={event['falsePositiveRate']} FNR={event['falseNegativeRate']} "
        f"FN={event['falseNegatives']}"
    )
    for item in report["models"]["regression"]["resultsByHorizon"]:
        print(
            f"{item['horizonHours']:>2}h n={item['n']} MAE={item['maeMm']:.3f} mm "
            f"RMSE={item['rmseMm']:.3f} mm"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
