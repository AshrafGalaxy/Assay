from typing import List
from pathlib import Path
from pydantic_settings import BaseSettings
from pydantic import field_validator



class Settings(BaseSettings):
    PROJECT_NAME: str = "Assay Financial Health API"
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = "assay-secret-key-change-in-production-0123456789"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    ENVIRONMENT: str = "development"
    
    # CORS
    CORS_ORIGINS: List[str] = ["*"]

    # Database. Supabase exposes a standard PostgreSQL connection string.
    # Keep SQLite as the zero-configuration local development default.
    DATABASE_URL: str = "sqlite:///./assay.db"
    MANAGE_SCHEMA: bool | None = None

    # Providers
    LLM_PROVIDER: str = "hybrid"  # "local_slm" | "cloud_ohttp" | "hybrid" | "groq" | "huggingface" | "mock"
    GROQ_API_KEY: str = ""
    GROQ_MODEL_ID: str = "qwen/qwen3.8-27b"

    HF_TOKEN: str = ""
    HF_MODEL_ID: str = "meta-llama/Llama-3.1-8B-Instruct"

    # Local Quantized 379 MB SLM (GGUF Q4_K_M)
    LOCAL_SLM_MODEL_PATH: str = "backend/models/assay-copilot-qwen0.5b-q4_k_m.gguf"
    AA_PROVIDER: str = "mock"

    # Oblivious HTTP (OHTTP RFC 9458) Blind Relay Configuration
    OHTTP_ENABLED: bool = False
    OHTTP_RELAY_URL: str = ""    # Untrusted Blind Relay (e.g., Cloudflare Worker)
    OHTTP_GATEWAY_URL: str = ""  # Trusted Decryption Gateway Endpoint
    OHTTP_GATEWAY_KEY: str = ""  # HPKE Public Key for payload encryption


    # Core Financial Planning & Uncertainty Parameters
    MINIMUM_RESERVE_FLOOR: float = 25000.0
    CONFORMAL_CONFIDENCE_LEVEL: float = 0.80
    MONTE_CARLO_SIMULATION_PATHS: int = 1000

    # Personal-finance ledger (data/synthetic_finance/transactions.csv) is the API's
    # base data source. Set false for a clean slate (manual / bank data only).
    SYNTHETIC_LEDGER_ENABLED: bool = True
    SYNTHETIC_DATA_DIR: str = "data/synthetic_finance"
    SYNTHETIC_USER_ID: str = ""  # empty => auto-pick a stable_income user
    SYNTHETIC_SEED: int = 42
    SYNTHETIC_BOOTSTRAP_USERS: int = 0  # >0 only regenerates when enabled and CSVs missing
    SYNTHETIC_START_MONTH: str = "2023-01"
    SYNTHETIC_HISTORICAL_MONTHS: int = 12
    SYNTHETIC_FORECAST_HORIZON: int = 6

    # Forecasting / ML seam ("run_rate" today; set "ml" when a model artefact exists)
    FORECAST_PROVIDER: str = "run_rate"  # run_rate | ml
    FORECAST_MODEL_PATH: str = ""

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def normalize_postgres_url(cls, value: str) -> str:
        """Use SQLAlchemy's psycopg dialect for Supabase/PostgreSQL URLs."""
        if not isinstance(value, str):
            return value
        if value.startswith("postgres://"):
            return value.replace("postgres://", "postgresql+psycopg://", 1)
        if value.startswith("postgresql://"):
            return value.replace("postgresql://", "postgresql+psycopg://", 1)
        return value

    @property
    def is_postgres(self) -> bool:
        return self.DATABASE_URL.startswith("postgresql+")

    @property
    def manages_schema(self) -> bool:
        """Supabase owns production schema changes; local SQLite stays convenient."""
        if self.MANAGE_SCHEMA is not None:
            return self.MANAGE_SCHEMA
        return not self.is_postgres

    class Config:
        case_sensitive = True
        env_file = (
            str(Path(__file__).resolve().parent.parent.parent / ".env"),
            ".env",
            "backend/.env",
        )
        extra = "allow"



settings = Settings()
