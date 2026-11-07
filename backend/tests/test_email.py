import base64
import json

import httpx
import pytest
from fastapi import HTTPException
from pydantic import SecretStr

from app.services.email import send_email


async def test_sends_pdf_bytes_and_stable_idempotency_key(settings):
    pdf = b"%PDF-1.7\nattachment fixture\n%%EOF"
    requests = []

    def handle(request):
        requests.append(request)
        payload = json.loads(request.content)
        assert request.url == "https://api.resend.com/emails"
        assert request.headers["Authorization"] == "Bearer test-resend"
        assert request.headers["Idempotency-Key"] == "weekly-paper/recipient-1"
        assert payload["from"] == settings.email_from
        assert payload["to"] == ["reader@example.invalid"]
        assert payload["subject"] == "This week's paper"
        assert payload["html"] == "<p>Attached.</p>"
        attachment = payload["attachments"][0]
        assert attachment["filename"] == "weekly-paper.pdf"
        assert attachment["content_type"] == "application/pdf"
        assert base64.b64decode(attachment["content"]) == pdf
        return httpx.Response(200, json={"id": "resend-email-id"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        for _ in range(2):
            result = await send_email(
                "reader@example.invalid",
                "This week's paper",
                html="<p>Attached.</p>",
                pdf_bytes=pdf,
                pdf_filename="weekly-paper.pdf",
                idempotency_key="weekly-paper/recipient-1",
                settings=settings,
                client=client,
            )
            assert result == "resend-email-id"
        assert not client.is_closed
    assert len(requests) == 2


async def test_sends_plain_text_without_attachment(settings):
    def handle(request):
        payload = json.loads(request.content)
        assert payload["text"] == "Hello."
        assert "attachments" not in payload
        assert "html" not in payload
        return httpx.Response(200, json={"id": "text-email-id"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        assert (
            await send_email(
                "reader@example.invalid",
                "Hello",
                text="Hello.",
                settings=settings,
                client=client,
            )
            == "text-email-id"
        )


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(400, json={"message": "private provider response"}),
        httpx.Response(200, json={}),
        httpx.Response(200, json={"id": None}),
        httpx.Response(200, text="not JSON"),
    ],
)
async def test_provider_failures_are_safe(settings, response):
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: response)) as client:
        with pytest.raises(HTTPException) as error:
            await send_email(
                "reader@example.invalid", "Hello", text="Hello.", settings=settings, client=client
            )
    assert error.value.status_code == 502
    assert "private" not in error.value.detail


async def test_missing_configuration_rejected(settings):
    settings.resend_api_key = SecretStr("")
    with pytest.raises(HTTPException) as error:
        await send_email("reader@example.invalid", "Hello", text="Hello.", settings=settings)
    assert error.value.status_code == 503


@pytest.mark.parametrize(
    "kwargs",
    [
        {},
        {"text": "Hello.", "pdf_bytes": b"not a PDF"},
        {"text": "Hello.", "pdf_bytes": b""},
        {"text": "Hello.", "pdf_bytes": b"%PDF-1.7", "pdf_filename": "../paper.pdf"},
    ],
)
async def test_invalid_input_rejected_before_sending(settings, kwargs):
    with pytest.raises(ValueError):
        await send_email("reader@example.invalid", "Hello", settings=settings, **kwargs)


async def test_encoded_payload_limit_checked_before_sending(settings, monkeypatch):
    monkeypatch.setattr("app.services.email.MAX_EMAIL_BYTES", 10)
    with pytest.raises(ValueError, match="40 MB"):
        await send_email("reader@example.invalid", "Hello", text="Hello.", settings=settings)


@pytest.mark.parametrize(
    "status,message,expected_status,hint",
    [
        (401, "Invalid API key", 502, "API key"),
        (
            403,
            "You can only send testing emails to your own email address (private@example.invalid)",
            502,
            "associated with your Resend account",
        ),
        (403, "The gmail.com domain is not verified", 502, "domain is not verified"),
        (403, "restricted_api_key", 502, "permissions"),
        (429, "rate limit", 429, "sending limit"),
        (409, "invalid idempotent request", 502, "different content"),
        (503, "internal error", 503, "temporarily unavailable"),
    ],
)
async def test_resend_errors_have_actionable_safe_messages(
    settings, status, message, expected_status, hint
):
    transport = httpx.MockTransport(
        lambda request: httpx.Response(status, json={"message": message})
    )
    async with httpx.AsyncClient(transport=transport) as client:
        with pytest.raises(HTTPException) as error:
            await send_email(
                "reader@example.invalid", "Hello", text="Hello.", settings=settings, client=client
            )
    assert error.value.status_code == expected_status
    assert hint in error.value.detail
    assert "private@example.invalid" not in error.value.detail
    assert settings.resend_api_key.get_secret_value() not in error.value.detail


@pytest.mark.parametrize(
    "exception,status,hint",
    [
        (httpx.ReadTimeout("private request details"), 504, "timed out"),
        (httpx.ConnectError("private request details"), 502, "connect to Resend"),
    ],
)
async def test_network_errors_keep_request_details_private(settings, exception, status, hint):
    def handle(request):
        raise exception

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(HTTPException) as error:
            await send_email(
                "reader@example.invalid", "Hello", text="Hello.", settings=settings, client=client
            )
    assert error.value.status_code == status
    assert hint in error.value.detail
    assert "private" not in error.value.detail
