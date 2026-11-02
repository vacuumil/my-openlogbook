from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.api.api import api_router
from app.models.airport import Airport
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter

logger = logging.getLogger("openlogbook")

SEED_AIRPORTS = [
    Airport(icao="UUEE", iata="SVO", name="Sheremetyevo International Airport", latitude=55.9726, longitude=37.4146, timezone="Europe/Moscow"),
    Airport(icao="UUDD", iata="DME", name="Domodedovo International Airport", latitude=55.4088, longitude=37.9063, timezone="Europe/Moscow"),
    Airport(icao="UUWW", iata="VKO", name="Vnukovo International Airport", latitude=55.5915, longitude=37.2615, timezone="Europe/Moscow"),
    Airport(icao="ULLI", iata="LED", name="Pulkovo Airport", latitude=59.8003, longitude=30.2625, timezone="Europe/Moscow"),
    Airport(icao="EDDF", iata="FRA", name="Frankfurt Airport", latitude=50.0379, longitude=8.5622, timezone="Europe/Berlin"),
    Airport(icao="LTFM", iata="IST", name="Istanbul Airport", latitude=41.2753, longitude=28.7519, timezone="Europe/Istanbul"),
    Airport(icao="OMDB", iata="DXB", name="Dubai International Airport", latitude=25.2532, longitude=55.3657, timezone="Asia/Dubai"),
    Airport(icao="KJFK", iata="JFK", name="John F. Kennedy International Airport", latitude=40.6413, longitude=-73.7781, timezone="America/New_York"),
    Airport(icao="EGLL", iata="LHR", name="London Heathrow Airport", latitude=51.4700, longitude=-0.4543, timezone="Europe/London"),
    Airport(icao="LFPG", iata="CDG", name="Charles de Gaulle Airport", latitude=49.0097, longitude=2.5479, timezone="Europe/Paris"),
]

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Auto-create tables on startup
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        
        # Seed default airports if empty
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Airport).limit(1))
            if not result.scalars().first():
                session.add_all(SEED_AIRPORTS)
                await session.commit()
    except Exception as e:
        logger.warning("Database initialization notice: %s", e)

    yield
    # Shutdown
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=None if settings.is_production else f"{settings.API_V1_STR}/openapi.json",
    docs_url=None if settings.is_production else f"{settings.API_V1_STR}/docs",
    redoc_url=None,
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Strict CORS for production server, PWA, and local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.parsed_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OWASP Security Headers Middleware (Defense in depth)
@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response

# Include API v1 router
app.include_router(api_router, prefix=settings.API_V1_STR)

from sqlalchemy import text
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db

@app.get("/api/health")
async def health_check(db: AsyncSession = Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
    except Exception as e:
        logger.error("Health check failed: %s", e)
        return JSONResponse(status_code=503, content={"status": "degraded", "database": "unavailable"})

    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "database": "connected",
    }

@app.get("/")
async def root():
    return {"message": "Welcome to OpenLogBook Pilot Backend API"}
