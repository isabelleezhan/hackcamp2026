from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ProfileUpdate(StrictModel):
    display_name: str = Field(min_length=1, max_length=80)


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
