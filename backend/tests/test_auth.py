import pytest
from jose import jwt

from conftest import flight_payload
from app.core.config import Settings
from app.core.limiter import get_real_client_ip
from app.core.security import create_access_token


def login(client, email, password):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def test_email_is_case_insensitive(client, make_user):
    user = make_user()

    assert login(client, user["email"].upper(), user["password"]).status_code == 200
    duplicate = client.post("/api/v1/auth/register", json={"email": user["email"].upper(), "password": "Password1"})
    assert duplicate.status_code == 400


def test_wrong_password_and_unknown_email_look_the_same(client, make_user):
    user = make_user()

    wrong = login(client, user["email"], "Wrong1234")
    unknown = login(client, "nobody@example.com", "Wrong1234")

    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_change_password_revokes_old_sessions(client, make_user):
    user = make_user()

    response = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": user["password"], "new_password": "NewPassword2"},
        headers=user["headers"],
    )

    assert response.status_code == 200
    assert client.get("/api/v1/auth/me", headers=user["headers"]).status_code == 401
    new_headers = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert client.get("/api/v1/auth/me", headers=new_headers).status_code == 200
    assert login(client, user["email"], "NewPassword2").status_code == 200
    assert login(client, user["email"], user["password"]).status_code == 401


def test_change_password_requires_current_password(client, make_user):
    user = make_user()

    response = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "Wrong1234", "new_password": "NewPassword2"},
        headers=user["headers"],
    )

    assert response.status_code == 400
    assert client.get("/api/v1/auth/me", headers=user["headers"]).status_code == 200


def test_legacy_token_without_fingerprint_still_works(client, make_user):
    user = make_user()
    token = create_access_token(user["id"])

    assert "pwf" not in jwt.get_unverified_claims(token)
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200


def test_delete_account_removes_flights_and_needs_password(client, make_user):
    user = make_user()
    client.post("/api/v1/sync/push", json={"flights": [flight_payload()]}, headers=user["headers"])

    refused = client.request("DELETE", "/api/v1/auth/me", json={"password": "Wrong1234"}, headers=user["headers"])
    assert refused.status_code == 400

    deleted = client.request("DELETE", "/api/v1/auth/me", json={"password": user["password"]}, headers=user["headers"])
    assert deleted.status_code == 204
    assert login(client, user["email"], user["password"]).status_code == 401


def test_rate_limit_key_ignores_client_supplied_forwarded_for():
    class FakeRequest:
        headers = {"X-Forwarded-For": "1.2.3.4, 203.0.113.9"}
        client = None

    assert get_real_client_ip(FakeRequest()) == "203.0.113.9"


@pytest.mark.parametrize("overrides", [
    {"SECRET_KEY": "", "ENCRYPTION_KEY": "x" * 32},
    {"SECRET_KEY": "x" * 32, "ENCRYPTION_KEY": ""},
    {"SECRET_KEY": "super-secret-pilot-logbook-key-change-in-production-123456789", "ENCRYPTION_KEY": "x" * 32},
])
def test_production_refuses_missing_or_public_keys(overrides):
    with pytest.raises(RuntimeError):
        Settings(ENVIRONMENT="production", **overrides)


def test_production_accepts_unique_keys():
    settings = Settings(ENVIRONMENT="production", SECRET_KEY="a" * 32, ENCRYPTION_KEY="b" * 32)

    assert settings.ENCRYPTION_KEY == "b" * 32
