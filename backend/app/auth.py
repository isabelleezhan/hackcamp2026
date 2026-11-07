import time
from dataclasses import dataclass
from typing import Any

import httpx
import jwt
from fastapi import HTTPException

from app.config import Settings


@dataclass(frozen=True)
class Auth0Identity:
    subject: str
    email: str
    email_verified: bool
    name: str


class Auth0Authenticator:
    """Validate Auth0 API access tokens and load the standard OIDC profile."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings = settings
        self.client = client
        self._keys: dict[str, Any] = {}
        self._keys_expires_at = 0.0

    async def _key(self, token: str):
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != "RS256" or not header.get("kid"):
                raise ValueError
            kid = header["kid"]
        except (jwt.PyJWTError, ValueError, TypeError) as exc:
            raise HTTPException(401, "Invalid access token") from exc

        if kid not in self._keys or time.monotonic() >= self._keys_expires_at:
            try:
                response = await self.client.get(
                    f"{self.settings.auth0_issuer}.well-known/jwks.json", timeout=10
                )
                response.raise_for_status()
                keys = response.json().get("keys", [])
                self._keys = {item["kid"]: jwt.PyJWK.from_dict(item).key for item in keys}
                self._keys_expires_at = time.monotonic() + 3600
            except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
                raise HTTPException(
                    503, "Authentication service is temporarily unavailable"
                ) from exc
        if kid not in self._keys:
            self._keys_expires_at = 0
            raise HTTPException(401, "Invalid access token")
        return self._keys[kid]

    async def authenticate(self, token: str) -> Auth0Identity:
        if not self.settings.auth0_domain or not self.settings.auth0_audience:
            raise HTTPException(503, "Auth0 is not configured")
        key = await self._key(token)
        try:
            claims = jwt.decode(
                token,
                key,
                algorithms=["RS256"],
                audience=self.settings.auth0_audience,
                issuer=self.settings.auth0_issuer,
                options={"require": ["exp", "iat", "iss", "sub"]},
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(
                401, "Invalid or expired access token", headers={"WWW-Authenticate": "Bearer"}
            ) from exc
        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject or len(subject) > 255:
            raise HTTPException(401, "Invalid access token subject")

        profile = claims
        if not claims.get("email"):
            try:
                response = await self.client.get(
                    f"{self.settings.auth0_issuer}userinfo",
                    headers={"Authorization": f"Bearer {token}"},
                    timeout=10,
                )
                response.raise_for_status()
                profile = {**claims, **response.json()}
            except (httpx.HTTPError, TypeError, ValueError) as exc:
                raise HTTPException(503, "Unable to load the authenticated account") from exc

        email = profile.get("email")
        if not isinstance(email, str) or not email or len(email) > 320:
            raise HTTPException(403, "An email address is required for this account")
        if profile.get("email_verified") is not True:
            raise HTTPException(403, "Verify your email address before continuing")
        name = profile.get("name") or profile.get("nickname") or email.split("@", 1)[0]
        return Auth0Identity(subject, email.lower(), True, str(name)[:80])
