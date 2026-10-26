#!/usr/bin/env python3
"""Train and evaluate a synthetic-only River flood-impact surrogate."""

from __future__ import annotations

import argparse
import json
import math
import random
import statistics
from pathlib import Path
from typing import Any

from river import linear_model, optim

FEATURE_NAMES = (
    "rain24_scaled",
    "rain72_scaled",
    "peakRain24_scaled",
    "drainageVulnerability_scaled",
    "urbanDensity_scaled",
    "rainfallBias_scaled",
    "coastal",
    "riverLevel_scaled",
    "riverTrend_scaled",
    "soilSaturation_scaled",
    "trafficSpeedLoss_scaled",
    "transitDisruption_scaled",
    "roadIncidentLoad_scaled",
    "powerLoad_scaled",
    "powerOutageExposure_scaled",
    "hospitalOccupancy_scaled",
    "hospitalBedShortage_scaled",
    "ambulanceDelay_scaled",
    "emergencyCallLoad_scaled",
    "satelliteInundation_scaled",
    "elevationExposure_scaled",
    "exposedAssetDensity_scaled",
    "historicalIncidentLoad_scaled",
    "citizenReportLoad_scaled",
    "citizenCorroboration_scaled",
    "rain24_x_drainage",
    "rain72_x_urban",
    "peak24_x_drainage",
    "rain72_x_coastal",
    "rain24_x_rainfall_bias",
    "river_x_soil",
    "river_x_traffic",
    "traffic_x_ambulance",
    "power_x_hospital",
    "satellite_x_river",
    "incident_x_citizen",
    "calls_x_bed_shortage",
)
EVENT_DEPTH_THRESHOLD_M = 0.25
MAX_SYNTHETIC_DEPTH_M = 2.0
DEFAULT_SEED = 20261026


