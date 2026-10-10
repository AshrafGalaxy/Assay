"""Forecast provider seam for Assay cash-flow prediction.

Current default: deterministic run-rate projections grounded in the synthetic ledger.
When an ML model is added, implement ``MlForecastProvider`` and set:

    FORECAST_PROVIDER=ml
    FORECAST_MODEL_PATH=/path/to/model.joblib

The What-If simulator and Cash Flow Forecast UI should always read ``source`` /
``model_id`` from the response so they never mix model outputs with invented UI math.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from calendar import monthrange
from datetime import date, timedelta
from typing import Any

from app.core.config import settings
from app.services.financial_intelligence.engine import (
    _baseline_run_rate,
    _date,
    _money,
)


def _event_type(category: str, tx_type: str) -> str:
    cat = category.lower()
    if tx_type == "credit" or "salary" in cat:
        return "income"
    if "emi" in cat or "debt" in cat:
        return "emi"
    if "subscription" in cat:
        return "subscription"
    return "bill"


def build_observed_daily_path(
    transactions: list[dict[str, Any]],
    *,
    month: str,
    opening_balance: float,
    minimum_reserve: float,
) -> dict[str, Any]:
    """Rebuild day-by-day closing balances for one calendar month from ledger txs.

    This is observed generator data (not a model forecast).
    """
    year_s, month_s = month.split("-")
    year, month_n = int(year_s), int(month_s)
    days_in_month = monthrange(year, month_n)[1]

    by_day: dict[int, list[dict[str, Any]]] = {d: [] for d in range(1, days_in_month + 1)}
    for tx in transactions:
        tx_date = _date(tx["transaction_date"])
        if tx_date.year != year or tx_date.month != month_n:
            continue
        by_day[tx_date.day].append(tx)

    points: list[dict[str, Any]] = []
    balance = float(opening_balance)
    min_balance = balance
    trough_day = 1

    for day in range(1, days_in_month + 1):
        day_txs = sorted(by_day[day], key=lambda item: item["transaction_date"])
        primary_event = None
        for tx in day_txs:
            amount = float(tx["amount"])
            if tx["type"] == "credit":
                balance += amount
            else:
                balance -= amount
            # Keep the largest absolute movement as the day's highlight event.
            if primary_event is None or abs(amount) > abs(primary_event["amount"]):
                primary_event = {
                    "name": tx.get("merchant_name") or tx.get("description") or tx.get("category"),
                    "amount": amount if tx["type"] == "credit" else -amount,
                    "event_type": _event_type(str(tx.get("category", "")), str(tx["type"])),
                    "category": tx.get("category"),
                }

        balance = _money(balance)
        if balance < min_balance:
            min_balance = balance
            trough_day = day

        point: dict[str, Any] = {
            "day": day,
            "date": date(year, month_n, day).isoformat(),
            "label": date(year, month_n, day).strftime("%-d %b") if hasattr(date, "strftime") else f"{day}",
            "balance": balance,
            "pct_x": round((day - 1) / max(days_in_month - 1, 1), 4),
            "is_forecast": False,
            "source": "observed_ledger",
        }
        # Prefer portable day labels (Windows lacks %-d).
        point["label"] = f"{day} {date(year, month_n, day).strftime('%b')}"
        if primary_event:
            point["event"] = primary_event["name"]
            point["event_amount"] = primary_event["amount"]
            point["event_type"] = primary_event["event_type"]
            point["event_category"] = primary_event["category"]
        points.append(point)

    reserve_breaches = [p for p in points if p["balance"] < minimum_reserve]
    return {
        "month": month,
        "opening_balance": _money(opening_balance),
        "closing_balance": points[-1]["balance"] if points else _money(opening_balance),
        "minimum_balance": _money(min_balance),
        "minimum_balance_day": trough_day,
        "minimum_reserve": _money(minimum_reserve),
        "reserve_breached": bool(reserve_breaches),
        "points": points,
        "source": "observed_ledger",
        "model_id": None,
        "limitations": [
            "Daily balances are reconstructed from synthetic generator transactions and monthly opening cash.",
            "This series is observed history for the selected month, not an ML forecast.",
        ],
    }


class ForecastProvider(ABC):
    """Interface future ML models must satisfy."""

    model_id: str = "base"

    @abstractmethod
    def project_daily(
        self,
        transactions: list[dict[str, Any]],
        *,
        start_date: date,
        horizon_days: int,
        opening_balance: float,
        minimum_reserve: float,
        profile: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Return a forward daily balance path with source/model metadata."""


