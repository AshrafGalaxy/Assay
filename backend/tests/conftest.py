"""Shared fixtures. Synthetic ledger is opt-in for tests that still need it."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.services.financial_intelligence.ledger import clear_ledger_cache
from app.services.financial_intelligence.synthetic_finance_generator import (
    GeneratorConfig,
    generate_and_export,
)


@pytest.fixture
def synthetic_ledger(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Ephemeral synthetic CSVs for engine/forecast tests — not the production data dir."""
    root = tmp_path / "synthetic_finance"
    generate_and_export(
        GeneratorConfig(
            n_users=5,
            start_month="2024-01",
            historical_months=6,
            forecast_horizon=3,
            seed=7,
            output_dir=root,
        )
    )
    monkeypatch.setattr(settings, "SYNTHETIC_LEDGER_ENABLED", True)
    monkeypatch.setattr(settings, "SYNTHETIC_DATA_DIR", str(root))
    monkeypatch.setattr(settings, "SYNTHETIC_BOOTSTRAP_USERS", 0)
    monkeypatch.setattr(settings, "SYNTHETIC_USER_ID", "")
    clear_ledger_cache()
    yield root
    clear_ledger_cache()