def make_features(
    rain24_mm: float,
    rain72_mm: float,
    peak_rain24_mm_hr: float,
    drainage_vulnerability: float,
    urban_density: float,
    rainfall_bias: float,
    coastal: bool,
    river_level_m: float = 0.0,
    river_trend_m_per_hour: float = 0.0,
    soil_saturation_pct: float = 0.0,
    traffic_speed_loss_pct: float = 0.0,
    transit_disruption_pct: float = 0.0,
    road_incident_load: float = 0.0,
    power_load_pct: float = 0.0,
    power_outage_exposure_pct: float = 0.0,
    hospital_occupancy_pct: float = 0.0,
    hospital_bed_shortage_pct: float = 0.0,
    ambulance_delay_minutes: float = 0.0,
    emergency_call_load: float = 0.0,
    satellite_inundation_pct: float = 0.0,
    elevation_exposure: float = 0.0,
    exposed_asset_density: float = 0.0,
    historical_incident_load: float = 0.0,
    citizen_report_load: float = 0.0,
    citizen_corroboration_pct: float = 0.0,
) -> dict[str, float]:
    rain24 = min(max(rain24_mm, 0.0), 250.0) / 250.0
    rain72 = min(max(rain72_mm, 0.0), 500.0) / 500.0
    peak24 = min(max(peak_rain24_mm_hr, 0.0), 100.0) / 100.0
    drainage = min(max(drainage_vulnerability, 0.0), 100.0) / 100.0
    urban = min(max(urban_density, 0.0), 100.0) / 100.0
    rain_bias = min(max(rainfall_bias, 0.0), 100.0) / 100.0
    coastal_value = float(coastal)
    river_level = min(max(river_level_m, 0.0), 10.0) / 10.0
    river_trend = (min(max(river_trend_m_per_hour, -0.5), 0.5) + 0.5) / 1.0
    soil = min(max(soil_saturation_pct, 0.0), 100.0) / 100.0
    traffic_loss = min(max(traffic_speed_loss_pct, 0.0), 100.0) / 100.0
    transit = min(max(transit_disruption_pct, 0.0), 100.0) / 100.0
    road_incidents = min(max(road_incident_load, 0.0), 20.0) / 20.0
    power_load = min(max(power_load_pct, 0.0), 150.0) / 150.0
    power_outage = min(max(power_outage_exposure_pct, 0.0), 100.0) / 100.0
    hospital_occupancy = min(max(hospital_occupancy_pct, 0.0), 100.0) / 100.0
    bed_shortage = min(max(hospital_bed_shortage_pct, 0.0), 100.0) / 100.0
    ambulance_delay = min(max(ambulance_delay_minutes, 0.0), 120.0) / 120.0
    calls = min(max(emergency_call_load, 0.0), 100.0) / 100.0
    satellite = min(max(satellite_inundation_pct, 0.0), 100.0) / 100.0
    elevation = min(max(elevation_exposure, 0.0), 100.0) / 100.0
    asset_density = min(max(exposed_asset_density, 0.0), 100.0) / 100.0
    historical = min(max(historical_incident_load, 0.0), 100.0) / 100.0
    citizen = min(max(citizen_report_load, 0.0), 100.0) / 100.0
    corroboration = min(max(citizen_corroboration_pct, 0.0), 100.0) / 100.0
    return {
        "rain24_scaled": rain24,
        "rain72_scaled": rain72,
        "peakRain24_scaled": peak24,
        "drainageVulnerability_scaled": drainage,
        "urbanDensity_scaled": urban,
        "rainfallBias_scaled": rain_bias,
        "coastal": coastal_value,
        "riverLevel_scaled": river_level,
        "riverTrend_scaled": river_trend,
        "soilSaturation_scaled": soil,
        "trafficSpeedLoss_scaled": traffic_loss,
        "transitDisruption_scaled": transit,
        "roadIncidentLoad_scaled": road_incidents,
        "powerLoad_scaled": power_load,
        "powerOutageExposure_scaled": power_outage,
        "hospitalOccupancy_scaled": hospital_occupancy,
        "hospitalBedShortage_scaled": bed_shortage,
        "ambulanceDelay_scaled": ambulance_delay,
        "emergencyCallLoad_scaled": calls,
        "satelliteInundation_scaled": satellite,
        "elevationExposure_scaled": elevation,
        "exposedAssetDensity_scaled": asset_density,
        "historicalIncidentLoad_scaled": historical,
        "citizenReportLoad_scaled": citizen,
        "citizenCorroboration_scaled": corroboration,
        "rain24_x_drainage": rain24 * drainage,
        "rain72_x_urban": rain72 * urban,
        "peak24_x_drainage": peak24 * drainage,
        "rain72_x_coastal": rain72 * coastal_value,
        "rain24_x_rainfall_bias": rain24 * rain_bias,
        "river_x_soil": river_level * soil,
        "river_x_traffic": river_level * traffic_loss,
        "traffic_x_ambulance": traffic_loss * ambulance_delay,
        "power_x_hospital": power_load * hospital_occupancy,
        "satellite_x_river": satellite * river_level,
        "incident_x_citizen": road_incidents * citizen,
        "calls_x_bed_shortage": calls * bed_shortage,
    }


def synthetic_depth_m(features: dict[str, float]) -> float:
    """Transparent synthetic teaching rule; it is not an observed flood label."""
    runoff_load = (
        0.04
        + 0.18 * features["rain24_scaled"]
        + 0.56 * features["rain72_scaled"]
        + 0.31 * features["peakRain24_scaled"]
        + 0.22 * features["drainageVulnerability_scaled"]
        + 0.17 * features["urbanDensity_scaled"]
        + 0.08 * features["rainfallBias_scaled"]
        + 0.10 * features["coastal"]
        + 0.31 * features["riverLevel_scaled"]
        + 0.12 * max(features["riverTrend_scaled"], 0.0)
        + 0.18 * features["soilSaturation_scaled"]
        + 0.14 * features["trafficSpeedLoss_scaled"]
        + 0.08 * features["transitDisruption_scaled"]
        + 0.07 * features["roadIncidentLoad_scaled"]
        + 0.08 * features["powerOutageExposure_scaled"]
        + 0.12 * features["hospitalOccupancy_scaled"]
        + 0.06 * features["hospitalBedShortage_scaled"]
        + 0.07 * features["ambulanceDelay_scaled"]
        + 0.07 * features["emergencyCallLoad_scaled"]
        + 0.22 * features["satelliteInundation_scaled"]
        + 0.17 * features["elevationExposure_scaled"]
        + 0.10 * features["exposedAssetDensity_scaled"]
        + 0.09 * features["historicalIncidentLoad_scaled"]
        + 0.02 * features["citizenReportLoad_scaled"]
        + 0.24 * features["rain24_x_drainage"]
        + 0.35 * features["rain72_x_urban"]
        + 0.18 * features["peak24_x_drainage"]
        + 0.12 * features["rain72_x_coastal"]
        + 0.09 * features["rain24_x_rainfall_bias"]
        + 0.18 * features["river_x_soil"]
        + 0.12 * features["river_x_traffic"]
        + 0.06 * features["traffic_x_ambulance"]
        + 0.08 * features["power_x_hospital"]
        + 0.15 * features["satellite_x_river"]
        + 0.025 * features["incident_x_citizen"]
        + 0.07 * features["calls_x_bed_shortage"]
    )
    return min(max(runoff_load * 0.35 - 0.18, 0.0), MAX_SYNTHETIC_DEPTH_M)


