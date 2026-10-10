from app.services.financial_intelligence.forecasting import (
    RunRateForecastProvider,
    build_cash_flow_daily_view,
    build_observed_daily_path,
)
from app.services.financial_intelligence.ledger import (
    get_ledger_transactions,
    get_monthly_finance_row,
    get_user_profile,
)


def test_observed_daily_path_matches_monthly_closing():
    txs = get_ledger_transactions(historical_only=True)
    monthly = get_monthly_finance_row(historical_only=True)
    assert monthly is not None
    month = str(monthly["Month"])
    path = build_observed_daily_path(
        txs,
        month=month,
        opening_balance=float(monthly["OpeningBalance"]),
        minimum_reserve=float(monthly["MinimumReserve"]),
    )
    assert path["source"] == "observed_ledger"
    assert path["points"]
    assert path["opening_balance"] == float(monthly["OpeningBalance"])
    # Closing from replaying txs should reconcile to generator monthly closing.
    assert abs(path["closing_balance"] - float(monthly["ClosingBalance"])) <= 0.05


def test_daily_view_can_append_provider_forecast():
    txs = get_ledger_transactions(historical_only=True)
    monthly = get_monthly_finance_row(historical_only=True)
    profile = get_user_profile()
    view = build_cash_flow_daily_view(
        txs,
        month=str(monthly["Month"]),
        opening_balance=float(monthly["OpeningBalance"]),
        minimum_reserve=float(monthly["MinimumReserve"]),
        profile=profile,
        include_forecast_days=7,
    )
    assert view["forecast"] is not None
    assert view["forecast"]["source"] == "run_rate_projection"
    assert view["forecast"]["model_id"] == "run_rate_v1"
    observed_days = len(view["observed"]["points"])
    assert len(view["points"]) == observed_days + 7


def test_run_rate_provider_metadata():
    provider = RunRateForecastProvider()
    txs = get_ledger_transactions(historical_only=True)
    profile = get_user_profile()
    from datetime import date

    out = provider.project_daily(
        txs,
        start_date=date(2025, 1, 1),
        horizon_days=5,
        opening_balance=50000,
        minimum_reserve=10000,
        profile=profile,
    )
    assert out["model_id"] == "run_rate_v1"
    assert len(out["points"]) == 5
