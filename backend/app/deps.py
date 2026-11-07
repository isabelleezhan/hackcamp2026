"""Shared FastAPI dependencies: the Supabase admin client and the signed-in user."""

from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from supabase import Client, create_client

from .config import get_settings


@lru_cache
def get_supabase() -> Client:
    """One shared service-role client. It bypasses RLS, so every route must check membership.

    Never call sign_in/sign_up on this client: that would swap its session for a user's
    and every later request would run as that user.
    """
    s = get_settings()
    if not s.supabase_url or not s.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)")
    return create_client(s.supabase_url, s.supabase_service_role_key)


@dataclass
class CurrentUser:
    id: str
    email: str


def current_user(authorization: Annotated[str | None, Header()] = None) -> CurrentUser:
    """Verify the Supabase access token the frontend sends as `Authorization: Bearer <token>`."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = authorization.split(" ", 1)[1]
    sb = get_supabase()
    try:
        res = sb.auth.get_user(token)
    except Exception as exc:  # supabase raises AuthApiError for bad/expired tokens
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session") from exc
    if res is None or res.user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session")

    user = CurrentUser(id=res.user.id, email=res.user.email or "")
    # Make sure a profile row exists so foreign keys (memberships, reflections) work.
    sb.table("profiles").upsert(
        {"id": user.id, "email": user.email}, on_conflict="id", ignore_duplicates=True
    ).execute()
    return user


def require_n8n(x_n8n_secret: Annotated[str | None, Header()] = None) -> None:
    """Guard for endpoints only n8n should call (weekly publish, delivery)."""
    secret = get_settings().n8n_webhook_secret
    if not secret or x_n8n_secret != secret:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Bad n8n secret")


UserDep = Annotated[CurrentUser, Depends(current_user)]
SupabaseDep = Annotated[Client, Depends(get_supabase)]
