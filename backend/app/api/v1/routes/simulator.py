from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.simulator import WhatIfRequest, WhatIfResponse
from app.services.financial_intelligence.engine import simulate_what_if
from app.services.financial_intelligence.forecasting import get_forecast_provider
from app.services.financial_intelligence.ledger import get_ledger_transactions, get_user_profile

router = APIRouter(prefix="/simulator", tags=["simulator"])


@router.post("/what-if", response_model=WhatIfResponse)
def run_what_if(
    payload: WhatIfRequest,
    user_id: str | None = Query(None, description="Synthetic UserID override"),
):
    """Compare Protect Liquidity vs Accelerate Debt under scenario assumptions.

    Historical ledger rows are never mutated. Plan math is currently run-rate based.
    When FORECAST_PROVIDER=ml is configured, the response advertises the active model
    so the UI can show that forecasts come from the model (not client-side invention).
    """
    try:
        transactions = get_ledger_transactions(user_id=user_id, historical_only=True)
        profile = get_user_profile(user_id=user_id)
        result = simulate_what_if(
            transactions,
            assumptions=payload.assumptions.model_dump(),
            profile=profile,
        )
        provider = get_forecast_provider()
        result["limitations"] = [
            f"Active forecast provider: {provider.model_id}.",
            *result.get("limitations", []),
            "When an ML artefact is wired through MlForecastProvider, period paths should be "
            "driven by model outputs instead of run-rate spreads.",
        ]
        return WhatIfResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Synthetic ledger unavailable. Generate the dataset and retry.",
        ) from exc
