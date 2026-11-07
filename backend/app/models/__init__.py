from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


MAX_TYPED_CHARS = 2000
MAX_TRANSCRIPT_CHARS = 4000
MAX_AUDIO_SECONDS = 180


def valid_timezone(value: str | None) -> str | None:
    if value is None:
        return value
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise ValueError("Unknown timezone") from exc
    return value


def round_coordinate(value: float | None) -> float | None:
    # Approximate location only (~10 km). The database rejects anything more precise.
    return None if value is None else round(value, 1)


class Location(StrictModel):
    city: str | None = Field(default=None, min_length=1, max_length=120)
    lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lng: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)

    @field_validator("lat", "lng")
    @classmethod
    def approximate(cls, value: float | None) -> float | None:
        return round_coordinate(value)

    @model_validator(mode="after")
    def lat_lng_together(self):
        if (self.lat is None) != (self.lng is None):
            raise ValueError("lat and lng must be supplied together")
        return self


class ProfileUpdate(Location):
    """Partial update: only the fields sent are changed."""

    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    location_mode: Literal["auto", "manual"] | None = None
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("timezone")
    @classmethod
    def known_timezone(cls, value: str | None) -> str | None:
        return valid_timezone(value)


class GroupCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    timezone: str = "America/Vancouver"

    @field_validator("timezone")
    @classmethod
    def known_timezone(cls, value: str) -> str:
        return valid_timezone(value)


class GroupJoin(StrictModel):
    # New groups: 8 characters without 0/O/1/I/L. Older groups: 32 hex characters.
    code: str = Field(min_length=8, max_length=32)

    @field_validator("code")
    @classmethod
    def normalize(cls, value: str) -> str:
        import re

        value = value.strip()
        if re.fullmatch(r"[0-9a-f]{32}", value):
            return value
        value = value.upper().replace("-", "").replace(" ", "")
        if not re.fullmatch(r"[2-9A-HJKMNP-Z]{8}", value):
            raise ValueError("Invalid invitation code")
        return value


class EmailPreference(StrictModel):
    enabled: bool


class ReflectionWrite(Location):
    """One note. A person can add many per week; city/lat/lng are where it was recorded."""

    body: str = Field(default="", max_length=MAX_TRANSCRIPT_CHARS)
    status: Literal["draft", "submitted"] = "draft"
    audio_path: str | None = Field(default=None, max_length=240)
    audio_duration_seconds: float | None = Field(
        default=None, gt=0, le=MAX_AUDIO_SECONDS, allow_inf_nan=False
    )
    # The interface must explain group sharing and AI processing before asking for this.
    ai_consent: bool = False

    @model_validator(mode="after")
    def valid_submission(self):
        if self.status == "submitted" and (not self.body or not self.ai_consent):
            raise ValueError(
                "Submission requires reviewed text and consent to group sharing/AI processing"
            )
        if bool(self.audio_path) != (self.audio_duration_seconds is not None):
            raise ValueError("Audio reference and verified duration must be supplied together")
        if not self.audio_path and len(self.body) > MAX_TYPED_CHARS:
            raise ValueError(f"Typed notes are limited to {MAX_TYPED_CHARS} characters")
        return self


class PublishRequest(StrictModel):
    period_id: UUID


class Story(StrictModel):
    headline: str = Field(min_length=1, max_length=180)
    text: str = Field(min_length=1, max_length=1500)
    source_reflection_ids: list[UUID] = Field(min_length=1, max_length=100)


class MemberUpdate(Story):
    """One story per person, summarizing all of that person's notes for the week."""

    user_id: UUID
    display_name: str = Field(min_length=1, max_length=80)
    # City the story is filed from ("LISBON — ..."); must be a city on one of their notes.
    dateline: str | None = Field(default=None, max_length=120)


class Newspaper(StrictModel):
    headline: str = Field(min_length=1, max_length=180)
    introduction: str = Field(min_length=1, max_length=1500)
    member_updates: list[MemberUpdate] = Field(min_length=1, max_length=100)
    little_victories: list[Story] = Field(default_factory=list, max_length=100)
    looking_ahead: list[Story] = Field(default_factory=list, max_length=100)


class Transcription(StrictModel):
    text: str = Field(min_length=1, max_length=MAX_TRANSCRIPT_CHARS)


class AudioResult(StrictModel):
    audio_path: str
    audio_duration_seconds: float
    transcript: str | None = None
    status: Literal["review_required", "transcription_failed"]
    detail: str


PageLimit = Annotated[int, Field(ge=1, le=100)]
