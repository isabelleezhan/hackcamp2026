"""Shared dependency aliases for routes added to the original scaffold.

Store uses each caller's verified JWT; service-role access is explicit on worker calls.
"""

import hmac
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.store import Store

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Identity:
    id: UUID
    token: str
    email: str = ""


def get_store(request: Request) -> Store:
    return request.app.state.store


async def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    store: Annotated[Store, Depends(get_store)],
) -> Identity:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Sign in required", headers={"WWW-Authenticate": "Bearer"})
    user = await store.request("GET", "/auth/v1/user", token=credentials.credentials)
    try:
        if (
            user.get("is_anonymous")
            or user.get("role") != "authenticated"
            or not user.get("email_confirmed_at")
        ):
            raise ValueError("Email authentication required")
        return Identity(UUID(user["id"]), credentials.credentials, user.get("email") or "")
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(401, "A verified email account is required") from exc


CurrentUser = Identity
UserDep = Annotated[Identity, Depends(current_user)]
SupabaseDep = Annotated[Store, Depends(get_store)]


async def audio_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    store: Annotated[Store, Depends(get_store)],
) -> Identity | None:
    """The standalone prototype needs no account until Supabase auth is configured."""
    if not request.app.state.settings.supabase_anon_key.get_secret_value():
        return None
    return await current_user(credentials, store)


def require_n8n(request: Request, x_n8n_secret: Annotated[str | None, Header()] = None) -> None:
    secret = request.app.state.settings.worker_secret.get_secret_value()
    if (
        not secret
        or not x_n8n_secret
        or not hmac.compare_digest(secret.encode(), x_n8n_secret.encode())
    ):
        raise HTTPException(401, "Invalid worker credentials")
