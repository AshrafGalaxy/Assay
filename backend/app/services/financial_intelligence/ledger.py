"""API ledger backed by the Assay synthetic personal-finance dataset.

Replaces the old hardcoded demo ledger. Loads CSV output from
`synthetic_finance_generator` and adapts rows into the transaction dicts
expected by `engine.py` and the FastAPI routes.

Observed API data uses historical months only (`IsFutureOutcome == False`) so
future shock outcomes never leak into live financial-health responses.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any

import pandas as pd

from app.core.config import settings
from app.services.financial_intelligence.synthetic_adapter import transactions_frame_to_engine
from app.services.financial_intelligence.synthetic_finance_generator import (
    DEFAULT_OUTPUT_DIR,
    SCENARIO_STABLE,
    GeneratorConfig,
    generate_and_export,
)


def synthetic_data_dir() -> Path:
    configured = getattr(settings, "SYNTHETIC_DATA_DIR", None) or str(DEFAULT_OUTPUT_DIR)
    path = Path(configured)
    if not path.is_absolute():
        # Resolve relative to the backend package root (…/backend).
        path = Path(__file__).resolve().parents[3] / path
    return path


def ensure_synthetic_dataset(data_dir: Path | None = None) -> Path:
    """Return a directory containing the five CSVs, generating one if missing."""
    root = data_dir or synthetic_data_dir()
    required = ("users.csv", "transactions.csv", "monthly_finances.csv", "scenarios.csv")
    if all((root / name).exists() for name in required):
        return root

    config = GeneratorConfig(
        n_users=max(5, int(settings.SYNTHETIC_BOOTSTRAP_USERS)),
        start_month=settings.SYNTHETIC_START_MONTH,
        historical_months=int(settings.SYNTHETIC_HISTORICAL_MONTHS),
        forecast_horizon=int(settings.SYNTHETIC_FORECAST_HORIZON),
        seed=int(settings.SYNTHETIC_SEED),
        output_dir=root,
    )
    generate_and_export(config)
    _load_frames.cache_clear()
    _resolve_default_user_id.cache_clear()
    return root


def _dataset_fingerprint(data_dir: Path) -> tuple[str, float]:
    tx_path = data_dir / "transactions.csv"
    mtime = tx_path.stat().st_mtime if tx_path.exists() else 0.0
    return (str(data_dir.resolve()), mtime)


@lru_cache(maxsize=4)
def _load_frames(data_dir_str: str, mtime: float) -> dict[str, pd.DataFrame]:
    data_dir = Path(data_dir_str)
    frames = {
        "users": pd.read_csv(data_dir / "users.csv"),
        "transactions": pd.read_csv(data_dir / "transactions.csv"),
        "scenarios": pd.read_csv(data_dir / "scenarios.csv"),
    }
    monthly_path = data_dir / "monthly_finances.csv"
    if monthly_path.exists():
        frames["monthly_finances"] = pd.read_csv(monthly_path)
    return frames


@lru_cache(maxsize=4)
def _resolve_default_user_id(data_dir_str: str, mtime: float, configured_user: str) -> str:
    frames = _load_frames(data_dir_str, mtime)
    users = frames["users"]
    if configured_user:
        if configured_user not in set(users["UserID"].astype(str)):
            raise KeyError(f"SYNTHETIC_USER_ID={configured_user!r} not found in {data_dir_str}")
        return configured_user

    stable = users[users["ScenarioType"] == SCENARIO_STABLE]
    pool = stable if not stable.empty else users
    # Prefer a mid-income stable user for a realistic dashboard baseline.
    pool = pool.sort_values("BaseMonthlyIncome")
    return str(pool.iloc[len(pool) // 2]["UserID"])


def get_active_user_id() -> str:
    data_dir = ensure_synthetic_dataset()
    fingerprint = _dataset_fingerprint(data_dir)
    return _resolve_default_user_id(
        fingerprint[0],
        fingerprint[1],
        (settings.SYNTHETIC_USER_ID or "").strip(),
    )


def get_user_profile(user_id: str | None = None) -> dict[str, Any]:
    """Return synthetic user profile fields used by forecasting / what-if."""
    data_dir = ensure_synthetic_dataset()
    fingerprint = _dataset_fingerprint(data_dir)
    frames = _load_frames(fingerprint[0], fingerprint[1])
    active_user = user_id or _resolve_default_user_id(
        fingerprint[0],
        fingerprint[1],
        (settings.SYNTHETIC_USER_ID or "").strip(),
    )
    users = frames["users"]
    row = users.loc[users["UserID"].astype(str) == str(active_user)]
    if row.empty:
        raise KeyError(f"No user profile for {active_user}")
    record = row.iloc[0]
    scenarios = frames["scenarios"]
    sc = scenarios.loc[scenarios["UserID"].astype(str) == str(active_user)]
    return {
        "user_id": str(active_user),
        "base_monthly_income": float(record["BaseMonthlyIncome"]),
        "income_volatility": float(record["IncomeVolatility"]),
        "starting_balance": float(record["StartingBalance"]),
        "minimum_reserve": float(record["MinimumReserve"]),
        "monthly_emi": float(record["MonthlyEMI"]),
        "savings_target": float(record["SavingsTarget"]),
        "scenario_type": str(record["ScenarioType"]),
        "forecast_start_month": str(sc.iloc[0]["ForecastStartMonth"]) if not sc.empty else None,
    }


def get_ledger_transactions(
    *,
    user_id: str | None = None,
    historical_only: bool = True,
) -> list[dict[str, Any]]:
    """Return Assay-engine transactions for the active (or given) synthetic user."""
    data_dir = ensure_synthetic_dataset()
    fingerprint = _dataset_fingerprint(data_dir)
    frames = _load_frames(fingerprint[0], fingerprint[1])
    active_user = user_id or _resolve_default_user_id(
        fingerprint[0],
        fingerprint[1],
        (settings.SYNTHETIC_USER_ID or "").strip(),
    )
    scenarios = frames["scenarios"]
    row = scenarios.loc[scenarios["UserID"].astype(str) == str(active_user)]
    if row.empty:
        raise KeyError(f"No scenario metadata for user {active_user}")
    forecast_start = str(row.iloc[0]["ForecastStartMonth"])

    transactions = frames["transactions"]
    return transactions_frame_to_engine(
        transactions,
        user_id=str(active_user),
        historical_only=historical_only,
        forecast_start_month=forecast_start,
    )


def get_transaction_by_id(transaction_id: str) -> dict[str, Any] | None:
    """Lookup a synthetic transaction by id across the active user's ledger."""
    for item in get_ledger_transactions(historical_only=False):
        if item["id"] == transaction_id:
            return item
    # Fall back to full dataset scan (other users) for direct ID lookups.
    data_dir = ensure_synthetic_dataset()
    fingerprint = _dataset_fingerprint(data_dir)
    frames = _load_frames(fingerprint[0], fingerprint[1])
    match = frames["transactions"].loc[
        frames["transactions"]["TransactionID"].astype(str) == str(transaction_id)
    ]
    if match.empty:
        return None
    from app.services.financial_intelligence.synthetic_adapter import synthetic_row_to_engine_transaction

    return synthetic_row_to_engine_transaction(match.iloc[0].to_dict())


