from typing import Annotated

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from ..deps import UserDep
from ..services.geocode import ReverseGeocoder, approximate, lookup_point

router = APIRouter(prefix="/geocode", tags=["Accounts"])


class CityResult(BaseModel):
    city: str | None
    lat: float
    lng: float


class CityMatch(BaseModel):
    city: str
    label: str
    lat: float
    lng: float


@router.get("/search", response_model=list[CityMatch])
async def search(
    request: Request,
    user: UserDep,
    q: Annotated[str, Query(min_length=2, max_length=120)],
) -> list[CityMatch]:
    """Cities matching what someone typed, for the location picker.

    lat/lng are rounded to 1 decimal (~10 km): store those with the city via PATCH /me.
    Signed-in users only.
    """
    geocoder: ReverseGeocoder = request.app.state.geocoder
    return [CityMatch(**match) for match in await geocoder.search(q)]


@router.get("/reverse", response_model=CityResult)
async def reverse(
    request: Request,
    user: UserDep,
    lat: Annotated[float, Query(ge=-90, le=90, allow_inf_nan=False)],
    lng: Annotated[float, Query(ge=-180, le=180, allow_inf_nan=False)],
) -> CityResult:
    """City name for a location. `city` is null when unknown (ocean, lookup unavailable).

    Send at most 2 decimals (~1 km). The response's lat/lng are rounded to 1 decimal (~10 km):
    store those, with the city, via PATCH /me or on a note. Signed-in users only.
    """
    geocoder: ReverseGeocoder = request.app.state.geocoder
    city = await geocoder.city(*lookup_point(lat, lng))
    stored_lat, stored_lng = approximate(lat, lng)
    return CityResult(city=city, lat=stored_lat, lng=stored_lng)
