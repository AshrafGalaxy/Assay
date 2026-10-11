"""Persisted choice between the on-device model and a cloud model."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.database import engine
from app.models.ai_settings import AiSettings
from app.providers.llm.groq_provider import GroqLLMProvider
from app.providers.llm.hf_provider import HuggingFaceLLMProvider
from app.providers.llm.local_slm_provider import LocalSLMProvider

LOCAL = "local"
CLOUD = "cloud"


def _ensure_table() -> None:
    AiSettings.__table__.create(bind=engine, checkfirst=True)


def _local_engine_installed() -> bool:
    try:
        import llama_cpp  # noqa: F401
        return True
    except Exception:
        return False


def _availability() -> dict[str, Any]:
    local = LocalSLMProvider()
    groq = GroqLLMProvider()
    hf = HuggingFaceLLMProvider()
    if groq.is_configured:
        cloud_name = f"Groq · {groq.model_id}"
        cloud_ready = True
    elif hf.is_configured:
        cloud_name = f"Hugging Face · {hf.model_id}"
        cloud_ready = True
    else:
        cloud_name = "Groq or Hugging Face"
        cloud_ready = False
    file_ready = bool(local.is_configured)
    engine_ready = _local_engine_installed()
    if file_ready and engine_ready:
        local_status = "Ready"
    elif not file_ready:
        local_status = "Model file is not on this computer yet. Copilot keeps the verified answer until it is."
    else:
        local_status = "Model file is downloaded. The local engine is not installed yet."
    return {
        "local_available": file_ready and engine_ready,
        "cloud_available": cloud_ready,
        "local_model_name": "Qwen2.5 0.5B on this machine",
        "cloud_model_name": cloud_name,
        "local_status": local_status,
    }


def get_ai_preference(db: Session, user_id: str | None = None) -> dict[str, Any]:
    _ensure_table()
    query = db.query(AiSettings)
    if user_id:
        row = query.filter(AiSettings.user_id == user_id).first()
    else:
        row = query.filter(AiSettings.user_id.is_(None)).first()
    mode = row.mode if row and row.mode in {LOCAL, CLOUD} else LOCAL
    return {"mode": mode, **_availability()}


def save_ai_preference(db: Session, mode: str, user_id: str | None = None) -> dict[str, Any]:
    if mode not in {LOCAL, CLOUD}:
        raise ValueError("mode must be 'local' or 'cloud'")
    _ensure_table()
    query = db.query(AiSettings)
    if user_id:
        row = query.filter(AiSettings.user_id == user_id).first()
    else:
        row = query.filter(AiSettings.user_id.is_(None)).first()
    now = datetime.now(timezone.utc)
    if row is None:
        row = AiSettings(user_id=user_id, mode=mode, updated_at=now)
        db.add(row)
    else:
        row.mode = mode
        row.updated_at = now
    db.commit()
    db.refresh(row)
    return {"mode": row.mode, **_availability()}
