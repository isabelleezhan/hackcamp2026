import asyncio
import base64
import time

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException

from app.auth import Auth0Authenticator


def encoded(number: int) -> str:
    raw = number.to_bytes((number.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


@pytest.mark.asyncio
async def test_auth0_validates_jwt_and_loads_verified_email(settings):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    numbers = key.public_key().public_numbers()
    jwk = {
        "kty": "RSA",
        "kid": "test-key",
        "use": "sig",
        "n": encoded(numbers.n),
        "e": encoded(numbers.e),
    }
    token = jwt.encode(
        {
            "iss": settings.auth0_issuer,
            "aud": settings.auth0_audience,
            "sub": "auth0|person",
            "iat": int(time.time()),
            "exp": int(time.time()) + 300,
        },
        key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )

    profile_calls = 0

    async def respond(request):
        nonlocal profile_calls
        if request.url.path == "/.well-known/jwks.json":
            return httpx.Response(200, json={"keys": [jwk]})
        if request.url.path == "/userinfo":
            profile_calls += 1
            await asyncio.sleep(0)
            assert request.headers["authorization"] == f"Bearer {token}"
            return httpx.Response(
                200,
                json={
                    "sub": "auth0|person",
                    "email": "Person@Example.invalid",
                    "email_verified": True,
                    "name": "Person",
                },
            )
        raise AssertionError(request.url)

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        auth = Auth0Authenticator(settings, client)
        identities = await asyncio.gather(*(auth.authenticate(token) for _ in range(6)))
        identity = identities[0]
        assert all(item == identity for item in identities)
        assert profile_calls == 1
        # Expired profile entries cause a fresh upstream lookup.
        for cache_key, (_, profile) in list(auth._profiles.items()):
            auth._profiles[cache_key] = (0, profile)
        await auth.authenticate(token)
        assert profile_calls == 2
        # A cached profile never bypasses token validation.
        auth._keys["test-key"] = rsa.generate_private_key(
            public_exponent=65537, key_size=2048
        ).public_key()
        with pytest.raises(HTTPException) as error:
            await auth.authenticate(token)
        assert error.value.status_code == 401
        assert profile_calls == 2
    assert identity.subject == "auth0|person"
    assert identity.email == "person@example.invalid"
    assert identity.name == "Person"


@pytest.mark.asyncio
async def test_auth0_rejects_wrong_audience(settings, caplog):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    numbers = key.public_key().public_numbers()
    jwk = {
        "kty": "RSA",
        "kid": "test-key",
        "use": "sig",
        "n": encoded(numbers.n),
        "e": encoded(numbers.e),
    }
    token = jwt.encode(
        {
            "iss": settings.auth0_issuer,
            "aud": "https://wrong.example.invalid",
            "sub": "auth0|person",
            "iat": int(time.time()),
            "exp": int(time.time()) + 300,
            "email": "person@example.invalid",
            "email_verified": True,
        },
        key,
        algorithm="RS256",
        headers={"kid": "test-key"},
    )

    def respond(request):
        return httpx.Response(200, json={"keys": [jwk]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(HTTPException) as error:
            await Auth0Authenticator(settings, client).authenticate(token)
    assert error.value.status_code == 401
    assert "InvalidAudienceError" in caplog.text
    assert settings.auth0_audience in caplog.text
    assert token not in caplog.text
    assert "person@example.invalid" not in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "status, subject", [(429, "auth0|person"), (401, "auth0|person"), (200, "auth0|other")]
)
async def test_userinfo_failures_are_not_cached_or_logged_with_secrets(
    settings, caplog, status, subject
):
    calls = 0

    def respond(request):
        nonlocal calls
        calls += 1
        return httpx.Response(
            status,
            json={
                "sub": subject,
                "email": "private@example.invalid",
                "email_verified": True,
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        auth = Auth0Authenticator(settings, client)
        for _ in range(2):
            with pytest.raises(HTTPException) as error:
                await auth._userinfo("secret-token", "auth0|person")
            assert error.value.status_code == 503
        assert calls == 2
        assert not auth._profiles
    assert "Auth0 userinfo failed" in caplog.text
    assert "secret-token" not in caplog.text
    assert "private@example.invalid" not in caplog.text


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "overrides, accepted",
    [
        ({"iat": 30, "nbf": 30}, True),
        ({"iat": 120}, False),
        ({"nbf": 120}, False),
        ({"exp": -120}, False),
        ({"aud": "https://wrong.example.invalid"}, False),
        ({"iss": "https://wrong.example.invalid/"}, False),
    ],
)
async def test_auth0_clock_tolerance_preserves_validation(settings, overrides, accepted):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = int(time.time())
    claims = {
        "iss": settings.auth0_issuer,
        "aud": settings.auth0_audience,
        "sub": "auth0|person",
        "iat": now,
        "exp": now + 300,
        "email": "person@example.invalid",
        "email_verified": True,
    }
    claims.update(
        {
            name: now + value if name in {"iat", "nbf", "exp"} else value
            for name, value in overrides.items()
        }
    )
    token = jwt.encode(claims, key, algorithm="RS256", headers={"kid": "test-key"})

    def no_network(request):
        raise AssertionError("Claims include a profile and the signing key is cached")

    async with httpx.AsyncClient(transport=httpx.MockTransport(no_network)) as client:
        auth = Auth0Authenticator(settings, client)
        auth._keys = {"test-key": key.public_key()}
        auth._keys_expires_at = time.monotonic() + 300
        if accepted:
            assert (await auth.authenticate(token)).email == "person@example.invalid"
        else:
            with pytest.raises(HTTPException) as error:
                await auth.authenticate(token)
            assert error.value.status_code == 401
