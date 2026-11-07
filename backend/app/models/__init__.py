from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ProfileUpdate(StrictModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=80)
    location_mode: Literal["auto", "manual"] | None = None
    city: str | None = Field(default=None, min_length=1, max_length=120)
    lat: float | None = Field(default=None, ge=-90, le=90, allow_inf_nan=False)
    lng: float | None = Field(default=None, ge=-180, le=180, allow_inf_nan=False)
    timezone: str | None = None

    @field_validator("timezone")
    @classmethod
    def valid_profile_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Unknown timezone") from exc
        return value

    @model_validator(mode="after")
    def valid_location(self):
        if not self.model_fields_set:
            raise ValueError("At least one profile field is required")
        if (self.lat is None) != (self.lng is None):
            raise ValueError("Latitude and longitude must be supplied together")
        if self.lat is not None and (
            round(self.lat, 1) != self.lat or round(self.lng, 1) != self.lng
        ):
            raise ValueError("Coordinates must be rounded to one decimal place")
        if self.location_mode == "auto" and (self.lat is None or self.city is None):
            raise ValueError("Automatic location requires rounded coordinates and a city")
        if self.location_mode == "manual" and self.city is None:
            raise ValueError("Manual location requires a city")
        return self


class GroupCreate(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    timezone: str = "America/Vancouver"

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Unknown timezone") from exc
        return value


class GroupJoin(StrictModel):
    code: str = Field(pattern=r"^[0-9a-f]{32}$")


class EmailPreference(StrictModel):
    enabled: bool


class ReflectionWrite(StrictModel):
    body: str = Field(default="", max_length=2000)
    status: Literal["draft", "submitted"] = "draft"
    audio_path: str | None = Field(default=None, max_length=240)
    audio_duration_seconds: float | None = Field(default=None, gt=0, le=60, allow_inf_nan=False)
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
        return self


class PublishRequest(StrictModel):
    period_id: UUID


class Story(StrictModel):
    headline: str = Field(min_length=1, max_length=180)
    text: str = Field(min_length=1, max_length=1500)
    source_reflection_ids: list[UUID] = Field(min_length=1, max_length=100)


class MemberUpdate(Story):
    user_id: UUID
    display_name: str = Field(min_length=1, max_length=80)


class Newspaper(StrictModel):
    headline: str = Field(min_length=1, max_length=180)
    introduction: str = Field(min_length=1, max_length=1500)
    member_updates: list[MemberUpdate] = Field(min_length=1, max_length=100)
    little_victories: list[Story] = Field(default_factory=list, max_length=100)
    looking_ahead: list[Story] = Field(default_factory=list, max_length=100)


class Transcription(StrictModel):
    text: str = Field(min_length=1, max_length=2000)


class AudioResult(StrictModel):
    audio_path: str
    audio_duration_seconds: float
    transcript: str | None = None
    status: Literal["review_required", "transcription_failed"]
    detail: str


PageLimit = Annotated[int, Field(ge=1, le=100)]
