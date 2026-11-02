import os
import tempfile
import uuid

_db_dir = tempfile.mkdtemp(prefix="openlogbook-tests-")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_db_dir}/test.db"
os.environ["SECRET_KEY"] = "test-secret-key"
os.environ["ENCRYPTION_KEY"] = "test-encryption-key"
os.environ.pop("ENVIRONMENT", None)

import pytest
from fastapi.testclient import TestClient

from app.core.limiter import limiter
from app.main import app


@pytest.fixture(scope="session")
def client():
    limiter.enabled = False
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def make_user(client):
    def _make_user(password="Password1"):
        email = f"pilot-{uuid.uuid4().hex[:8]}@example.com"
        response = client.post("/api/v1/auth/register", json={"email": email, "password": password})
        assert response.status_code == 200, response.text
        data = response.json()
        return {
            "email": email,
            "password": password,
            "id": data["user"]["id"],
            "headers": {"Authorization": f"Bearer {data['access_token']}"},
        }

    return _make_user


def flight_payload(**overrides):
    payload = {
        "id": str(uuid.uuid4()),
        "date": "2026-10-01",
        "dep_icao": "UUEE",
        "arr_icao": "OMDB",
        "out_time_utc": "08:00",
        "off_time_utc": "08:15",
        "on_time_utc": "13:00",
        "in_time_utc": "13:10",
        "total_time_minutes": 310,
        "night_time_minutes": 0,
        "ifr_time_minutes": 310,
        "pic_time_minutes": 0,
        "sic_time_minutes": 310,
        "picus_time_minutes": 0,
        "dual_time_minutes": 0,
        "landings_day": 1,
        "landings_night": 0,
        "aircraft_reg": "RA-73000",
        "aircraft_type": "A320",
        "remarks": "Тестовый рейс",
        "updated_at": "2026-10-01T14:00:00+00:00",
    }
    payload.update(overrides)
    return payload
