from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import create_app

FORM = {
    "to": "reader@example.invalid",
    "subject": "Test paper",
    "message": "Your test paper is attached.",
    "idempotency_key": "request-123",
}


def local_client(settings):
    return TestClient(
        create_app(settings), base_url="http://localhost", client=("127.0.0.1", 50000)
    )


def test_local_form_sends_email_with_pdf(settings):
    settings.enable_email_testing = True
    pdf = b"%PDF-1.7\ntest fixture\n%%EOF"
    with (
        patch(
            "app.routers.email.send_email", new_callable=AsyncMock, return_value="email-123"
        ) as send,
        local_client(settings) as client,
    ):
        response = client.post(
            "/email/test",
            data=FORM,
            files={"pdf": ("paper.pdf", pdf, "application/pdf")},
            headers={"Origin": "http://localhost:5173"},
        )
    assert response.status_code == 200
    assert response.json() == {"id": "email-123"}
    assert send.call_args.args == (FORM["to"], FORM["subject"])
    assert send.call_args.kwargs["text"] == FORM["message"]
    assert send.call_args.kwargs["pdf_bytes"] == pdf
    assert send.call_args.kwargs["pdf_filename"] == "paper.pdf"
    assert send.call_args.kwargs["idempotency_key"] == "test-email/request-123"


def test_attachment_is_optional(settings):
    settings.enable_email_testing = True
    with (
        patch(
            "app.routers.email.send_email", new_callable=AsyncMock, return_value="email-123"
        ) as send,
        local_client(settings) as client,
    ):
        response = client.post("/email/test", data=FORM)
    assert response.status_code == 200
    assert send.call_args.kwargs["pdf_bytes"] is None


def test_email_testing_is_disabled_by_default(settings):
    with (
        patch("app.routers.email.send_email", new_callable=AsyncMock) as send,
        local_client(settings) as client,
    ):
        response = client.post("/email/test", data=FORM)
    assert response.status_code == 404
    send.assert_not_awaited()


def test_email_testing_rejects_remote_clients(settings):
    settings.enable_email_testing = True
    with (
        patch("app.routers.email.send_email", new_callable=AsyncMock) as send,
        TestClient(
            create_app(settings), base_url="http://localhost", client=("203.0.113.1", 50000)
        ) as client,
    ):
        response = client.post("/email/test", data=FORM)
    assert response.status_code == 403
    send.assert_not_awaited()


def test_email_testing_rejects_untrusted_origin(settings):
    settings.enable_email_testing = True
    with (
        patch("app.routers.email.send_email", new_callable=AsyncMock) as send,
        local_client(settings) as client,
    ):
        response = client.post(
            "/email/test", data=FORM, headers={"Origin": "https://untrusted.example.invalid"}
        )
    assert response.status_code == 403
    send.assert_not_awaited()


def test_invalid_pdf_returns_readable_error(settings):
    settings.enable_email_testing = True
    with (
        patch(
            "app.routers.email.send_email",
            new_callable=AsyncMock,
            side_effect=ValueError("The attachment must contain PDF bytes"),
        ),
        local_client(settings) as client,
    ):
        response = client.post(
            "/email/test", data=FORM, files={"pdf": ("paper.pdf", b"invalid", "application/pdf")}
        )
    assert response.status_code == 422
    assert response.json()["detail"] == "The attachment must contain PDF bytes"


def test_oversized_pdf_is_rejected_before_sending(settings):
    settings.enable_email_testing = True
    with (
        patch("app.routers.email.send_email", new_callable=AsyncMock) as send,
        local_client(settings) as client,
    ):
        response = client.post(
            "/email/test",
            data=FORM,
            files={"pdf": ("paper.pdf", b"x" * (10 * 1024 * 1024 + 1), "application/pdf")},
        )
    assert response.status_code == 413
    send.assert_not_awaited()
