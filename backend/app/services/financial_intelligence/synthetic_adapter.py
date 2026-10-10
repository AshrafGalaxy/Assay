"""Adapters from synthetic dataset rows to Assay engine transaction dicts.

The financial engine (`engine.py`) expects normalised transaction dicts
(credit/debit, category flags). Keep CSV schemas for ML / planning separate;
convert explicitly here for `ledger.py` and the API.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Mapping, Union

import pandas as pd

CsvInput = Union[str, Path, pd.DataFrame]

from app.services.financial_intelligence.synthetic_finance_generator import (
    EMI_CATEGORY,
    INCOME_CATEGORY,
    SAVINGS_CATEGORY,
)

_ESSENTIAL_FIXED = {
    "Housing & Rent",
    "Utilities",
    "Transportation",
    "Groceries",
    EMI_CATEGORY,
}


def synthetic_row_to_engine_transaction(row: Mapping[str, Any]) -> dict[str, Any]:
    """Map one synthetic transactions.csv row to an engine-compatible dict."""
    tx_type = str(row["TransactionType"])
    category = str(row["Category"])
    amount = float(row["Amount"])
    is_recurring = bool(row["IsRecurring"])

    if tx_type == "income" or category == INCOME_CATEGORY:
        ledger_type = "credit"
        is_fixed = True
        is_discretionary = False
    elif tx_type == "savings_transfer" or category == SAVINGS_CATEGORY:
        # Savings leaves the spendable balance; treat as non-discretionary debit.
        ledger_type = "debit"
        is_fixed = False
        is_discretionary = False
    elif tx_type == "debt_payment" or category == EMI_CATEGORY:
        ledger_type = "debit"
        is_fixed = True
        is_discretionary = False
    elif tx_type == "essential_expense":
        ledger_type = "debit"
        is_fixed = category in _ESSENTIAL_FIXED
        is_discretionary = False
    else:
        ledger_type = "debit"
        is_fixed = False
        is_discretionary = True

    return {
        "id": str(row["TransactionID"]),
        "account_id": f"synthetic_{row['UserID']}",
        "amount": amount,
        "type": ledger_type,
        "category": category,
        "merchant_name": str(row["Description"]),
        "description": str(row["Description"]),
        "transaction_date": str(row["TransactionDate"]),
        "is_recurring": is_recurring,
        "is_fixed": is_fixed,
        "is_discretionary": is_discretionary,
        "source_type": "synthetic",
        "user_id": str(row["UserID"]),
        "scenario_id": str(row["ScenarioID"]),
    }


def transactions_frame_to_engine(
    transactions: pd.DataFrame,
    *,
    user_id: str | None = None,
    historical_only: bool = False,
    forecast_start_month: str | None = None,
) -> list[dict[str, Any]]:
    """Convert a synthetic transactions DataFrame into engine transaction dicts.

    When ``historical_only`` is True, rows on/after ``forecast_start_month``
    (YYYY-MM) are excluded to prevent future leakage into forecasting features.
    """
    frame = transactions
    if user_id is not None:
        frame = frame[frame["UserID"] == user_id]
    if historical_only:
        if not forecast_start_month:
            raise ValueError("forecast_start_month is required when historical_only=True")
        month = pd.to_datetime(frame["TransactionDate"]).dt.strftime("%Y-%m")
        frame = frame[month < forecast_start_month]

    return [synthetic_row_to_engine_transaction(row) for row in frame.to_dict(orient="records")]


def _as_frame(value: CsvInput) -> pd.DataFrame:
    if isinstance(value, pd.DataFrame):
        return value
    return pd.read_csv(value)


def load_user_engine_transactions(
    transactions_csv: CsvInput,
    scenarios_csv: CsvInput,
    user_id: str,
    *,
    historical_only: bool = True,
) -> list[dict[str, Any]]:
    """Convenience loader for a single user's Assay-engine transactions."""
    tx = _as_frame(transactions_csv)
    sc = _as_frame(scenarios_csv)
    row = sc.loc[sc["UserID"] == user_id]
    if row.empty:
        raise KeyError(f"No scenario row for user {user_id}")
    forecast_start = str(row.iloc[0]["ForecastStartMonth"])
    return transactions_frame_to_engine(
        tx,
        user_id=user_id,
        historical_only=historical_only,
        forecast_start_month=forecast_start,
    )