def get_monthly_finance_row(
    *,
    user_id: str | None = None,
    month: str | None = None,
    historical_only: bool = True,
) -> dict[str, Any] | None:
    """Return one monthly_finances.csv row for the active user (generator truth)."""
    data_dir = ensure_synthetic_dataset()
    fingerprint = _dataset_fingerprint(data_dir)
    frames = _load_frames(fingerprint[0], fingerprint[1])
    monthly = frames.get("monthly_finances")
    if monthly is None or monthly.empty:
        return None

    active_user = user_id or _resolve_default_user_id(
        fingerprint[0],
        fingerprint[1],
        (settings.SYNTHETIC_USER_ID or "").strip(),
    )
    rows = monthly[monthly["UserID"].astype(str) == str(active_user)].copy()
    if historical_only and "IsFutureOutcome" in rows.columns:
        rows = rows[~rows["IsFutureOutcome"].astype(bool)]
    if rows.empty:
        return None
    if month:
        match = rows[rows["Month"].astype(str) == month]
        if match.empty:
            return None
        record = match.iloc[0]
    else:
        record = rows.sort_values("Month").iloc[-1]
    return {key: record[key] for key in record.index}


def clear_ledger_cache() -> None:
    """Test helper to drop cached frames after regenerating data."""
    _load_frames.cache_clear()
    _resolve_default_user_id.cache_clear()
