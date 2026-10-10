from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# For SQLite, check_same_thread needs to be False
connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine_options = {"connect_args": connect_args, "pool_pre_ping": True}
if settings.is_postgres:
    engine_options.update({"pool_size": 5, "max_overflow": 5, "pool_recycle": 1_800})

engine = create_engine(settings.DATABASE_URL, **engine_options)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def database_is_ready() -> bool:
    """Run a minimal, provider-agnostic connectivity probe."""
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
