from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.simulator import WhatIfRequest, WhatIfResponse
from app.services.financial_intelligence.engine import simulate_what_if
from app.services.financial_intelligence.forecasting import get_forecast_provider
from app.services.financial_intelligence.unified_data import get_unified_financial_data

router = APIRouter(prefix="/simulator", tags=["simulator"])


@router.post("/what-if", response_model=WhatIfResponse)
def run_what_if(
    payload: WhatIfRequest,
    user_id: str | None = Query(None, description="Synthetic UserID override"),
    db: Session = Depends(get_db),
):
    """Compare Protect Liquidity vs Accelerate Debt under scenario assumptions.

    Uses the same transactions, opening cash, and Safety Buffer as the cash-flow
    forecast. Historical rows are never mutated.
    """
    try:
        unified = get_unified_financial_data(db, user_id=user_id)
        assumptions = payload.assumptions.model_dump()
        if assumptions.get("minimum_reserve") is None:
            assumptions["minimum_reserve"] = unified["settings"].get("minimum_reserve")
        # Honor the same include toggles the cash-flow forecast uses.
        # Amounts are zeroed rather than removed so the trailing-month window stays the same.
        settings = unified["settings"]
        transactions = []
        for tx in unified["transactions"]:
            row = dict(tx)
            category = str(row.get("category") or "")
            drop_amount = False
            if row.get("type") == "credit" and not settings.get("include_income", True):
                drop_amount = True
            elif row.get("type") == "debit" and category in {"Debt & EMI", "Debt"} and not settings.get("include_debt", True):
                drop_amount = True
            elif row.get("type") == "debit" and row.get("is_discretionary") and not settings.get("include_discretionary", True):
                drop_amount = True
            elif (
                row.get("type") == "debit"
                and not row.get("is_discretionary")
                and category not in {"Debt & EMI", "Debt", "Savings Transfer"}
                and not settings.get("include_essential", True)
            ):
                drop_amount = True
            if drop_amount:
                row["amount"] = 0.0
            transactions.append(row)
        result = simulate_what_if(
            transactions,
            assumptions=assumptions,
            profile=unified["profile"],
            opening_balance=unified["available_balance"],
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
