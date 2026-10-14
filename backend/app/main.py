from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from app.core.config import settings
from app.core.database import engine, Base, AsyncSessionLocal
from app.api.api import api_router
from app.models.airport import Airport

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
        print(f"[Warning] Database initialization notice: {e}")

    yield
    # Shutdown
    await engine.dispose()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    lifespan=lifespan
)

# Allow CORS for PWA and local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API v1 router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION
    }

@app.get("/")
async def root():
    return {
        "message": "Welcome to OpenLogBook Pilot Backend API",
        "docs": f"{settings.API_V1_STR}/docs"
    }
