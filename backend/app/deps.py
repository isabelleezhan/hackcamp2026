"""Shared dependency aliases for routes added to the original scaffold.

Auth0 verifies each caller. Store access uses the server-side service role only after route-level
ownership or membership checks.
"""

import hmac
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import Depends, Header, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.store import Store

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class Identity:
    id: UUID
    subject: str
    token: str
    email: str = ""


def get_store(request: Request) -> Store:
    return request.app.state.store


async def current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    store: Annotated[Store, Depends(get_store)],
    request: Request,
) -> Identity:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(401, "Sign in required", headers={"WWW-Authenticate": "Bearer"})
    auth0_user = await request.app.state.authenticator.authenticate(credentials.credentials)
    rows = await store.rows("profiles", admin=True, auth0_subject=f"eq.{auth0_user.subject}")
    if not rows:
        try:
            rows = await store.write(
                "POST",
                "profiles",
                {
                    "id": str(uuid4()),
                    "auth0_subject": auth0_user.subject,
                    "email": auth0_user.email,
                    "email_verified": auth0_user.email_verified,
                    "display_name": auth0_user.name or "Member",
                },
                admin=True,
            )
        except HTTPException as exc:
            if exc.status_code != 409:
                raise
            rows = await store.rows(
                "profiles", admin=True, auth0_subject=f"eq.{auth0_user.subject}"
            )
    elif rows[0].get("email") != auth0_user.email or not rows[0].get("email_verified"):
        rows = await store.write(
            "PATCH",
            "profiles",
            {"email": auth0_user.email, "email_verified": True},
            admin=True,
            id=f"eq.{rows[0]['id']}",
        )
    if not rows:
        raise HTTPException(503, "Unable to provision the authenticated account")
    return Identity(
        UUID(rows[0]["id"]), auth0_user.subject, credentials.credentials, auth0_user.email
    )


CurrentUser = Identity
UserDep = Annotated[Identity, Depends(current_user)]
SupabaseDep = Annotated[Store, Depends(get_store)]


async def audio_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    store: Annotated[Store, Depends(get_store)],
) -> Identity:
    return await current_user(credentials, store, request)


def require_n8n(request: Request, x_n8n_secret: Annotated[str | None, Header()] = None) -> None:
    secret = request.app.state.settings.worker_secret.get_secret_value()
    if (
        not secret
        or not x_n8n_secret
        or not hmac.compare_digest(secret.encode(), x_n8n_secret.encode())
    ):
        raise HTTPException(401, "Invalid worker credentials")
