"""Tests for the synthetic personal-finance dataset generator."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.services.financial_intelligence.engine import build_financial_health
from app.services.financial_intelligence.synthetic_adapter import (
    load_user_engine_transactions,
    transactions_frame_to_engine,
)
from app.services.financial_intelligence.synthetic_finance_generator import (
    MANDATORY_SCENARIOS,
    SCENARIO_HIGH_UNCERTAINTY,
    SCENARIO_INFEASIBLE_TARGET,
    SCENARIO_INCOME_REDUCTION,
    SCENARIO_STABLE,
    SCENARIO_UNEXPECTED_EXPENSE,
    GeneratorConfig,
    GeneratorConfigError,
    export_dataset,
    generate_dataset,
    load_dataset,
    validate_dataset,
)


def _small_config(tmp_path: Path, *, seed: int = 42, n_users: int = 10) -> GeneratorConfig:
    return GeneratorConfig(
        n_users=n_users,
        start_month="2023-01",
        historical_months=6,
        forecast_horizon=3,
        seed=seed,
        output_dir=tmp_path / f"out_{seed}",
    )


def test_same_seed_is_deterministic(tmp_path: Path):
    cfg_a = _small_config(tmp_path, seed=42)
    cfg_b = GeneratorConfig(
        n_users=cfg_a.n_users,
        start_month=cfg_a.start_month,
        historical_months=cfg_a.historical_months,
        forecast_horizon=cfg_a.forecast_horizon,
        seed=42,
        output_dir=tmp_path / "out_b",
    )
    a = generate_dataset(cfg_a)
    b = generate_dataset(cfg_b)
    for key in a:
        pd.testing.assert_frame_equal(a[key], b[key])


def test_different_seeds_differ(tmp_path: Path):
    a = generate_dataset(_small_config(tmp_path, seed=1))
    b = generate_dataset(_small_config(tmp_path, seed=2))
    assert not a["transactions"]["Amount"].equals(b["transactions"]["Amount"])


def test_invalid_config_rejected():
    with pytest.raises(GeneratorConfigError):
        GeneratorConfig(n_users=2)
    with pytest.raises(GeneratorConfigError):
        GeneratorConfig(historical_months=0)
    with pytest.raises(GeneratorConfigError):
        GeneratorConfig(forecast_horizon=0)
    with pytest.raises(GeneratorConfigError):
        GeneratorConfig(start_month="2023-13")
    with pytest.raises(GeneratorConfigError):
        GeneratorConfig(seed=-1)


def test_month_counts_and_continuity(tmp_path: Path):
    cfg = _small_config(tmp_path)
    frames = generate_dataset(cfg)
    report = validate_dataset(frames, config=cfg)
    assert report.ok, report.errors
    monthly = frames["monthly_finances"]
    expected = cfg.historical_months + cfg.forecast_horizon
    assert (monthly.groupby("UserID").size() == expected).all()


def test_cash_flow_and_transaction_reconciliation(tmp_path: Path):
    cfg = _small_config(tmp_path, n_users=8)
    frames = generate_dataset(cfg)
    report = validate_dataset(frames, config=cfg)
    assert report.ok, report.errors
    assert report.summary["cash_flow_ok"]
    assert report.summary["transaction_reconcile_ok"]


def test_transaction_ids_unique_and_amounts_positive(tmp_path: Path):
    frames = generate_dataset(_small_config(tmp_path))
    tx = frames["transactions"]
    assert tx["TransactionID"].is_unique
    assert (tx["Amount"] > 0).all()
    pd.to_datetime(tx["TransactionDate"], format="%Y-%m-%d")


def test_all_mandatory_scenarios_present(tmp_path: Path):
    frames = generate_dataset(_small_config(tmp_path, n_users=5))
    present = set(frames["users"]["ScenarioType"])
    assert present == set(MANDATORY_SCENARIOS)


def test_income_reduction_bounds_and_future_only(tmp_path: Path):
    cfg = _small_config(tmp_path, n_users=15, seed=7)
    frames = generate_dataset(cfg)
    sc = frames["scenarios"]
    monthly = frames["monthly_finances"]
    reductions = sc[sc["ScenarioType"] == SCENARIO_INCOME_REDUCTION]
    assert not reductions.empty
    assert ((reductions["IncomeReductionPct"] >= 0.25) & (reductions["IncomeReductionPct"] <= 0.35)).all()
    for _, row in reductions.iterrows():
        assert row["ShockMonth"] >= row["ForecastStartMonth"]
        hist = monthly[(monthly["UserID"] == row["UserID"]) & (~monthly["IsFutureOutcome"])]
        shocked = monthly[(monthly["UserID"] == row["UserID"]) & (monthly["Month"] == row["ShockMonth"])]
        assert float(shocked.iloc[0]["Income"]) < 0.9 * float(hist["Income"].mean())


def test_unexpected_expense_in_future(tmp_path: Path):
    frames = generate_dataset(_small_config(tmp_path, n_users=12, seed=9))
    sc = frames["scenarios"]
    monthly = frames["monthly_finances"]
    rows = sc[sc["ScenarioType"] == SCENARIO_UNEXPECTED_EXPENSE]
    assert not rows.empty
    for _, row in rows.iterrows():
        assert float(row["UnexpectedEssentialExpense"]) > 0
        assert row["ShockMonth"] >= row["ForecastStartMonth"]
        shocked = monthly[(monthly["UserID"] == row["UserID"]) & (monthly["Month"] == row["ShockMonth"])]
        assert float(shocked.iloc[0]["EssentialExpenses"]) >= float(row["UnexpectedEssentialExpense"]) - 0.01


def test_history_unchanged_by_shocks(tmp_path: Path):
    """Shocks must never appear before ForecastStartMonth."""
    frames = generate_dataset(_small_config(tmp_path, n_users=20, seed=11))
    sc = frames["scenarios"]
    for _, row in sc.iterrows():
        if row["ShockMonth"]:
            assert row["ShockMonth"] >= row["ForecastStartMonth"]


def test_high_uncertainty_more_variable_than_stable(tmp_path: Path):
    cfg = GeneratorConfig(
        n_users=20,
        start_month="2023-01",
        historical_months=12,
        forecast_horizon=3,
        seed=42,
        output_dir=tmp_path / "vol",
    )
    frames = generate_dataset(cfg)
    users = frames["users"]
    monthly = frames["monthly_finances"]
    assert users.loc[users["ScenarioType"] == SCENARIO_HIGH_UNCERTAINTY, "IncomeVolatility"].mean() > (
        users.loc[users["ScenarioType"] == SCENARIO_STABLE, "IncomeVolatility"].mean()
    )

    def income_std(scenario: str) -> float:
        ids = set(users.loc[users["ScenarioType"] == scenario, "UserID"])
        subset = monthly[monthly["UserID"].isin(ids) & (~monthly["IsFutureOutcome"])]
        return float(subset.groupby("UserID")["Income"].std().mean())

    assert income_std(SCENARIO_HIGH_UNCERTAINTY) > income_std(SCENARIO_STABLE)


def test_infeasible_targets_labelled_false(tmp_path: Path):
    frames = generate_dataset(_small_config(tmp_path, n_users=15, seed=3))
    sc = frames["scenarios"]
    infeasible = sc[sc["ScenarioType"] == SCENARIO_INFEASIBLE_TARGET]
    assert not infeasible.empty
    assert (~infeasible["TargetFeasibleUnderRealizedSavings"]).all()


def test_reserve_violation_flag(tmp_path: Path):
    frames = generate_dataset(_small_config(tmp_path, n_users=12, seed=5))
    monthly = frames["monthly_finances"]
    computed = monthly["ClosingBalance"] < monthly["MinimumReserve"]
    assert (computed == monthly["ReserveViolated"]).all()


def test_csv_export_reload_preserves_values(tmp_path: Path):
    cfg = _small_config(tmp_path)
    frames = generate_dataset(cfg)
    export_dataset(frames, cfg.output_dir)
    reloaded = load_dataset(cfg.output_dir)
    for key in ("users", "transactions", "monthly_finances", "obligations", "scenarios"):
        assert list(reloaded[key].columns) == list(frames[key].columns)
    assert np.allclose(
        reloaded["monthly_finances"]["ClosingBalance"],
        frames["monthly_finances"]["ClosingBalance"],
        atol=0.01,
    )


def test_boundary_no_emi_and_zero_discretionary(tmp_path: Path):
    # Large enough sample that generator RNG hits boundary branches.
    frames = generate_dataset(_small_config(tmp_path, n_users=40, seed=99))
    users = frames["users"]
    monthly = frames["monthly_finances"]
    assert (users["MonthlyEMI"] == 0).any()
    assert (monthly["DiscretionaryExpenses"] == 0).any()
    assert (monthly["SavingsContribution"] <= monthly["PlannedSavings"] + 1e-9).all()
    # When cash before savings is negative, contribution must be zero.
    cash_before = (
        monthly["OpeningBalance"] + monthly["Income"]
        - monthly["EssentialExpenses"] - monthly["DiscretionaryExpenses"]
        - monthly["EMIPayment"]
    )
    forced_zero = monthly.loc[cash_before < 0, "SavingsContribution"]
    if len(forced_zero):
        assert (forced_zero == 0).all()


def test_adapter_maps_to_engine_and_blocks_future_leakage(tmp_path: Path):
    cfg = _small_config(tmp_path, n_users=5, seed=42)
    frames = generate_dataset(cfg)
    user_id = frames["users"].iloc[0]["UserID"]
    forecast_start = frames["scenarios"].loc[
        frames["scenarios"]["UserID"] == user_id, "ForecastStartMonth"
    ].iloc[0]
    engine_txs = transactions_frame_to_engine(
        frames["transactions"],
        user_id=user_id,
        historical_only=True,
        forecast_start_month=forecast_start,
    )
    assert engine_txs
    assert all(tx["transaction_date"][:7] < forecast_start for tx in engine_txs)
    assert all(tx["type"] in {"credit", "debit"} for tx in engine_txs)
    health = build_financial_health(engine_txs)
    assert "health_score" in health

    export_dataset(frames, cfg.output_dir)
    loaded = load_user_engine_transactions(
        cfg.output_dir / "transactions.csv",
        cfg.output_dir / "scenarios.csv",
        user_id,
        historical_only=True,
    )
    assert len(loaded) == len(engine_txs)


def test_validation_report_fails_on_tamper(tmp_path: Path):
    cfg = _small_config(tmp_path)
    frames = generate_dataset(cfg)
    frames["monthly_finances"].loc[0, "ClosingBalance"] += 100
    report = validate_dataset(frames, config=cfg)
    assert not report.ok
    assert any("cash-flow" in e for e in report.errors)
