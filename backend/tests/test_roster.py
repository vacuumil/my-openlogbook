import httpx
import pytest

from app.api.endpoints import roster


def test_calendar_needs_sign_in(client):
    response = client.post("/api/v1/roster/calendar", json={"url": "https://example.com/roster.ics"})
    assert response.status_code == 401


@pytest.mark.parametrize(
    "url",
    [
        "http://example.com/roster.ics",
        "https://127.0.0.1/roster.ics",
        "https://localhost/roster.ics",
        "https://10.0.0.5/roster.ics",
        "https://[::1]/roster.ics",
        "https://user:secret@example.com/roster.ics",
        "ftp://example.com/roster.ics",
    ],
)
def test_calendar_refuses_unsafe_links(client, make_user, url):
    user = make_user()
    response = client.post("/api/v1/roster/calendar", json={"url": url}, headers=user["headers"])
    assert response.status_code == 400, response.text


def _public_dns(monkeypatch):
    async def public(url):
        return url

    monkeypatch.setattr(roster, "_check_public_host", public)


def _serve(monkeypatch, handler):
    real_client = httpx.AsyncClient

    def client_factory(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(handler)
        return real_client(*args, **kwargs)

    monkeypatch.setattr(roster.httpx, "AsyncClient", client_factory)


def test_calendar_returns_ics_text(client, make_user, monkeypatch):
    user = make_user()
    _public_dns(monkeypatch)
    _serve(monkeypatch, lambda request: httpx.Response(200, text="BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n"))

    response = client.post("/api/v1/roster/calendar", json={"url": "webcal://crew.example.com/ics/1"}, headers=user["headers"])

    assert response.status_code == 200, response.text
    assert response.json()["text"].startswith("BEGIN:VCALENDAR")


def test_calendar_rejects_pages_that_are_not_calendars(client, make_user, monkeypatch):
    user = make_user()
    _public_dns(monkeypatch)
    _serve(monkeypatch, lambda request: httpx.Response(200, text="<html>login</html>"))

    response = client.post("/api/v1/roster/calendar", json={"url": "https://crew.example.com/ics/1"}, headers=user["headers"])

    assert response.status_code == 400


def test_calendar_checks_every_redirect(client, make_user, monkeypatch):
    user = make_user()
    checked = []

    async def check(url):
        checked.append(url)
        if "internal" in url:
            raise roster._bad_link("blocked")
        return url

    monkeypatch.setattr(roster, "_check_public_host", check)
    _serve(monkeypatch, lambda request: httpx.Response(302, headers={"location": "https://internal.example/secret"}))

    response = client.post("/api/v1/roster/calendar", json={"url": "https://crew.example.com/ics/1"}, headers=user["headers"])

    assert response.status_code == 400
    assert checked == ["https://crew.example.com/ics/1", "https://internal.example/secret"]
