from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.ai_settings import get_ai_preference, save_ai_preference

router = APIRouter(prefix="/settings/ai", tags=["settings"])


class AiPreferenceIn(BaseModel):
    mode: str = Field(description="'local' or 'cloud'")


class AiPreferenceOut(BaseModel):
    mode: str
    local_available: bool
    cloud_available: bool
    local_model_name: str
    cloud_model_name: str
    local_status: str


@router.get("", response_model=AiPreferenceOut)
def read_ai_preference(db: Session = Depends(get_db)):
    """The model Copilot uses: on this machine, or a cloud model."""
    return AiPreferenceOut(**get_ai_preference(db))


@router.post("", response_model=AiPreferenceOut)
def write_ai_preference(payload: AiPreferenceIn, db: Session = Depends(get_db)):
    try:
        saved = save_ai_preference(db, payload.mode)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return AiPreferenceOut(**saved)
