from __future__ import annotations

import unittest
import random

from scripts.train_synthetic_flood_model import (
    EVENT_DEPTH_THRESHOLD_M,
    generate_sample,
    make_features,
    synthetic_depth_m,
    train,
)


class SyntheticFloodModelTests(unittest.TestCase):
    def test_runoff_proxy_is_monotonic_in_rainfall(self) -> None:
        low_rain = make_features(10, 20, 2, 60, 60, 50, False)
        high_rain = make_features(80, 180, 20, 60, 60, 50, False)
        self.assertGreater(synthetic_depth_m(high_rain), synthetic_depth_m(low_rain))

    def test_generated_events_match_declared_synthetic_threshold(self) -> None:
        _, depth, event = generate_sample(random.Random(7))
        self.assertEqual(event, depth >= EVENT_DEPTH_THRESHOLD_M)

    def test_training_is_reproducible_and_identifies_synthetic_metrics(self) -> None:
        first, first_metrics = train(seed=23, sample_count=5000)
        second, second_metrics = train(seed=23, sample_count=5000)
        self.assertEqual(first, second)
        self.assertEqual(first_metrics, second_metrics)
        self.assertEqual(first["dataClass"], "synthetic_surrogate")
        self.assertGreater(len(first["featureNames"]), 25)
        self.assertIn("hospitalOccupancy_scaled", first["featureNames"])
        self.assertIn("powerOutageExposure_scaled", first["featureNames"])
        self.assertIn("satelliteInundation_scaled", first["featureNames"])
        self.assertIn("citizenCorroboration_scaled", first["featureNames"])
        self.assertEqual(
            first["training"]["eventDefinition"],
            f"synthetic depth >= {EVENT_DEPTH_THRESHOLD_M} m",
        )
        self.assertGreater(first_metrics["syntheticHoldoutRows"], 0)
        self.assertIn("falseNegativeRate", first_metrics)
        self.assertGreater(first_metrics["positiveRows"], 0)
        self.assertGreater(first_metrics["negativeRows"], 0)
        self.assertGreater(first_metrics["positiveEventRate"], 0.1)
        self.assertLess(first_metrics["positiveEventRate"], 0.9)


if __name__ == "__main__":
    unittest.main()
