from __future__ import annotations

import unittest
from datetime import datetime, timedelta, timezone

from scripts.evaluate_online_rainfall import (
    NowClock,
    OnlineProbabilityCalibrator,
    choose_f2_threshold,
    conformal_interval,
    make_classifier,
    make_regressor,
)


class OnlineRainfallTests(unittest.TestCase):
    def test_now_clock_rejects_unmatured_labels(self) -> None:
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)
        clock = NowClock(now)
        self.assertEqual(clock.observe_label(now, 1.0), 1.0)
        with self.assertRaisesRegex(ValueError, "Future label access"):
            clock.observe_label(now + timedelta(hours=1), 1.0)

    def test_river_regressor_and_classifier_learn_one_step(self) -> None:
        features = {"rain_lag_1h_mm": 1.0, "origin_local_hour_ist": 12.0}
        regressor = make_regressor()
        self.assertTrue(float(regressor.predict_one(features) or 0.0) == 0.0)
        regressor.learn_one(features, 2.0)
        self.assertTrue(float(regressor.predict_one(features) or 0.0) > 0.0)

        classifier = make_classifier()
        classifier.predict_proba_one(features)
        classifier.learn_one(features, True)
        self.assertGreater(classifier.predict_proba_one(features).get(True, 0.0), 0.0)

    def test_online_calibrator_updates_only_after_label(self) -> None:
        calibrator = OnlineProbabilityCalibrator()
        initial = calibrator.predict(0.62)
        calibrator.learn(0.62, True)
        self.assertNotEqual(calibrator.predict(0.62), initial)

    def test_threshold_selection_prioritizes_recall_with_f2(self) -> None:
        rows = [(0.8, True), (0.4, True), (0.3, False), (0.1, False)]
        self.assertLessEqual(choose_f2_threshold(rows), 0.5)

    def test_conformal_interval_waits_for_minimum_residual_history(self) -> None:
        from collections import deque

        errors = deque([1.0] * 99)
        self.assertIsNone(conformal_interval(2.0, errors))
        errors.append(1.0)
        self.assertEqual(conformal_interval(2.0, errors), (1.0, 3.0))


if __name__ == "__main__":
    unittest.main()
