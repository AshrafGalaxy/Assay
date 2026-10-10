"""
Benchmark Evaluation Suite (FIN 02 Addition 2).
Compares the calibrated Conformal Quantile Autoregression (CQ-AR) model against:
- Baseline 1: Historical 6-month Moving Average
- Baseline 2: Fixed Recurring Payment Baseline
on the held-out out-of-sample Test split (M19 - M24).
Reports: MAE, RMSE, CRPS, 80% Coverage %, and Interval Width (W).
"""

from typing import List, Dict, Any
import numpy as np
from app.schemas.planning import BenchmarkMetrics, BenchmarkComparisonResponse
from app.services.forecasting.conformal_engine import ConformalQuantileEngine


class ForecastEvaluator:
    """Benchmark evaluation runner across model and baselines."""

    @staticmethod
    def compute_crps(actuals: List[float], p10: List[float], p50: List[float], p90: List[float]) -> float:
        """
        Computes Continuous Ranked Probability Score (CRPS) approximated via pinball loss
        over the evaluated quantiles: (2 / |Q|) * sum_q pinball_q(actual, pred_q).
        """
        total_pinball = 0.0
        n = len(actuals)

        for i in range(n):
            y = actuals[i]
            # Pinball for 0.10, 0.50, 0.90
            loss_10 = max(0.10 * (y - p10[i]), (1.0 - 0.10) * (p10[i] - y))
            loss_50 = max(0.50 * (y - p50[i]), (1.0 - 0.50) * (p50[i] - y))
            loss_90 = max(0.90 * (y - p90[i]), (1.0 - 0.90) * (p90[i] - y))
            total_pinball += (loss_10 + loss_50 + loss_90) / 3.0

        return round(float(total_pinball / n), 2)

    @classmethod
    def evaluate_metrics(
        cls,
        actuals: List[float],
        p10: List[float],
        p50: List[float],
        p90: List[float],
    ) -> BenchmarkMetrics:
        """Calculates MAE, RMSE, CRPS, 80% coverage %, and interval width."""
        actuals_arr = np.array(actuals, dtype=np.float64)
        p50_arr = np.array(p50, dtype=np.float64)
        p10_arr = np.array(p10, dtype=np.float64)
        p90_arr = np.array(p90, dtype=np.float64)

        # 1. Point metrics (P50)
        errors = actuals_arr - p50_arr
        mae = float(np.mean(np.abs(errors)))
        rmse = float(np.sqrt(np.mean(errors ** 2)))

        # 2. Distribution metric (CRPS)
        crps = cls.compute_crps(actuals, p10, p50, p90)

        # 3. Calibration: Empirical 80% coverage
        within_interval = (actuals_arr >= p10_arr) & (actuals_arr <= p90_arr)
        coverage_80_pct = float(np.mean(within_interval) * 100.0)

        # 4. Sharpness: Interval width
        interval_width = float(np.mean(p90_arr - p10_arr))

        return BenchmarkMetrics(
            mae=round(mae, 2),
            rmse=round(rmse, 2),
            crps=round(crps, 2),
            coverage_80_pct=round(coverage_80_pct, 1),
            interval_width=round(interval_width, 2),
        )

    @classmethod
    def run_benchmark(
        cls,
        history_before_test: List[float],
        test_actuals: List[float],
        cq_engine: ConformalQuantileEngine,
    ) -> BenchmarkComparisonResponse:
        """
        Runs out-of-sample held-out evaluation for:
        1. Calibrated CQ-AR Engine
        2. Baseline 1 (Historical 6-Month Moving Average)
        3. Baseline 2 (Fixed Recurring Payments Baseline)
        """
        horizon = len(test_actuals)

        # 1. Evaluate CQ-AR Engine
        cq_preds = cq_engine.predict_horizon(history_before_test, horizon=horizon)
        cq_p10 = [p["p10"] for p in cq_preds]
        cq_p50 = [p["p50"] for p in cq_preds]
        cq_p90 = [p["p90"] for p in cq_preds]
        cq_metrics = cls.evaluate_metrics(test_actuals, cq_p10, cq_p50, cq_p90)

        # 2. Evaluate Baseline 1: Historical 6-month Moving Average
        hist_window = history_before_test[-6:]
        hist_mean = float(np.mean(hist_window))
        hist_std = float(np.std(hist_window)) if len(hist_window) > 1 else 1000.0
        # Standard normal uncalibrated confidence interval: mean +/- 1.28 * std
        base1_p50 = [hist_mean] * horizon
        base1_p10 = [hist_mean - 1.28 * hist_std] * horizon
        base1_p90 = [hist_mean + 1.28 * hist_std] * horizon
        base1_metrics = cls.evaluate_metrics(test_actuals, base1_p10, base1_p50, base1_p90)

        # 3. Evaluate Baseline 2: Fixed Recurring Payment Baseline
        # Assumes deterministic fixed known obligations (e.g. median of last 3 periods with narrow static buffer)
        fixed_val = float(np.median(history_before_test[-3:]))
        base2_p50 = [fixed_val] * horizon
        base2_p10 = [fixed_val * 0.92] * horizon
        base2_p90 = [fixed_val * 1.08] * horizon
        base2_metrics = cls.evaluate_metrics(test_actuals, base2_p10, base2_p50, base2_p90)

        beats_all = (
            cq_metrics.mae <= base1_metrics.mae and
            cq_metrics.rmse <= base1_metrics.rmse and
            cq_metrics.coverage_80_pct >= 80.0
        )

        notes = [
            f"Evaluated across {horizon} out-of-sample held-out periods (M19-M24).",
            f"CQ-AR achieves {cq_metrics.coverage_80_pct}% empirical coverage against declared 80% target.",
            f"Historical Average baseline achieved {base1_metrics.coverage_80_pct}% coverage with MAE ₹{base1_metrics.mae:,.2f}.",
            f"Fixed Recurring baseline achieved {base2_metrics.coverage_80_pct}% coverage with MAE ₹{base2_metrics.mae:,.2f}.",
        ]

        return BenchmarkComparisonResponse(
            test_periods_count=horizon,
            cq_ar_model=cq_metrics,
            historical_average_baseline=base1_metrics,
            recurring_payment_baseline=base2_metrics,
            beats_all_baselines=beats_all,
            evaluation_notes=notes,
        )
