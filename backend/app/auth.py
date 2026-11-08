"""Validate sessions with Supabase Auth, including current email confirmation state."""

import logging
from dataclasses import dataclass
from uuid import UUID

import httpx
from fastapi import HTTPException

from app.config import Settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SupabaseIdentity:
    subject: str
    email: str
    email_verified: bool
    name: str


class SupabaseAuthenticator:
    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings, self.client = settings, client

    async def authenticate(self, token: str) -> SupabaseIdentity:
        key = self.settings.supabase_anon_key.get_secret_value()
        if not self.settings.supabase_url or not key:
            raise HTTPException(503, "Supabase Auth is not configured")
        try:
            response = await self.client.get(
                f"{self.settings.supabase_url}/auth/v1/user",
                headers={"apikey": key, "Authorization": f"Bearer {token}"},
                timeout=10,
            )
            if response.status_code in {401, 403}:
                raise HTTPException(
                    401, "Invalid or expired session", headers={"WWW-Authenticate": "Bearer"}
                )
            response.raise_for_status()
            user = response.json()
            subject = str(UUID(user["id"]))
            email = user.get("email")
            if not isinstance(email, str) or not email or len(email) > 320:
                raise HTTPException(403, "An email address is required")
            if not user.get("email_confirmed_at"):
                raise HTTPException(403, "Verify your email address before continuing")
            metadata = user.get("user_metadata") or {}
            name = metadata.get("display_name") or metadata.get("name") or email.split("@", 1)[0]
            return SupabaseIdentity(subject, email.lower(), True, str(name)[:80])
        except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError) as exc:
            status = exc.response.status_code if isinstance(exc, httpx.HTTPStatusError) else None
            logger.warning("Supabase Auth lookup failed: %s status=%s", type(exc).__name__, status)
            raise HTTPException(503, "Authentication service is temporarily unavailable") from exc
