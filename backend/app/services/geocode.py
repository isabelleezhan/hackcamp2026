"""Approximate coordinates → city name, using OpenStreetMap Nominatim.

Usage policy (https://operations.osmfoundation.org/policies/nominatim/): identify the app with a
User-Agent, at most one request per second, cache results.

Privacy: the lookup uses coordinates rounded to 2 decimals (~1 km), because 1 decimal (~10 km)
can land in the wrong city (Lisbon rounds into Barreiro). Only the 1-decimal value is returned
for storage. Nothing about the person is ever sent.
"""

import asyncio
import logging
import time
from collections import OrderedDict

import httpx

from app.config import Settings

log = logging.getLogger(__name__)

NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search"
SEARCH_LIMIT = 6
CACHE_SIZE = 5000
MIN_INTERVAL_S = 1.0
# Most specific place first. zoom=10 asks Nominatim for city-level results.
PLACE_KEYS = ("city", "town", "village", "municipality", "hamlet", "suburb", "county", "state")


def approximate(lat: float, lng: float) -> tuple[float, float]:
    """The precision we store and show to the group (~10 km)."""
    return round(lat, 1), round(lng, 1)


def lookup_point(lat: float, lng: float) -> tuple[float, float]:
    """The precision we send to Nominatim (~1 km): enough to name the right city."""
    return round(lat, 2), round(lng, 2)


class ReverseGeocoder:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client
        self._cache: OrderedDict[tuple[float, float], str | None] = OrderedDict()
        self._search_cache: OrderedDict[str, list[dict]] = OrderedDict()
        self._lock = asyncio.Lock()
        self._last_request = 0.0

    async def city(self, lat: float, lng: float) -> str | None:
        """City near the point, or None if unknown (ocean, outage, rate limit)."""
        key = lookup_point(lat, lng)
        if key in self._cache:
            self._cache.move_to_end(key)
            return self._cache[key]
        async with self._lock:  # one upstream request at a time, spaced >= 1 s apart
            if key in self._cache:
                return self._cache[key]
            wait = MIN_INTERVAL_S - (time.monotonic() - self._last_request)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_request = time.monotonic()
            try:
                response = await self.client.get(
                    NOMINATIM_URL,
                    params={
                        "lat": key[0],
                        "lon": key[1],
                        "format": "jsonv2",
                        "zoom": 10,
                        "addressdetails": 1,
                        "accept-language": "en",
                    },
                    headers={"User-Agent": self.settings.geocoder_user_agent},
                    timeout=8,
                )
                response.raise_for_status()
                data = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                log.warning("Reverse geocoding failed: %s", type(exc).__name__)
                return None  # not cached, so a later request can succeed
            address = data.get("address") if isinstance(data, dict) else None
            place = next(
                (address[k] for k in PLACE_KEYS if isinstance(address, dict) and address.get(k)),
                None,
            )
            city = str(place)[:120] if place else None
            self._cache[key] = city
            if len(self._cache) > CACHE_SIZE:
                self._cache.popitem(last=False)
            return city

    async def search(self, query: str) -> list[dict]:
        """Cities matching typed text: [{city, label, lat, lng}] with lat/lng rounded to ~10 km.

        Only the typed place name is sent to Nominatim. Empty on outage or rate limit.
        """
        key = " ".join(query.lower().split())[:120]
        if len(key) < 2:
            return []
        if key in self._search_cache:
            self._search_cache.move_to_end(key)
            return self._search_cache[key]
        async with self._lock:  # shares the 1 request/second budget with reverse lookups
            if key in self._search_cache:
                return self._search_cache[key]
            wait = MIN_INTERVAL_S - (time.monotonic() - self._last_request)
            if wait > 0:
                await asyncio.sleep(wait)
            self._last_request = time.monotonic()
            try:
                response = await self.client.get(
                    NOMINATIM_SEARCH_URL,
                    params={
                        "q": key,
                        "format": "jsonv2",
                        "addressdetails": 1,
                        "limit": SEARCH_LIMIT,
                        "featureType": "settlement",
                        "accept-language": "en",
                    },
                    headers={"User-Agent": self.settings.geocoder_user_agent},
                    timeout=8,
                )
                response.raise_for_status()
                data = response.json()
            except (httpx.HTTPError, ValueError) as exc:
                log.warning("City search failed: %s", type(exc).__name__)
                return []
            results: list[dict] = []
            seen: set[str] = set()
            for item in data if isinstance(data, list) else []:
                try:
                    lat, lng = approximate(float(item["lat"]), float(item["lon"]))
                except (KeyError, TypeError, ValueError):
                    continue
                address = item.get("address") if isinstance(item.get("address"), dict) else {}
                city = next((address[k] for k in PLACE_KEYS if address.get(k)), None) or item.get(
                    "name"
                )
                if not city:
                    continue
                city = str(city)[:120]
                parts = [city] + [
                    str(address[k])
                    for k in ("state", "country")
                    if address.get(k) and address[k] != city
                ]
                label = ", ".join(parts)[:200]
                if label in seen:
                    continue
                seen.add(label)
                results.append({"city": city, "label": label, "lat": lat, "lng": lng})
            self._search_cache[key] = results
            if len(self._search_cache) > CACHE_SIZE:
                self._search_cache.popitem(last=False)
            return results
