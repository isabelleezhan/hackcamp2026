"""Shared dependency aliases for routes added to the original scaffold.

Auth0 verifies each caller. Store access uses the server-side service role only after route-level
ownership or membership checks.
"""

import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request

from app.main import Identity, current_user, get_store
from app.store import Store

CurrentUser = Identity
UserDep = Annotated[Identity, Depends(current_user)]
SupabaseDep = Annotated[Store, Depends(get_store)]


def require_n8n(request: Request, x_n8n_secret: Annotated[str | None, Header()] = None) -> None:
    secret = request.app.state.settings.worker_secret.get_secret_value()
    if (
        not secret
        or not x_n8n_secret
        or not hmac.compare_digest(secret.encode(), x_n8n_secret.encode())
    ):
        raise HTTPException(401, "Invalid worker credentials")
