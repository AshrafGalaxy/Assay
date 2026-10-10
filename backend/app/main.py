from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Base, database_is_ready, engine
from app.api.v1.router import api_router

# Supabase schema is applied by its migration workflow. The local SQLite
# fallback remains self-contained for development and API tests.
if settings.manages_schema:
    Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
)

# Set all CORS enabled origins
if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[str(origin) for origin in settings.CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
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


app.include_router(api_router, prefix=settings.API_V1_STR)