def generate_sample(rng: random.Random) -> tuple[dict[str, float], float, bool]:
    storm_type = rng.random()
    if storm_type < 0.45:
        rain72 = rng.uniform(0.0, 35.0)
    elif storm_type < 0.82:
        rain72 = rng.uniform(20.0, 220.0)
    else:
        rain72 = rng.uniform(120.0, 500.0)
    rain24 = rain72 * rng.uniform(0.12, 0.72)
    peak24 = min(rain24 * rng.uniform(0.08, 0.85), 100.0)
    drainage = rng.uniform(15.0, 95.0)
    urban = rng.uniform(10.0, 98.0)
    rain_bias = rng.uniform(15.0, 75.0)
    coastal = rng.random() < 0.31
    features = make_features(
        rain24,
        rain72,
        peak24,
        drainage,
        urban,
        rain_bias,
        coastal,
        river_level_m=rng.uniform(0.0, 8.0),
        river_trend_m_per_hour=rng.uniform(-0.15, 0.35),
        soil_saturation_pct=min(100.0, rain72 * rng.uniform(0.2, 0.6)),
        traffic_speed_loss_pct=min(100.0, rain24 * rng.uniform(0.05, 0.6) + rng.uniform(0.0, 35.0)),
        transit_disruption_pct=rng.uniform(0.0, 90.0),
        road_incident_load=rng.uniform(0.0, 12.0),
        power_load_pct=rng.uniform(35.0, 145.0),
        power_outage_exposure_pct=rng.uniform(0.0, 80.0),
        hospital_occupancy_pct=rng.uniform(35.0, 99.0),
        hospital_bed_shortage_pct=rng.uniform(0.0, 65.0),
        ambulance_delay_minutes=rng.uniform(0.0, 90.0),
        emergency_call_load=rng.uniform(0.0, 100.0),
        satellite_inundation_pct=min(100.0, rain72 * rng.uniform(0.05, 0.25)),
        elevation_exposure=rng.uniform(0.0, 100.0),
        exposed_asset_density=urban * rng.uniform(50.0, 100.0),
        historical_incident_load=rng.uniform(0.0, 100.0),
        citizen_report_load=rng.uniform(0.0, 100.0),
        citizen_corroboration_pct=rng.uniform(0.0, 100.0),
    )
    depth = synthetic_depth_m(features)
    event = depth >= EVENT_DEPTH_THRESHOLD_M
    return features, depth, event


def new_regressor() -> Any:
    return linear_model.LinearRegression(
        optimizer=optim.SGD(lr=0.006),
        l2=0.0005,
        clip_gradient=1.0,
    )


def new_classifier() -> Any:
    return linear_model.LogisticRegression(
        optimizer=optim.SGD(lr=0.025),
        l2=0.001,
        clip_gradient=1.0,
    )


