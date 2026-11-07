"""Opt-in local email testing, independent of the publishing workflow."""

from ipaddress import ip_address
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel

from app.services.email import send_email

MAX_PDF_BYTES = 10 * 1024 * 1024


def require_email_testing(request: Request) -> None:
    settings = request.app.state.settings
    if not settings.enable_email_testing:
        raise HTTPException(
            404, "Local email testing is disabled. Set ENABLE_EMAIL_TESTING=true in backend/.env."
        )
    try:
        local = request.client is not None and ip_address(request.client.host).is_loopback
    except ValueError:
        local = False
    if not local or request.url.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise HTTPException(403, "Email testing is available only on localhost.")
    origin = request.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        raise HTTPException(403, "This frontend origin is not allowed to send test emails.")


router = APIRouter(
    prefix="/email", tags=["email testing"], dependencies=[Depends(require_email_testing)]
)


class TestEmailResponse(BaseModel):
    id: str


@router.post("/test", response_model=TestEmailResponse)
async def test_email(
    request: Request,
    to: Annotated[str, Form(min_length=3, max_length=320)],
    subject: Annotated[str, Form(min_length=1, max_length=200)],
    message: Annotated[str, Form(min_length=1, max_length=20_000)],
    idempotency_key: Annotated[str, Form(min_length=1, max_length=200)],
    pdf: Annotated[UploadFile | None, File()] = None,
):
    try:
        pdf_bytes = await pdf.read(MAX_PDF_BYTES + 1) if pdf else None
        if pdf_bytes is not None and len(pdf_bytes) > MAX_PDF_BYTES:
            raise HTTPException(413, "The PDF must be 10 MB or smaller.")
        try:
            email_id = await send_email(
                to.strip(),
                subject.strip(),
                text=message,
                pdf_bytes=pdf_bytes,
                pdf_filename=pdf.filename or "attachment.pdf" if pdf else "attachment.pdf",
                idempotency_key=f"test-email/{idempotency_key}",
                settings=request.app.state.settings,
            )
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from None
        return TestEmailResponse(id=email_id)
    finally:
        if pdf:
            await pdf.close()
