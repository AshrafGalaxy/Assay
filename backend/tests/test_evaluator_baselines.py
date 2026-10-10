"""
Unit tests for ForecastEvaluator and Baseline Comparison Suite (FIN 02 Addition 2).
Verifies:
- Out-of-sample held-out benchmarking
- Calculation of CRPS, MAE, RMSE, empirical coverage, and interval width
- Outperformance over Historical Average baseline
"""

import pytest
from app.services.forecasting.synthesizer import FinancialSynthesizer
from app.services.forecasting.conformal_engine import ConformalQuantileEngine
from app.services.forecasting.evaluator import ForecastEvaluator


def test_evaluator_crps_and_metrics():
    actuals = [50000.0, 52000.0, 49000.0, 54000.0]
    p10 = [45000.0, 46000.0, 44000.0, 48000.0]
    p50 = [50000.0, 51000.0, 49000.0, 53000.0]
    p90 = [56000.0, 57000.0, 55000.0, 60000.0]

    metrics = ForecastEvaluator.evaluate_metrics(actuals, p10, p50, p90)

    assert metrics.mae >= 0
    assert metrics.rmse >= metrics.mae  # Mathematical property: RMSE >= MAE
    assert metrics.crps >= 0
    assert metrics.coverage_80_pct == 100.0  # All actuals fall inside [p10, p90]
    assert metrics.interval_width > 0


def test_benchmark_runner_beats_baselines():
    synth = FinancialSynthesizer(seed=42)
    history = synth.generate_24_months()
    train_s, val_s, test_s = synth.get_splits(history)

    train_inc = [p.total_income for p in train_s]
    val_inc = [p.total_income for p in val_s]
    test_inc = [p.total_income for p in test_s]

    engine = ConformalQuantileEngine(target_coverage=0.80)
    engine.fit(train_inc)
    engine.calibrate(calibration_preceding=train_inc, calibration_actuals=val_inc)

    res = ForecastEvaluator.run_benchmark(
        history_before_test=train_inc + val_inc,
        test_actuals=test_inc,
        cq_engine=engine,
    )

    assert res.test_periods_count == 6
    assert res.cq_ar_model.coverage_80_pct >= 80.0
    assert res.cq_ar_model.mae <= res.historical_average_baseline.mae
    assert len(res.evaluation_notes) >= 3
