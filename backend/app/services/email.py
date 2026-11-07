"""Standalone Resend email helper; callers decide recipients and when to send."""

import base64
import json
import logging
from contextlib import nullcontext

import httpx
from fastapi import HTTPException

from app.config import Settings, get_settings

MAX_EMAIL_BYTES = 40_000_000
logger = logging.getLogger(__name__)


async def send_email(
    to: str,
    subject: str,
    *,
    text: str | None = None,
    html: str | None = None,
    pdf_bytes: bytes | None = None,
    pdf_filename: str = "newspaper.pdf",
    idempotency_key: str | None = None,
    settings: Settings | None = None,
    client: httpx.AsyncClient | None = None,
) -> str:
    """Send one email and return Resend's email ID (acceptance, not inbox delivery).

    Reads RESEND_API_KEY and EMAIL_FROM (or RESEND_FROM_EMAIL) from backend/.env.
    Pass PDF bytes directly from a generator or Path(...).read_bytes(). At least
    one of text/html is required; PDF attachments are optional. Supply the same
    idempotency_key and unchanged content when retrying a logical send. No automatic
    retries are made. An injected HTTP client stays open for its caller to reuse.
    """
    if not to.strip() or not subject.strip():
        raise ValueError("Recipient and subject are required")
    if not text and not html:
        raise ValueError("Provide a text or HTML email body")

    settings = settings or get_settings()
    key = settings.resend_api_key.get_secret_value()
    if not key or not settings.email_from:
        raise HTTPException(503, "Set RESEND_API_KEY and EMAIL_FROM in backend/.env")

    payload = {"from": settings.email_from, "to": [to], "subject": subject}
    if text is not None:
        payload["text"] = text
    if html is not None:
        payload["html"] = html
    if pdf_bytes is not None:
        if not pdf_bytes.startswith(b"%PDF-"):
            raise ValueError("The attachment must contain PDF bytes")
        if not pdf_filename.lower().endswith(".pdf") or any(
            char in pdf_filename for char in "\r\n\0/\\"
        ):
            raise ValueError("Use a PDF filename without directories or control characters")
        payload["attachments"] = [
            {
                "filename": pdf_filename,
                "content_type": "application/pdf",
                "content": base64.b64encode(pdf_bytes).decode("ascii"),
            }
        ]
    if len(json.dumps(payload).encode("utf-8")) > MAX_EMAIL_BYTES:
        raise ValueError("Email including the Base64 attachment exceeds 40 MB")

    headers = {"Authorization": f"Bearer {key}"}
    if idempotency_key is not None:
        headers["Idempotency-Key"] = idempotency_key

    try:
        async with (
            httpx.AsyncClient(timeout=30) if client is None else nullcontext(client)
        ) as email_client:
            response = await email_client.post(
                "https://api.resend.com/emails",
                headers=headers,
                json=payload,
                timeout=30,
            )
            response.raise_for_status()
            email_id = response.json().get("id")
            if not isinstance(email_id, str) or not email_id:
                raise ValueError("Missing email ID")
            return email_id
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        logger.warning("Resend rejected an email: HTTP %s", status)
        try:
            provider_error = exc.response.json()
            message = (
                str(provider_error.get("message", "")).lower()
                if isinstance(provider_error, dict)
                else ""
            )
        except ValueError:
            message = ""
        if status == 401:
            detail = "Resend rejected the API key. Check RESEND_API_KEY in backend/.env and restart the backend."
        elif status == 403 and "only send testing emails" in message:
            detail = "Resend's test sender can only email the address associated with your Resend account. Use that recipient, or configure a verified sending domain."
        elif status == 403 and "domain" in message and "not verified" in message:
            detail = "The EMAIL_FROM domain is not verified in Resend. For local tests, use onboarding@resend.dev and send to your Resend account email. For other recipients, verify your own domain."
        elif status == 403:
            detail = "Resend rejected the sender or API key permissions. Check your verified sending domain and the key's sending permissions."
        elif status == 429:
            raise HTTPException(
                429, "Resend's sending limit was reached. Please try again later."
            ) from None
        elif status == 409:
            detail = "Resend rejected a reused send key with different content. Edit the form to start a new email request."
        elif status >= 500:
            raise HTTPException(
                503, "Resend is temporarily unavailable. Retry the unchanged form shortly."
            ) from None
        else:
            detail = f"Resend rejected the email (HTTP {status}). Check the recipient, sender, and PDF attachment."
        raise HTTPException(502, detail) from None
    except httpx.TimeoutException:
        raise HTTPException(
            504,
            "Resend timed out; delivery status is unknown. Retry the unchanged form to reuse the same send key.",
        ) from None
    except httpx.RequestError:
        raise HTTPException(
            502, "Could not connect to Resend. Check the backend network connection and try again."
        ) from None
    except (ValueError, TypeError, AttributeError):
        # Provider responses can include private content; do not expose them.
        raise HTTPException(502, "Resend did not confirm email acceptance") from None
