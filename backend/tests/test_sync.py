import asyncio
import uuid

from sqlalchemy import select

from conftest import flight_payload
from app.core.database import AsyncSessionLocal
from app.models.flight import Flight


def push(client, user, *flights):
    response = client.post("/api/v1/sync/push", json={"flights": list(flights)}, headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()


def pull(client, user):
    response = client.get("/api/v1/sync/pull", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()["flights"]


def test_push_then_pull_roundtrip_decrypts_remarks(client, make_user):
    user = make_user()
    flight = flight_payload()

    assert push(client, user, flight)["synced_count"] == 1

    flights = pull(client, user)
    assert [f["id"] for f in flights] == [flight["id"]]
    assert flights[0]["remarks"] == "Тестовый рейс"


def test_remarks_are_stored_encrypted(client, make_user):
    user = make_user()
    flight = flight_payload()
    push(client, user, flight)

    async def read_remarks():
        async with AsyncSessionLocal() as session:
            result = await session.execute(select(Flight.remarks).where(Flight.id == uuid.UUID(flight["id"])))
            return result.scalar_one()

    assert asyncio.run(read_remarks()).startswith("enc:v1:")


def test_one_invalid_flight_does_not_block_the_batch(client, make_user):
    user = make_user()
    good = flight_payload()
    bad = flight_payload(aircraft_type="X" * 21)

    result = push(client, user, good, bad)

    assert result["synced_count"] == 1
    assert [item["id"] for item in result["rejected"]] == [bad["id"]]
    assert [f["id"] for f in pull(client, user)] == [good["id"]]


def test_id_owned_by_another_user_is_rejected_without_overwriting(client, make_user):
    owner, attacker = make_user(), make_user()
    flight = flight_payload()
    push(client, owner, flight)

    result = push(client, attacker, {**flight, "arr_icao": "EGLL"})

    assert result["synced_count"] == 0
    assert [item["id"] for item in result["rejected"]] == [flight["id"]]
    assert pull(client, owner)[0]["arr_icao"] == "OMDB"
    assert pull(client, attacker) == []


def test_edit_based_on_latest_version_wins_despite_slow_device_clock(client, make_user):
    user = make_user()
    flight = flight_payload()
    base = push(client, user, flight)["server_time"]

    # The device clock lags behind the server: updated_at predates the server stamp
    result = push(client, user, {
        **flight,
        "arr_icao": "EGLL",
        "updated_at": "2020-01-01T00:00:00+00:00",
        "base_updated_at": base,
    })

    assert result["synced_count"] == 1
    assert result["conflicts"] == []
    assert pull(client, user)[0]["arr_icao"] == "EGLL"


def test_stale_edit_is_reported_with_the_server_version(client, make_user):
    user = make_user()
    flight = flight_payload()
    stale_base = push(client, user, flight)["server_time"]
    push(client, user, {**flight, "arr_icao": "EGLL", "updated_at": "2099-01-01T00:00:00+00:00"})

    result = push(client, user, {**flight, "arr_icao": "LFPG", "base_updated_at": stale_base})

    assert result["synced_count"] == 0
    assert result["conflicts"][0]["arr_icao"] == "EGLL"
    assert result["conflicts"][0]["remarks"] == "Тестовый рейс"
    assert pull(client, user)[0]["arr_icao"] == "EGLL"


def test_batch_over_limit_is_refused(client, make_user):
    user = make_user()
    flights = [flight_payload() for _ in range(201)]

    response = client.post("/api/v1/sync/push", json={"flights": flights}, headers=user["headers"])

    assert response.status_code == 422


def test_invalid_flight_can_still_be_deleted(client, make_user):
    user = make_user()
    flight = flight_payload()
    push(client, user, flight)

    result = push(client, user, {**flight, "aircraft_type": "X" * 21, "is_deleted": True, "updated_at": "2099-01-01T00:00:00+00:00"})

    assert result["rejected"] == []
    assert pull(client, user) == []


def test_deleting_a_flight_the_server_never_saw_is_accepted(client, make_user):
    user = make_user()

    result = push(client, user, flight_payload(aircraft_type="X" * 21, is_deleted=True))

    assert result["synced_count"] == 1
    assert result["rejected"] == []


def test_details_roundtrip_and_validation(client, make_user):
    user = make_user()
    flight = flight_payload(details='{"entryType": "simulator", "takeoffsDay": 1}')
    bad = flight_payload(details="[1, 2]")
    broken = flight_payload(details="{not json")

    result = push(client, user, flight, bad, broken)

    assert result["synced_count"] == 1
    assert sorted(item["id"] for item in result["rejected"]) == sorted([bad["id"], broken["id"]])
    assert pull(client, user)[0]["details"] == '{"entryType": "simulator", "takeoffsDay": 1}'
