from datetime import datetime, timezone

from app.services.night_service import calculate_astronomical_night_time


def test_full_night_flight():
    off_time = datetime(2026, 10, 14, 18, 0, tzinfo=timezone.utc)
    on_time = datetime(2026, 10, 14, 21, 30, tzinfo=timezone.utc)

    assert calculate_astronomical_night_time(55.97, 37.41, 50.04, 8.56, off_time, on_time) == 210


def test_full_day_flight():
    off_time = datetime(2026, 10, 14, 10, 0, tzinfo=timezone.utc)
    on_time = datetime(2026, 10, 14, 13, 30, tzinfo=timezone.utc)

    assert calculate_astronomical_night_time(55.97, 37.41, 50.04, 8.56, off_time, on_time) == 0


def test_health_reports_database(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["database"] == "connected"


def test_key_routes_are_published(client):
    paths = client.get("/api/v1/openapi.json").json()["paths"]

    for route in ("/api/v1/auth/login", "/api/v1/auth/change-password", "/api/v1/sync/push", "/api/v1/sync/pull"):
        assert route in paths


def test_admin_routes_require_superuser(client, make_user):
    user = make_user()

    assert client.get("/api/v1/admin/users").status_code == 401
    assert client.get("/api/v1/admin/users", headers=user["headers"]).status_code == 403
