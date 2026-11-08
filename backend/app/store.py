from typing import Any

import httpx
from fastapi import HTTPException

from app.config import Settings


class Store:
    """Supabase REST/storage client. Supabase Auth-backed routes use admin access after authorization."""

    def __init__(self, settings: Settings, client: httpx.AsyncClient):
        self.settings = settings
        self.client = client

    def headers(self, token: str | None = None, *, admin: bool = False) -> dict[str, str]:
        key = (
            self.settings.supabase_service_role_key if admin else self.settings.supabase_anon_key
        ).get_secret_value()
        if not key:
            raise HTTPException(503, "Supabase credentials are not configured")
        return {"apikey": key, "Authorization": f"Bearer {key if admin else token or key}"}

    async def request(
        self,
        method: str,
        path: str,
        *,
        token: str | None = None,
        admin: bool = False,
        params: dict | None = None,
        json: Any = None,
        content: bytes | None = None,
        headers: dict | None = None,
    ) -> Any:
        auth_headers = self.headers(token, admin=admin)
        auth_headers.update(headers or {})
        try:
            response = await self.client.request(
                method,
                f"{self.settings.supabase_url}{path}",
                headers=auth_headers,
                params=params,
                json=json,
                content=content,
            )
        except httpx.RequestError as exc:
            raise HTTPException(503, "Supabase is temporarily unavailable") from exc
        if response.is_error:
            # Never return upstream bodies, which may contain private rows or credentials.
            try:
                error = response.json()
            except ValueError:
                error = {}
            code, message = error.get("code"), error.get("message", "")
            if response.status_code == 401:
                raise HTTPException(401, "Invalid or expired session")
            if code == "23505":
                raise HTTPException(409, "That record already exists")
            if message == "Weekly note limit reached":
                raise HTTPException(
                    429, "You've added 30 notes for this issue. That's the per-issue limit."
                )
            if message == "Weekly audio limit reached":
                raise HTTPException(
                    429, "You've recorded 30 minutes for this issue. That's the per-issue limit."
                )
            if message == "Period is closed":
                raise HTTPException(
                    409, "This issue period is closed; contribute to the next period"
                )
            if (
                message in {"Organizer required", "Membership required"}
                or response.status_code == 403
            ):
                raise HTTPException(403, "You do not have access to this action")
            if message in {"Invalid invitation", "Period not found"}:
                raise HTTPException(404, message)
            if code in {"23514", "23503", "22P02"}:
                raise HTTPException(422, "Invalid data or reference")
            raise HTTPException(502, "Supabase request failed")
        if not response.content:
            return None
        if "application/json" in response.headers.get("content-type", ""):
            return response.json()
        return response.content

    async def rows(self, table: str, *, token=None, admin=False, **filters) -> list[dict]:
        return await self.request(
            "GET",
            f"/rest/v1/{table}",
            token=token,
            admin=admin,
            params={"select": "*", **filters},
        )

    async def rpc(self, name: str, data: dict, *, token=None, admin=False):
        return await self.request(
            "POST",
            f"/rest/v1/rpc/{name}",
            token=token,
            admin=admin,
            json=data,
        )

    async def write(
        self, method: str, table: str, data=None, *, token=None, admin=False, **filters
    ):
        return await self.request(
            method,
            f"/rest/v1/{table}",
            token=token,
            admin=admin,
            params=filters,
            json=data,
            headers={"Prefer": "return=representation"},
        )