def score_rows(
    regressor: Any,
    classifier: Any,
    rows: list[tuple[dict[str, float], float, bool]],
) -> dict[str, float | int]:
    absolute_errors: list[float] = []
    squared_errors: list[float] = []
    tp = fp = tn = fn = 0
    brier_sum = 0.0
    for features, actual_depth, actual_event in rows:
        predicted_depth = min(
            max(float(regressor.predict_one(features) or 0.0), 0.0),
            MAX_SYNTHETIC_DEPTH_M,
        )
        probability = min(
            max(float(classifier.predict_proba_one(features).get(True, 0.0)), 0.0),
            1.0,
        )
        predicted_event = probability >= 0.5
        error = predicted_depth - actual_depth
        absolute_errors.append(abs(error))
        squared_errors.append(error * error)
        brier_sum += (probability - float(actual_event)) ** 2
        if predicted_event and actual_event:
            tp += 1
        elif predicted_event:
            fp += 1
        elif actual_event:
            fn += 1
        else:
            tn += 1

    positives = tp + fn
    negatives = tn + fp
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / positives if positives else 0.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "syntheticHoldoutRows": len(rows),
        "depthMaeMeters": statistics.mean(absolute_errors),
        "depthRmseMeters": math.sqrt(statistics.mean(squared_errors)),
        "eventThresholdMeters": EVENT_DEPTH_THRESHOLD_M,
        "threshold": 0.5,
        "truePositives": tp,
        "falsePositives": fp,
        "trueNegatives": tn,
        "falseNegatives": fn,
        "positiveEventRate": positives / len(rows) if rows else 0.0,
        "positiveRows": positives,
        "negativeRows": negatives,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "falseNegativeRate": fn / positives if positives else 0.0,
        "brierScore": brier_sum / len(rows) if rows else 0.0,
    }


def train(seed: int, sample_count: int) -> tuple[dict[str, Any], dict[str, Any]]:
    rng = random.Random(seed)
    train_rows = [generate_sample(rng) for _ in range(sample_count)]
    holdout_rows = [generate_sample(rng) for _ in range(max(sample_count // 5, 1000))]
    regressor = new_regressor()
    classifier = new_classifier()
    for features, depth, event in train_rows:
        regressor.learn_one(features, depth)
        classifier.learn_one(features, event)

    metrics = score_rows(regressor, classifier, holdout_rows)
    artifact = {
        "schemaVersion": 1,
        "modelId": "pravaah-synthetic-cascade-surrogate-v2",
        "modelType": "river-online-sgd-regression-and-logistic-classification",
        "dataClass": "synthetic_surrogate",
        "training": {
            "generator": "scripts/train_synthetic_flood_model.py",
            "seed": seed,
            "trainingSamples": sample_count,
            "target": "synthetic cascade impact proxy in metres; not observed flood depth or service outage",
            "eventDefinition": f"synthetic depth >= {EVENT_DEPTH_THRESHOLD_M} m",
            "createdAt": "reproducible-build",
            "limitations": [
                "All training inputs other than provider data at inference are synthetic features generated by this script.",
                "Synthetic labels are generated by the documented multi-system teaching rule in this script.",
                "Holdout metrics measure agreement with that synthetic rule only.",
                "No gauge, traffic, hospital, power, satellite, road closure, incident, or citizen-report observations are used for training.",
                "Not calibrated or suitable for operational warnings or emergency dispatch.",
            ],
        },
        "featureNames": list(FEATURE_NAMES),
        "eventDepthThresholdMeters": EVENT_DEPTH_THRESHOLD_M,
        "maximumDepthMeters": MAX_SYNTHETIC_DEPTH_M,
        "regression": {
            "intercept": float(regressor.intercept),
            "weights": {name: float(regressor.weights.get(name, 0.0)) for name in FEATURE_NAMES},
        },
        "classification": {
            "intercept": float(classifier.intercept),
            "weights": {name: float(classifier.weights.get(name, 0.0)) for name in FEATURE_NAMES},
        },
        "syntheticHoldoutMetrics": metrics,
    }
    return artifact, metrics


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--samples", type=int, default=20_000)
    parser.add_argument(
        "--model-out",
        type=Path,
        default=Path("src/server/pravaah-synthetic-flood-model.json"),
    )
    parser.add_argument(
        "--report-out",
        type=Path,
        default=Path("data/evaluation/synthetic-cascade-model-v2.json"),
    )
    args = parser.parse_args()
    if args.samples < 5_000:
        parser.error("--samples must be at least 5000.")

    artifact, metrics = train(args.seed, args.samples)
    report = {
        "modelId": artifact["modelId"],
        "dataClass": artifact["dataClass"],
        "metricsScope": "synthetic multi-system teacher-rule holdout only; not empirical cascade-model accuracy",
        "featureNames": artifact["featureNames"],
        "training": artifact["training"],
        "syntheticHoldoutMetrics": metrics,
    }
    args.model_out.parent.mkdir(parents=True, exist_ok=True)
    args.report_out.parent.mkdir(parents=True, exist_ok=True)
    args.model_out.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    args.report_out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"modelOut": str(args.model_out), "reportOut": str(args.report_out), **metrics}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
