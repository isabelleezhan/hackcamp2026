import asyncio

import httpx
import pytest

from app.services import geocode
from app.services.geocode import ReverseGeocoder
from tests.test_api import AUTH, make_client


def nominatim(address, calls):
    def handler(request):
        assert request.url.host == "nominatim.openstreetmap.org"
        assert "CommunityNewspaper" in request.headers["user-agent"]
        assert "@" not in request.headers["user-agent"]  # no personal data
        calls.append(dict(request.url.params))
        if address is None:
            return httpx.Response(200, json={"error": "Unable to geocode"})
        return httpx.Response(200, json={"address": address})

    return handler


@pytest.fixture(autouse=True)
def no_wait(monkeypatch):
    monkeypatch.setattr(geocode, "MIN_INTERVAL_S", 0)


def test_looks_up_at_1km_returns_10km_and_caches(settings):
    calls = []
    with make_client(settings, nominatim({"city": "Lisbon", "country": "Portugal"}, calls)) as c:
        first = c.get("/geocode/reverse", params={"lat": 38.72231, "lng": -9.13934}, headers=AUTH)
        again = c.get("/geocode/reverse", params={"lat": 38.7249, "lng": -9.1401}, headers=AUTH)
    # Stored/returned precision is ~10 km even though the lookup used ~1 km.
    assert first.json() == {"city": "Lisbon", "lat": 38.7, "lng": -9.1}
    assert again.json()["city"] == "Lisbon"
    assert len(calls) == 1  # both points round to (38.72, -9.14): served from cache
    assert (calls[0]["lat"], calls[0]["lon"], calls[0]["zoom"]) == ("38.72", "-9.14", "10")


@pytest.mark.parametrize(
    "address,city",
    [
        ({"town": "Squamish", "state": "British Columbia"}, "Squamish"),
        ({"village": "Tofino"}, "Tofino"),
        ({"state": "Nunavut"}, "Nunavut"),
        (None, None),  # ocean: Nominatim says "Unable to geocode"
    ],
)
def test_picks_most_specific_place(settings, address, city):
    with make_client(settings, nominatim(address, [])) as c:
        result = c.get("/geocode/reverse", params={"lat": 1, "lng": 2}, headers=AUTH)
    assert result.status_code == 200
    assert result.json()["city"] == city


def test_outage_returns_null_and_is_not_cached(settings):
    calls = []

    def handler(request):
        calls.append(1)
        return (
            httpx.Response(503)
            if len(calls) == 1
            else httpx.Response(200, json={"address": {"city": "Tokyo"}})
        )

    with make_client(settings, handler) as c:
        down = c.get("/geocode/reverse", params={"lat": 35.68, "lng": 139.69}, headers=AUTH)
        up = c.get("/geocode/reverse", params={"lat": 35.68, "lng": 139.69}, headers=AUTH)
    assert down.status_code == 200 and down.json()["city"] is None
    assert up.json()["city"] == "Tokyo"


def test_requires_sign_in_and_valid_coordinates(settings):
    with make_client(settings) as c:
        assert c.get("/geocode/reverse", params={"lat": 1, "lng": 2}).status_code == 401
        assert (
            c.get("/geocode/reverse", params={"lat": 91, "lng": 2}, headers=AUTH).status_code == 422
        )
        assert c.get("/geocode/reverse", params={"lat": 1}, headers=AUTH).status_code == 422


async def test_requests_are_spaced_at_least_one_second_apart(settings, monkeypatch):
    monkeypatch.setattr(geocode, "MIN_INTERVAL_S", 1.0)
    slept = []

    async def fake_sleep(seconds):
        slept.append(seconds)

    monkeypatch.setattr(geocode.asyncio, "sleep", fake_sleep)
    transport = httpx.MockTransport(lambda r: httpx.Response(200, json={"address": {"city": "X"}}))
    async with httpx.AsyncClient(transport=transport) as client:
        g = ReverseGeocoder(settings, client)
        await asyncio.gather(g.city(10, 10), g.city(20, 20))
    assert len(slept) == 1 and 0 < slept[0] <= 1.0
