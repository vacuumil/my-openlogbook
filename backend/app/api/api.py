from fastapi import APIRouter
from app.api.endpoints import auth, flights, airports, sync, calculator

api_router = APIRouter()

api_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_router.include_router(flights.router, prefix="/flights", tags=["Flights"])
api_router.include_router(airports.router, prefix="/airports", tags=["Airports"])
api_router.include_router(sync.router, prefix="/sync", tags=["Sync Engine"])
api_router.include_router(calculator.router, prefix="/calculator", tags=["Aviation Calculator"])
