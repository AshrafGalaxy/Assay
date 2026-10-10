import logging
import threading

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Base, database_is_ready, engine
from app.api.v1.router import api_router

# Surface application logs (e.g. [ReceiptOCR] extraction metrics) alongside
# uvicorn's access log; uvicorn only configures its own loggers.
logging.getLogger("app").setLevel(logging.INFO)
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s:     %(name)s - %(message)s")

# Supabase schema is applied by its migration workflow. The local SQLite
# fallback remains self-contained for development and API tests.
if settings.manages_schema:
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Could not connect to database on startup: {e}")


app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)



@app.get("/")
def root():
    return {
        "service": settings.PROJECT_NAME,
        "status": "online",
        "docs": f"{settings.API_V1_STR}/docs",
        "version": "0.1.0",
    }


@app.get("/health")
def health_check():
    database_ready = database_is_ready()
    return {
        "status": "healthy" if database_ready else "degraded",
        "database": "ready" if database_ready else "unavailable",
    }


@app.on_event("startup")
def warm_up_semantic_categorizer() -> None:
    """Pre-load the Tier-2 MiniLM categorizer off the request path so the first
    receipt scan isn't blocked by model loading / download."""
    from app.services.categorization.semantic_classifier import semantic_categorizer

    threading.Thread(
        target=semantic_categorizer.warm_up,
        name="semantic-categorizer-warmup",
        daemon=True,
    ).start()


app.include_router(api_router, prefix=settings.API_V1_STR)
