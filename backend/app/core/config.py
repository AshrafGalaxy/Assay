from typing import List
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
    LLM_PROVIDER: str = "mock"
    AA_PROVIDER: str = "mock"

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
        env_file = ".env"
        extra = "allow"


settings = Settings()
