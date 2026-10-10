"""Optional synthetic CSV ledger for demos / evaluation.

Production default is a clean slate: ``SYNTHETIC_LEDGER_ENABLED=false`` and no
auto-generated CSVs. When disabled (or CSVs are missing), the API returns empty
transaction lists so manual / bank data is the only source.
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


def synthetic_ledger_enabled() -> bool:
    return bool(getattr(settings, "SYNTHETIC_LEDGER_ENABLED", False))


def synthetic_data_dir() -> Path:
    configured = getattr(settings, "SYNTHETIC_DATA_DIR", None) or str(DEFAULT_OUTPUT_DIR)
    path = Path(configured)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[3] / path
    return path


def _required_csvs(root: Path) -> tuple[str, ...]:
    return ("users.csv", "transactions.csv", "monthly_finances.csv", "scenarios.csv")


def dataset_available(data_dir: Path | None = None) -> bool:
    root = data_dir or synthetic_data_dir()
    return all((root / name).exists() for name in _required_csvs(root))


def ensure_synthetic_dataset(data_dir: Path | None = None) -> Path | None:
    """Return dataset dir when usable; never auto-bootstrap unless explicitly enabled.

    With ``SYNTHETIC_LEDGER_ENABLED=false`` (default), missing CSVs mean empty ledger.
    With enabled=true and ``SYNTHETIC_BOOTSTRAP_USERS>0``, a small dataset may be generated.
    """
    root = data_dir or synthetic_data_dir()
    # Hard off: never serve synthetic CSVs unless explicitly enabled.
    if not synthetic_ledger_enabled():
        return None

    if dataset_available(root):
        return root

    bootstrap_users = int(getattr(settings, "SYNTHETIC_BOOTSTRAP_USERS", 0) or 0)
    if bootstrap_users <= 0:
        return None

    config = GeneratorConfig(
        n_users=max(5, bootstrap_users),
        start_month=settings.SYNTHETIC_START_MONTH,
        historical_months=int(settings.SYNTHETIC_HISTORICAL_MONTHS),
        forecast_horizon=int(settings.SYNTHETIC_FORECAST_HORIZON),
        seed=int(settings.SYNTHETIC_SEED),
        output_dir=root,
    )
    generate_and_export(config)
    clear_ledger_cache()
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
    pool = pool.sort_values("BaseMonthlyIncome")
    return str(pool.iloc[len(pool) // 2]["UserID"])


def _empty_profile(user_id: str = "local") -> dict[str, Any]:
    return {
        "user_id": user_id,
        "base_monthly_income": 0.0,
        "income_volatility": 0.05,
        "starting_balance": 0.0,
        "minimum_reserve": 10000.0,
        "monthly_emi": 0.0,
        "savings_target": 0.0,
        "scenario_type": None,
        "forecast_start_month": None,
    }


def get_active_user_id() -> str | None:
    data_dir = ensure_synthetic_dataset()
    if data_dir is None or not dataset_available(data_dir):
        return None
    fingerprint = _dataset_fingerprint(data_dir)
    return _resolve_default_user_id(
        fingerprint[0],
        fingerprint[1],
        (settings.SYNTHETIC_USER_ID or "").strip(),
    )


def get_user_profile(user_id: str | None = None) -> dict[str, Any]:
    """Return user profile for forecasting / what-if, or empty defaults on clean slate."""
    data_dir = ensure_synthetic_dataset()
    if data_dir is None or not dataset_available(data_dir):
        return _empty_profile(user_id or "local")

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
        return _empty_profile(str(active_user))
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
    """Return synthetic transactions when the ledger is enabled and present; else []."""
    data_dir = ensure_synthetic_dataset()
    if data_dir is None or not dataset_available(data_dir):
        return []

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
        return []
    forecast_start = str(row.iloc[0]["ForecastStartMonth"])

    transactions = frames["transactions"]
    return transactions_frame_to_engine(
        transactions,
        user_id=str(active_user),
        historical_only=historical_only,
        forecast_start_month=forecast_start,
    )


def get_transaction_by_id(transaction_id: str) -> dict[str, Any] | None:
    """Lookup a synthetic transaction by id, or None on clean slate."""
    for item in get_ledger_transactions(historical_only=False):
        if item["id"] == transaction_id:
            return item

    data_dir = ensure_synthetic_dataset()
    if data_dir is None or not dataset_available(data_dir):
        return None

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
    """Return one monthly_finances.csv row, or None on clean slate."""
    data_dir = ensure_synthetic_dataset()
    if data_dir is None or not dataset_available(data_dir):
        return None

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