class RunRateForecastProvider(ForecastProvider):
    """Deterministic provider used until an ML artefact is available."""

    model_id = "run_rate_v1"

    def project_daily(
        self,
        transactions: list[dict[str, Any]],
        *,
        start_date: date,
        horizon_days: int,
        opening_balance: float,
        minimum_reserve: float,
        profile: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        profile = profile or {}
        run_rate = _baseline_run_rate(transactions)
        income = run_rate["income"]
        essential = run_rate["essential"]
        discretionary = run_rate["discretionary"]
        emi = run_rate["emi"] or float(profile.get("monthly_emi") or 0.0)
        savings = run_rate["savings"]
        monthly_out = essential + discretionary + emi + savings
        daily_net = _money((income - monthly_out) / 30.0)
        volatility = float(profile.get("income_volatility") or 0.05)

        points: list[dict[str, Any]] = []
        balance = float(opening_balance)
        min_balance = balance
        trough_day = 1
        for offset in range(horizon_days):
            day_date = start_date + timedelta(days=offset)
            # Salary credited on day 1 of each projected month.
            day_delta = daily_net
            event = None
            if day_date.day == 1:
                day_delta = _money(day_delta + income * 0.15)
                event = {
                    "event": "Projected income pulse",
                    "event_amount": _money(income / 30.0 * 5),
                    "event_type": "income",
                }
            if day_date.day == 5 and emi > 0:
                day_delta = _money(day_delta - emi / 30.0 * 8)
                event = {
                    "event": "Projected EMI pressure",
                    "event_amount": _money(-(emi / 30.0 * 8)),
                    "event_type": "emi",
                }
            balance = _money(balance + day_delta)
            if balance < min_balance:
                min_balance = balance
                trough_day = offset + 1
            band = _money(abs(income) * volatility / 30.0 * (offset + 1) ** 0.5)
            point = {
                "day": offset + 1,
                "date": day_date.isoformat(),
                "label": f"{day_date.day} {day_date.strftime('%b')}",
                "balance": balance,
                "balance_low": _money(balance - band),
                "balance_high": _money(balance + band),
                "pct_x": round(offset / max(horizon_days - 1, 1), 4),
                "is_forecast": True,
                "source": "run_rate_projection",
            }
            if event:
                point.update(event)
            points.append(point)

        return {
            "horizon_days": horizon_days,
            "opening_balance": _money(opening_balance),
            "closing_balance": points[-1]["balance"] if points else _money(opening_balance),
            "minimum_balance": _money(min_balance),
            "minimum_balance_day": trough_day,
            "minimum_reserve": _money(minimum_reserve),
            "reserve_breached": any(p["balance"] < minimum_reserve for p in points),
            "points": points,
            "source": "run_rate_projection",
            "model_id": self.model_id,
            "limitations": [
                "Run-rate provider spreads observed monthly income/spend into a daily path.",
                "Replace with MlForecastProvider when a trained artefact is available.",
            ],
        }


class MlForecastProvider(ForecastProvider):
    """Placeholder for a trained model.

    Expected contract when implemented:
    - Load artefact from ``settings.FORECAST_MODEL_PATH``
    - Transform historical monthly/transaction features
    - Return daily (or monthly) mean path + optional quantiles
    - Set ``source='ml_model'`` and a real ``model_id``
    """

    model_id = "ml_unconfigured"

    def __init__(self, model_path: str | None = None):
        self.model_path = model_path or getattr(settings, "FORECAST_MODEL_PATH", "")
        self._model = None
        if self.model_path:
            try:
                # Optional dependency — only used when an artefact exists.
                import joblib  # type: ignore

                self._model = joblib.load(self.model_path)
                self.model_id = f"ml:{self.model_path}"
            except Exception:
                self._model = None
                self.model_id = "ml_load_failed"

    def project_daily(
        self,
        transactions: list[dict[str, Any]],
        *,
        start_date: date,
        horizon_days: int,
        opening_balance: float,
        minimum_reserve: float,
        profile: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if self._model is None:
            # Safe fallback: never invent ML numbers when the model is missing.
            fallback = RunRateForecastProvider().project_daily(
                transactions,
                start_date=start_date,
                horizon_days=horizon_days,
                opening_balance=opening_balance,
                minimum_reserve=minimum_reserve,
                profile=profile,
            )
            fallback["source"] = "run_rate_projection"
            fallback["model_id"] = self.model_id
            fallback["limitations"] = [
                "FORECAST_PROVIDER=ml but no usable model artefact was loaded.",
                "Fell back to run_rate_projection so the UI is not shown fabricated ML confidence.",
                *fallback.get("limitations", []),
            ]
            return fallback

        # Hook for the real model:
        # features = build_features(transactions, profile)
        # preds = self._model.predict(features)  # expected shape: (horizon_days,) or quantiles
        raise NotImplementedError(
            "MlForecastProvider loaded a model but predict() wiring is not implemented yet. "
            "Implement feature building + predict mapping, then return source='ml_model'."
        )


def get_forecast_provider() -> ForecastProvider:
    provider = (getattr(settings, "FORECAST_PROVIDER", "run_rate") or "run_rate").lower()
    if provider == "ml":
        return MlForecastProvider()
    return RunRateForecastProvider()


def build_cash_flow_daily_view(
    transactions: list[dict[str, Any]],
    *,
    month: str | None,
    opening_balance: float,
    minimum_reserve: float,
    profile: dict[str, Any] | None = None,
    include_forecast_days: int = 0,
) -> dict[str, Any]:
    """Compose observed daily path (generator) + optional forward forecast from provider."""
    if not transactions and not month:
        return {
            "month": None,
            "points": [],
            "source": "observed_ledger",
            "model_id": None,
            "limitations": ["No transactions available for daily cash path."],
        }

    if not month:
        latest = max(_date(tx["transaction_date"]) for tx in transactions)
        month = f"{latest.year:04d}-{latest.month:02d}"

    observed = build_observed_daily_path(
        transactions,
        month=month,
        opening_balance=opening_balance,
        minimum_reserve=minimum_reserve,
    )

    forecast_block = None
    if include_forecast_days > 0:
        provider = get_forecast_provider()
        last_date = date.fromisoformat(observed["points"][-1]["date"]) if observed["points"] else date.today()
        forecast_block = provider.project_daily(
            transactions,
            start_date=last_date + timedelta(days=1),
            horizon_days=include_forecast_days,
            opening_balance=float(observed["closing_balance"]),
            minimum_reserve=minimum_reserve,
            profile=profile,
        )

    combined = list(observed["points"])
    if forecast_block:
        offset = len(combined)
        for index, point in enumerate(forecast_block["points"]):
            combined.append({
                **point,
                "day": offset + index + 1,
            })
    total = max(len(combined) - 1, 1)
    for index, point in enumerate(combined):
        point["pct_x"] = round(index / total, 4)

    return {
        "month": month,
        "observed": observed,
        "forecast": forecast_block,
        "points": combined,
        "opening_balance": observed["opening_balance"],
        "closing_balance": (
            forecast_block["closing_balance"] if forecast_block else observed["closing_balance"]
        ),
        "minimum_balance": min(
            observed["minimum_balance"],
            forecast_block["minimum_balance"] if forecast_block else observed["minimum_balance"],
        ),
        "minimum_reserve": minimum_reserve,
        "source": "observed_ledger+forecast" if forecast_block else "observed_ledger",
        "forecast_source": forecast_block["source"] if forecast_block else None,
        "model_id": forecast_block["model_id"] if forecast_block else None,
        "limitations": observed["limitations"] + (forecast_block["limitations"] if forecast_block else []),
    }
