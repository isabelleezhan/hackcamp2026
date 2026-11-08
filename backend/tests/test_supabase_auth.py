import httpx
import pytest
from fastapi import HTTPException

from app.auth import SupabaseAuthenticator
from tests.conftest import OWNER


@pytest.mark.asyncio
async def test_verified_supabase_session(settings):
    def handler(request):
        assert request.url.path == "/auth/v1/user"
        assert request.headers["apikey"] == "test-public"
        assert request.headers["authorization"] == "Bearer session-token"
        return httpx.Response(
            200,
            json={
                "id": OWNER,
                "email": "Person@Example.invalid",
                "email_confirmed_at": "2026-11-08T00:00:00Z",
                "user_metadata": {"display_name": "Person"},
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        identity = await SupabaseAuthenticator(settings, client).authenticate("session-token")
    assert identity.subject == OWNER
    assert identity.email == "person@example.invalid"
    assert identity.email_verified is True
    assert identity.name == "Person"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status,body,expected",
    [
        (401, {}, 401),
        (403, {}, 401),
        (429, {}, 503),
        (500, {}, 503),
        (200, {"id": OWNER, "email": "x@example.invalid"}, 403),
        (200, {"id": OWNER, "email_confirmed_at": "confirmed"}, 403),
        (
            200,
            {"id": "invalid", "email": "x@example.invalid", "email_confirmed_at": "confirmed"},
            503,
        ),
        (200, [], 503),
    ],
)
async def test_supabase_auth_rejects_invalid_sessions(settings, caplog, status, body, expected):
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: httpx.Response(status, json=body))
    ) as client:
        with pytest.raises(HTTPException) as error:
            await SupabaseAuthenticator(settings, client).authenticate("secret-token")
    assert error.value.status_code == expected
    assert "secret-token" not in caplog.text


@pytest.mark.asyncio
async def test_supabase_auth_network_failure(settings):
    def handler(request):
        raise httpx.ConnectError("unavailable", request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(HTTPException) as error:
            await SupabaseAuthenticator(settings, client).authenticate("session")
    assert error.value.status_code == 503


def test_first_api_request_links_profile_using_verified_auth_identity(settings):
    import json

    from fastapi.testclient import TestClient

    from app.main import create_app
    from tests.conftest import MEMBER

    calls = []
    profile = {
        "id": OWNER,
        "supabase_user_id": MEMBER,
        "email": "member@example.invalid",
        "email_verified": True,
    }

    def handler(request):
        calls.append(request.url.path)
        if request.url.path == "/auth/v1/user":
            assert request.headers["authorization"] == "Bearer session"
            return httpx.Response(
                200,
                json={"id": MEMBER, "email": profile["email"], "email_confirmed_at": "confirmed"},
            )
        assert request.headers["authorization"] == "Bearer test-service"
        if request.url.path == "/rest/v1/rpc/ensure_supabase_profile":
            assert json.loads(request.content) == {"auth_user_id": MEMBER}
            return httpx.Response(200, json=[profile])
        assert request.url.path == "/rest/v1/profiles"
        if "supabase_user_id" in request.url.params:
            assert request.url.params["supabase_user_id"] == f"eq.{MEMBER}"
            return httpx.Response(200, json=[])
        assert request.url.params["id"] == f"eq.{OWNER}"
        return httpx.Response(200, json=[profile])

    with TestClient(create_app(settings, transport=httpx.MockTransport(handler))) as client:
        result = client.get("/me", headers={"Authorization": "Bearer session"})
    assert result.status_code == 200
    assert result.json()["id"] == OWNER
    assert "supabase_user_id" not in result.json()
    assert calls[0] == "/auth/v1/user"
