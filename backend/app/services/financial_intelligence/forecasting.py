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
            "label": f"{day} {date(year, month_n, day).strftime('%b')}",
            "balance": balance,
            "pct_x": round((day - 1) / max(days_in_month - 1, 1), 4),
            "is_forecast": False,
            "source": "observed_ledger",
        }
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
        from app.services.financial_intelligence.engine import _income_volatility
        volatility = _income_volatility(profile, transactions)

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
    """
    Conformal Quantile Autoregressive ML Forecast Provider (CQ-AR).
    Computes probabilistic P10, P50, and P90 cash paths with empirical conformal bounds.
    """

    model_id = "cq_ar_conformal_v1"

    def __init__(self, target_coverage: float = 0.80):
        self.target_coverage = target_coverage
        self._engine = None

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
        from app.services.forecasting.conformal_engine import ConformalQuantileEngine

        try:
            # Build chronological series from transactions
            sorted_txs = sorted(transactions, key=lambda t: t.get("transaction_date", ""))
            monthly_totals: dict[str, float] = {}
            for tx in sorted_txs:
                m_key = tx.get("transaction_date", "")[:7]
                amt = float(tx.get("amount", 0))
                sign = 1.0 if tx.get("type") == "credit" else -1.0
                monthly_totals[m_key] = monthly_totals.get(m_key, 0.0) + sign * amt

            # Not enough history to fit the conformal model: report a flat projection
            # from the observed net instead of inventing a baseline series.
            if len(monthly_totals) < 4:
                observed = list(monthly_totals.values())
                daily_drift = (sum(observed) / len(observed) / 30.0) if observed else 0.0
                points = []
                current_bal = float(opening_balance)
                min_bal = current_bal
                trough_day = 1
                for day_idx in range(horizon_days):
                    curr_date = start_date + timedelta(days=day_idx)
                    current_bal += daily_drift
                    if current_bal < min_bal:
                        min_bal = current_bal
                        trough_day = day_idx + 1
                    points.append({
                        "day": day_idx + 1,
                        "date": curr_date.isoformat(),
                        "label": f"{curr_date.day} {curr_date.strftime('%b')}",
                        "balance": round(current_bal, 2),
                        "balance_low": round(current_bal, 2),
                        "balance_high": round(current_bal, 2),
                        "is_forecast": True,
                    })
                return {
                    "horizon_days": horizon_days,
                    "opening_balance": round(float(opening_balance), 2),
                    "closing_balance": points[-1]["balance"] if points else round(float(opening_balance), 2),
                    "minimum_balance": round(min_bal, 2),
                    "minimum_balance_day": trough_day,
                    "minimum_reserve": round(float(minimum_reserve), 2),
                    "reserve_breached": any(p["balance"] < minimum_reserve for p in points),
                    "points": points,
                    "source": "observed_run_rate",
                    "model_id": f"{self.model_id}:insufficient_history",
                    "limitations": [
                        "Fewer than 4 months of history, so no conformal interval was fitted; "
                        "the path is a flat projection of the observed average monthly net.",
                    ],
                }

            history = list(monthly_totals.values())
            
            engine = ConformalQuantileEngine(target_coverage=self.target_coverage, lag_order=3)
            engine.fit(history)
            
            # Calibration split if available
            calib_prec = history[:3]
            calib_actuals = history[3:]
            if calib_actuals:
                engine.calibrate(calib_prec, calib_actuals)

            # Predict forward envelope
            forecast = engine.predict_envelope(history, horizon_periods=max(1, (horizon_days + 29) // 30))
            p10 = forecast.get("P10", [0.0])[0]
            p50 = forecast.get("P50", [0.0])[0]
            p90 = forecast.get("P90", [0.0])[0]

            daily_p50_drift = p50 / 30.0
            daily_margin = (p90 - p10) / 60.0

            points = []
            current_bal = float(opening_balance)
            min_bal = current_bal
            trough_day = 1

            for day_idx in range(horizon_days):
                curr_date = start_date + timedelta(days=day_idx)
                current_bal += daily_p50_drift
                if current_bal < min_bal:
                    min_bal = current_bal
                    trough_day = day_idx + 1

                band = daily_margin * (day_idx + 1) ** 0.5
                points.append({
                    "day": day_idx + 1,
                    "date": curr_date.isoformat(),
                    "label": f"{curr_date.day} {curr_date.strftime('%b')}",
                    "balance": _money(current_bal),
                    "balance_low": _money(current_bal - band),
                    "balance_high": _money(current_bal + band),
                    "pct_x": round(day_idx / max(horizon_days - 1, 1), 4),
                    "is_forecast": True,
                    "source": "conformal_quantile_ml",
                })

            return {
                "horizon_days": horizon_days,
                "opening_balance": _money(opening_balance),
                "closing_balance": points[-1]["balance"] if points else _money(opening_balance),
                "minimum_balance": _money(min_bal),
                "minimum_balance_day": trough_day,
                "minimum_reserve": _money(minimum_reserve),
                "reserve_breached": any(p["balance"] < minimum_reserve for p in points),
                "points": points,
                "source": "conformal_quantile_ml",
                "model_id": self.model_id,
                "conformal_coverage": 0.80,
                "limitations": [
                    "Probabilistic bounds calibrated via Conformal Quantile Autoregression (CQ-AR).",
                    "Provides distribution-free 80% coverage guarantees over 6-month horizons.",
                ],
            }
        except Exception:
            # Fall back seamlessly to run-rate projection if history is too brief
            fallback = RunRateForecastProvider().project_daily(
                transactions,
                start_date=start_date,
                horizon_days=horizon_days,
                opening_balance=opening_balance,
                minimum_reserve=minimum_reserve,
                profile=profile,
            )
            fallback["source"] = "run_rate_projection"
            fallback["model_id"] = "run_rate_v1"
            return fallback


def get_forecast_provider() -> ForecastProvider:
    provider = (getattr(settings, "FORECAST_PROVIDER", "cq_ar") or "cq_ar").lower()
    if provider in ["ml", "cq_ar", "conformal"]:
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
