"""
Unit tests for FinancialSynthesizer and ConformalQuantileEngine (FIN 02 Addition 2).
Verifies:
- 24-month ledger generation and chronological split integrity
- Quantile monotonicity (P10 <= P50 <= P90)
- Split-conformal calibration achieving >= 80% empirical coverage
"""

import pytest
import numpy as np
from app.services.forecasting.synthesizer import FinancialSynthesizer
from app.services.forecasting.conformal_engine import ConformalQuantileEngine


def test_synthesizer_24_months_and_splits():
    synth = FinancialSynthesizer(seed=42)
    history = synth.generate_24_months()

    assert len(history) == 24
    train_s, val_s, test_s = synth.get_splits(history)

    assert len(train_s) == 12
    assert len(val_s) == 6
    assert len(test_s) == 6

    # Verify cash conservation on each period:
    for p in history:
        assert p.total_income > 0
        assert p.total_essential > 0
        assert p.discretionary > 0
        expected_net = round(p.total_income - p.total_essential - p.discretionary, 2)
        assert abs(p.net_cash_flow - expected_net) < 0.05


def test_conformal_engine_fit_calibrate_and_monotonicity():
    synth = FinancialSynthesizer(seed=42)
    history = synth.generate_24_months()
    train_s, val_s, test_s = synth.get_splits(history)

    train_income = [p.total_income for p in train_s]
    val_income = [p.total_income for p in val_s]

    engine = ConformalQuantileEngine(target_coverage=0.80)
    engine.fit(train_income)

    assert engine.is_fitted
    assert 0.10 in engine.models
    assert 0.50 in engine.models
    assert 0.90 in engine.models

    # Calibrate on validation split
    engine.calibrate(calibration_preceding=train_income, calibration_actuals=val_income)
    assert engine.is_calibrated
    assert engine.conformal_margin >= 0.0

    # Predict 6-month horizon
    preds = engine.predict_horizon(train_income + val_income, horizon=6)
    assert len(preds) == 6

    # Verify strict monotonicity: P10 <= P50 <= P90
    for p in preds:
        assert p["p10"] <= p["p50"], f"P10 ({p['p10']}) must be <= P50 ({p['p50']})"
        assert p["p50"] <= p["p90"], f"P50 ({p['p50']}) must be <= P90 ({p['p90']})"


def test_conformal_engine_coverage_guarantee():
    synth = FinancialSynthesizer(seed=42)
    history = synth.generate_24_months()
    train_s, val_s, test_s = synth.get_splits(history)

    train_ess = [p.total_essential for p in train_s]
    val_ess = [p.total_essential for p in val_s]
    test_ess = [p.total_essential for p in test_s]

    engine = ConformalQuantileEngine(target_coverage=0.80)
    engine.fit(train_ess)
    engine.calibrate(calibration_preceding=train_ess, calibration_actuals=val_ess)

    preds = engine.predict_horizon(train_ess + val_ess, horizon=len(test_ess))

    # Check coverage on held-out test data
    hits = 0
    for i, actual in enumerate(test_ess):
        if preds[i]["p10"] <= actual <= preds[i]["p90"]:
            hits += 1

    coverage_pct = (hits / len(test_ess)) * 100.0
    # Conformal guarantee: should achieve at least 80% coverage on test split
    assert coverage_pct >= 80.0, f"Empirical coverage was {coverage_pct}%, expected >= 80%"
