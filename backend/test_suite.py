import asyncio
import os
import sys
from datetime import datetime, timezone

# Ensure backend directory is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.night_service import calculate_astronomical_night_time

async def run_tests():
    print("=" * 60)
    print(">> OpenLogBook - Backend Verification Suite")
    print("=" * 60)

    # Test 1: Astronomical Engine
    print("\n[Test 1] Testing Astronomical Night Engine...")
    off_t = datetime(2026, 10, 14, 18, 0, tzinfo=timezone.utc)
    on_t = datetime(2026, 10, 14, 21, 30, tzinfo=timezone.utc)
    # Sheremetyevo (55.97, 37.41) to Frankfurt (50.04, 8.56)
    night_mins = calculate_astronomical_night_time(55.97, 37.41, 50.04, 8.56, off_t, on_t)
    assert night_mins == 210, f"Expected 210 night mins, got {night_mins}"
    print(f"  [PASS] Night flight duration verified: {night_mins} min (Full night)")

    day_off_t = datetime(2026, 10, 14, 10, 0, tzinfo=timezone.utc)
    day_on_t = datetime(2026, 10, 14, 13, 30, tzinfo=timezone.utc)
    day_night_mins = calculate_astronomical_night_time(55.97, 37.41, 50.04, 8.56, day_off_t, day_on_t)
    assert day_night_mins == 0, f"Expected 0 night mins, got {day_night_mins}"
    print(f"  [PASS] Daytime flight duration verified: {day_night_mins} min (Full day)")

    # Test 2: HTTP Endpoints via ASGI Transport
    print("\n[Test 2] Testing FastAPI ASGI HTTP Endpoints...")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Healthcheck
        res = await client.get("/api/health")
        assert res.status_code == 200, f"Healthcheck failed: {res.text}"
        data = res.json()
        assert data["status"] == "online"
        print("  [PASS] /api/health returned 200 OK (Status: online)")

        # OpenAPI schema
        res = await client.get("/api/v1/openapi.json")
        assert res.status_code == 200, f"OpenAPI failed: {res.text}"
        paths = res.json()["paths"]
        print(f"  [PASS] OpenAPI Specification generated successfully ({len(paths)} endpoints registered)")

        # Verify key routes are present in OpenAPI
        assert "/api/v1/auth/register" in paths
        assert "/api/v1/auth/login" in paths
        assert "/api/v1/flights/" in paths
        assert "/api/v1/sync/push" in paths
        assert "/api/v1/sync/pull" in paths
        assert "/api/v1/calculator/night-time" in paths
        print("  [PASS] All Authentication, Flights, Sync, and Calculator routes verified")

    print("\n" + "=" * 60)
    print("SUCCESS: ALL TESTS PASSED!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_tests())
