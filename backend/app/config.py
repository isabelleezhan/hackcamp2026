import json
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[1] / ".env",
        extra="ignore",
        populate_by_name=True,
    )

    supabase_url: str = "https://ivjlummkprxwybqqfgor.supabase.co"
    supabase_anon_key: SecretStr = SecretStr("")
    supabase_service_role_key: SecretStr = SecretStr("")
    gemini_api_key: SecretStr = SecretStr("")
    gemini_model: str = "gemini-3.5-flash-lite"
    # Two generation/validation attempts must stay within the 10-minute worker lease.
    gemini_generation_timeout_seconds: int = Field(default=180, ge=1, le=240)
    gemini_transcription_model: str = "gemini-3.5-transcribe"
    gemini_fallback_models: str = "gemini-3.8-flash,gemini-3.5-flash-lite"
    resend_api_key: SecretStr = SecretStr("")
    enable_email_testing: bool = False
    email_from: str = Field(
        default="", validation_alias=AliasChoices("EMAIL_FROM", "RESEND_FROM_EMAIL")
    )
    frontend_url: str = Field(
        default="http://localhost:5173", validation_alias=AliasChoices("FRONTEND_URL", "APP_URL")
    )
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173"]
    )
    worker_secret: SecretStr = Field(
        default=SecretStr(""), validation_alias=AliasChoices("WORKER_SECRET", "N8N_WEBHOOK_SECRET")
    )
    ffprobe_path: str = "ffprobe"
    # Nominatim requires an identifying User-Agent. Never put personal data here.
    geocoder_user_agent: str = (
        "CommunityNewspaper/0.1 (HackCamp 2026; +https://github.com/isabelleezhan/hackcamp2026)"
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value):
        if isinstance(value, str):
            value = json.loads(value) if value.strip().startswith("[") else value.split(",")
        return [origin.strip().rstrip("/") for origin in value if origin.strip()]

    @field_validator("supabase_url", "frontend_url")
    @classmethod
    def valid_url(cls, value: str, info) -> str:
        from urllib.parse import urlsplit

        if info.field_name == "supabase_url" and not value:
            return ""
        parts = urlsplit(value)
        if (
            parts.scheme not in {"http", "https"}
            or not parts.netloc
            or parts.query
            or parts.fragment
        ):
            raise ValueError("Expected an HTTP(S) origin without query or fragment")
        if parts.username or parts.password:
            raise ValueError("Credentials must not be embedded in URLs")
        return value.rstrip("/")

    @field_validator("gemini_model", "gemini_transcription_model")
    @classmethod
    def valid_model(cls, value: str) -> str:
        import re

        if not re.fullmatch(r"[a-zA-Z0-9.-]+", value):
            raise ValueError("Invalid model ID")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
