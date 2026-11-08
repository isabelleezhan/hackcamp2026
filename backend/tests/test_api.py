import io
import wave
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import SupabaseIdentity
from app.jobs import Jobs
from app.main import create_app
from app.providers import Gemini
from tests.conftest import EDITION, GROUP, OWNER, PERIOD

AUTH = {"Authorization": "Bearer user-session"}


@pytest.mark.parametrize(
    "status,delay,expected", [("failed", 120, 429), ("published", -1, 409), ("failed", -1, 202)]
)
def test_generation_retry_reports_backoff_and_only_queues_eligible_issue(
    settings, monkeypatch, status, delay, expected
):
    process = AsyncMock()
    monkeypatch.setattr(Jobs, "process_edition", process)

    def handler(request):
        assert request.url.path == "/rest/v1/editions"
        assert request.url.params["group_id"] == f"eq.{GROUP}"
        return httpx.Response(
            200,
            json=[
                {
                    "id": EDITION,
                    "status": status,
                    "next_attempt_at": (datetime.now(UTC) + timedelta(seconds=delay)).isoformat(),
                }
            ],
        )

    with make_client(settings, handler) as client:
        response = client.post(f"/groups/{GROUP}/editions/{EDITION}/retry", headers=AUTH)
    assert response.status_code == expected
    if expected == 429:
        assert 1 <= int(response.headers["Retry-After"]) <= delay
        assert "notes are saved" in response.json()["detail"]
    if expected == 202:
        process.assert_awaited_once_with(EDITION)
    else:
        process.assert_not_called()


def make_client(settings, handler=None, role="organizer", member=True):
    class FakeAuthenticator:
        async def authenticate(self, token):
            assert token == "user-session"
            return SupabaseIdentity(
                "11111111-1111-4111-8111-111111111111", "owner@example.invalid", True, "Alex"
            )

    def respond(request):
        if (
            request.url.path == "/rest/v1/profiles"
            and request.url.params.get("supabase_user_id")
            == "eq.11111111-1111-4111-8111-111111111111"
        ):
            assert request.headers["authorization"] == "Bearer test-service"
            return httpx.Response(
                200,
                json=[
                    {
                        "id": OWNER,
                        "supabase_user_id": "11111111-1111-4111-8111-111111111111",
                        "email": "owner@example.invalid",
                        "email_verified": True,
                        "display_name": "Alex",
                    }
                ],
            )
        if request.url.path == "/rest/v1/memberships":
            assert request.headers["authorization"] == "Bearer test-service"
            return httpx.Response(
                200, json=[{"group_id": GROUP, "user_id": OWNER, "role": role}] if member else []
            )
        if handler:
            return handler(request)
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    return TestClient(
        create_app(settings, httpx.MockTransport(respond), authenticator=FakeAuthenticator())
    )


def test_health_and_openapi(settings):
    with make_client(settings) as client:
        assert client.get("/health").json() == {"status": "ok"}
        schema = client.get("/openapi.json").json()
        assert "/groups/{group_id}/publish" in schema["paths"]
        assert "/groups/{group_id}/audio" in schema["paths"]


def test_unauthenticated_requests_do_not_reach_supabase(settings):
    with make_client(settings) as client:
        assert client.get("/me").status_code == 401
        assert client.get("/groups").status_code == 401


def test_outsider_denied_before_content_read(settings):
    with make_client(settings, member=False) as client:
        assert client.get(f"/groups/{GROUP}/editions/latest", headers=AUTH).status_code == 404


def test_member_cannot_publish(settings):
    with make_client(settings, role="member") as client:
        response = client.post(f"/groups/{GROUP}/publish", json={"period_id": PERIOD}, headers=AUTH)
        assert response.status_code == 403


def test_publish_uses_service_role_after_membership_check_and_expected_period(settings):
    def handler(request):
        import json

        assert request.url.path == "/rest/v1/rpc/close_issue"
        assert request.headers["authorization"] == "Bearer test-service"
        assert json.loads(request.content) == {"gid": GROUP, "expected_period_id": PERIOD}
        return httpx.Response(200, json=None)

    with make_client(settings, handler) as client:
        result = client.post(f"/groups/{GROUP}/publish", json={"period_id": PERIOD}, headers=AUTH)
        assert result.status_code == 202
        assert result.json() == {"edition_id": None, "status": "empty"}


def test_identity_spoofing_is_rejected(settings):
    with make_client(settings) as client:
        response = client.post(
            f"/groups/{GROUP}/periods/{PERIOD}/reflections",
            headers=AUTH,
            json={"body": "Hello", "user_id": OWNER},
        )
        assert response.status_code == 422


def test_reflection_list_is_scoped_to_current_user(settings):
    def handler(request):
        assert request.url.path == "/rest/v1/reflections"
        assert request.url.params["group_id"] == f"eq.{GROUP}"
        assert request.url.params["period_id"] == f"eq.{PERIOD}"
        assert request.url.params["user_id"] == f"eq.{OWNER}"
        assert request.url.params["select"] == "*,reflection_images(*)"
        return httpx.Response(200, json=[])

    with make_client(settings, handler) as client:
        response = client.get(f"/groups/{GROUP}/periods/{PERIOD}/reflections", headers=AUTH)
    assert response.status_code == 200
    assert response.json() == []


def test_uploads_multiple_images_and_creates_attachment_rows(settings):
    note = "55555555-5555-4555-8555-555555555555"
    uploaded = []

    def handler(request):
        import json

        if request.url.path == "/rest/v1/reflections":
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            return httpx.Response(200, json=[{"id": note, "period_id": PERIOD}])
        if request.url.path == "/rest/v1/issue_periods":
            return httpx.Response(
                200, json=[{"closed_at": None, "deadline_at": "2099-11-08T02:00:00Z"}]
            )
        if request.url.path == "/rest/v1/reflection_images" and request.method == "GET":
            return httpx.Response(200, json=[])
        if request.url.path.startswith("/storage/v1/object/reflection-images/"):
            assert request.method == "POST"
            uploaded.append(request.url.path)
            return httpx.Response(200, json={"Key": "stored"})
        if request.url.path == "/rest/v1/reflection_images" and request.method == "POST":
            data = json.loads(request.content)
            assert data["reflection_id"] == note
            assert data["storage_path"].startswith(f"{GROUP}/{OWNER}/{note}/")
            assert data["storage_path"].rsplit("/", 1)[1].split(".", 1)[0] == data["id"]
            return httpx.Response(201, json=[data])
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    with make_client(settings, handler) as client:
        result = client.post(
            f"/groups/{GROUP}/reflections/{note}/images",
            headers=AUTH,
            files=[
                ("files", ("first.jpg", b"\xff\xd8\xffphoto", "image/jpeg")),
                ("files", ("second.png", b"\x89PNG\r\n\x1a\npixels", "image/png")),
            ],
        )
    assert result.status_code == 201
    assert len(result.json()) == 2
    assert len(uploaded) == 2


def test_rejects_image_when_note_already_has_six(settings):
    note = "55555555-5555-4555-8555-555555555555"

    def handler(request):
        if request.url.path == "/rest/v1/reflections":
            return httpx.Response(200, json=[{"id": note, "period_id": PERIOD}])
        if request.url.path == "/rest/v1/issue_periods":
            return httpx.Response(
                200, json=[{"closed_at": None, "deadline_at": "2099-11-08T02:00:00Z"}]
            )
        if request.url.path == "/rest/v1/reflection_images":
            return httpx.Response(200, json=[{"id": str(i)} for i in range(6)])
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    with make_client(settings, handler) as client:
        result = client.post(
            f"/groups/{GROUP}/reflections/{note}/images",
            headers=AUTH,
            files={"files": ("extra.jpg", b"\xff\xd8\xffphoto", "image/jpeg")},
        )
    assert result.status_code == 409
    assert "at most 6" in result.json()["detail"]


def test_image_url_checks_note_ownership_and_signs_private_object(settings):
    note = "55555555-5555-4555-8555-555555555555"
    image = "66666666-6666-4666-8666-666666666666"
    path = f"{GROUP}/{OWNER}/{note}/{image}.webp"

    def handler(request):
        if request.url.path == "/rest/v1/reflections":
            return httpx.Response(200, json=[{"id": note, "period_id": PERIOD}])
        if request.url.path == "/rest/v1/reflection_images":
            assert request.url.params["reflection_id"] == f"eq.{note}"
            return httpx.Response(200, json=[{"storage_path": path}])
        if request.url.path.startswith("/storage/v1/object/sign/reflection-images/"):
            return httpx.Response(200, json={"signedURL": "/object/sign/reflection-images/token"})
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    with make_client(settings, handler) as client:
        result = client.get(f"/groups/{GROUP}/reflections/{note}/images/{image}/url", headers=AUTH)
    assert result.status_code == 200
    assert result.json()["expires_in"] == 60
    assert result.json()["url"].endswith("/object/sign/reflection-images/token")


def test_published_edition_images_are_scoped_to_snapshot_and_sorted_newest_first(settings):
    older_note = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    newer_note = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    older_image = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
    newer_image = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

    def handler(request):
        if request.url.path == "/rest/v1/editions":
            assert request.url.params["status"] == "eq.published"
            return httpx.Response(200, json=[{"id": EDITION}])
        if request.url.path == "/rest/v1/edition_sources":
            assert request.url.params["edition_id"] == f"eq.{EDITION}"
            return httpx.Response(
                200,
                json=[
                    {"reflection_id": older_note, "recorded_at": "2026-11-01T12:00:00Z"},
                    {"reflection_id": newer_note, "recorded_at": "2026-11-06T12:00:00Z"},
                ],
            )
        if request.url.path == "/rest/v1/reflection_images":
            ids = request.url.params["reflection_id"]
            assert older_note in ids and newer_note in ids
            return httpx.Response(
                200,
                json=[
                    {
                        "id": older_image,
                        "reflection_id": older_note,
                        "storage_path": f"{GROUP}/{OWNER}/{older_note}/{older_image}.jpg",
                        "mime_type": "image/jpeg",
                        "caption": "Older",
                        "created_at": "2026-11-01T12:01:00Z",
                    },
                    {
                        "id": newer_image,
                        "reflection_id": newer_note,
                        "storage_path": f"{GROUP}/{OWNER}/{newer_note}/{newer_image}.png",
                        "mime_type": "image/png",
                        "caption": "Newer",
                        "created_at": "2026-11-06T12:01:00Z",
                    },
                ],
            )
        if request.url.path.startswith("/storage/v1/object/sign/reflection-images/"):
            return httpx.Response(200, json={"signedURL": f"/object/sign/{request.url.path.rsplit('/', 1)[-1]}"})
        raise AssertionError(f"Unexpected request: {request.method} {request.url}")

    with make_client(settings, handler) as client:
        result = client.get(f"/groups/{GROUP}/editions/{EDITION}/images", headers=AUTH)
    assert result.status_code == 200
    assert [image["id"] for image in result.json()] == [newer_image, older_image]
    assert result.json()[0]["recorded_at"] == "2026-11-06T12:00:00Z"


def test_rejects_mismatched_image_contents_before_storage_write(settings):
    note = "55555555-5555-4555-8555-555555555555"

    def handler(request):
        if request.url.path == "/rest/v1/reflections":
            return httpx.Response(200, json=[{"id": note, "period_id": PERIOD}])
        if request.url.path == "/rest/v1/issue_periods":
            return httpx.Response(
                200, json=[{"closed_at": None, "deadline_at": "2099-11-08T02:00:00Z"}]
            )
        if request.url.path == "/rest/v1/reflection_images":
            return httpx.Response(200, json=[])
        raise AssertionError("Invalid image must not reach storage")

    with make_client(settings, handler) as client:
        result = client.post(
            f"/groups/{GROUP}/reflections/{note}/images",
            headers=AUTH,
            files={"files": ("fake.jpg", b"not an image", "image/jpeg")},
        )
    assert result.status_code == 422


@pytest.mark.parametrize(
    "payload",
    [
        {"body": "Hello", "status": "submitted"},
        {"body": "  ", "status": "submitted", "ai_consent": True},
        {"body": "x" * 2001},
        {"audio_path": "unverified/path"},
        {"body": "Hi", "lat": 49.3},
        {"body": "Hi", "audio_path": "a", "audio_duration_seconds": 181},
    ],
)
def test_invalid_reflections_rejected_without_writes(settings, payload):
    with make_client(settings) as client:
        result = client.post(
            f"/groups/{GROUP}/periods/{PERIOD}/reflections", json=payload, headers=AUTH
        )
        assert result.status_code == 422
        assert "x" * 2001 not in result.text


def test_reflection_write_forces_current_user_and_does_not_persist_consent_field(settings):
    def handler(request):
        import json

        assert request.url.path == "/rest/v1/reflections" and request.method == "POST"
        data = json.loads(request.content)
        assert (
            data["user_id"] == OWNER and data["group_id"] == GROUP and data["period_id"] == PERIOD
        )
        assert "ai_consent" not in data
        return httpx.Response(201, json=[data])

    with make_client(settings, handler) as client:
        result = client.post(
            f"/groups/{GROUP}/periods/{PERIOD}/reflections",
            headers=AUTH,
            json={"body": "My week", "status": "submitted", "ai_consent": True},
        )
        assert result.status_code == 201
        assert result.json()["body"] == "My week"


def test_closed_period_maps_to_conflict_without_exposing_private_error(settings):
    def handler(request):
        if request.method == "GET":
            return httpx.Response(200, json=[])
        return httpx.Response(
            400,
            json={"code": "P0001", "message": "Period is closed", "details": "private source data"},
        )

    with make_client(settings, handler) as client:
        result = client.post(
            f"/groups/{GROUP}/periods/{PERIOD}/reflections", headers=AUTH, json={"body": "Draft"}
        )
        assert result.status_code == 409
        assert "private source data" not in result.text


def test_latest_filters_to_published_and_omits_internal_columns(settings):
    def handler(request):
        assert request.url.params["status"] == "eq.published"
        assert "lease_token" not in request.url.params["select"]
        return httpx.Response(200, json=[{"id": EDITION}])

    with make_client(settings, handler) as client:
        result = client.get(f"/groups/{GROUP}/editions/latest", headers=AUTH)
        assert result.json()["id"] == EDITION


def test_worker_secret_required(settings):
    with make_client(settings) as client:
        assert client.post("/internal/tick").status_code == 401
        assert (
            client.post("/internal/tick", headers={"X-Worker-Secret": "wrong"}).status_code == 401
        )


def test_audio_path_traversal_rejected(settings):
    with make_client(settings) as client:
        result = client.get(
            f"/groups/{GROUP}/audio-url", params={"path": "../../private"}, headers=AUTH
        )
        assert result.status_code == 422


def test_transcription_failure_keeps_audio_and_requires_manual_text(settings, monkeypatch):
    async def fail(*args):
        raise HTTPException(502, "Provider unavailable")

    monkeypatch.setattr(Gemini, "transcribe", fail)

    def handler(request):
        assert request.method == "POST" and request.url.path.startswith(
            "/storage/v1/object/reflection-audio/"
        )
        assert request.headers["authorization"] == "Bearer test-service"
        return httpx.Response(200, json={"Key": "stored"})

    data = io.BytesIO()
    with wave.open(data, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b"\0\0" * 8000)
    with make_client(settings, handler) as client:
        result = client.post(
            f"/groups/{GROUP}/audio",
            headers=AUTH,
            data={"ai_consent": "true"},
            files={"file": ("voice.wav", data.getvalue(), "audio/wav")},
        )
        assert result.status_code == 200
        assert result.json()["status"] == "transcription_failed"
        assert "Provider unavailable" in result.json()["detail"]
        assert result.json()["audio_path"].startswith(f"{GROUP}/{OWNER}/")


def test_upload_body_limit(settings):
    with make_client(settings) as client:
        result = client.post(
            f"/groups/{GROUP}/audio",
            headers={**AUTH, "Content-Length": "12000000"},
            content=b"small",
        )
        assert result.status_code == 413


def test_me_preserves_frontend_email_contract(settings):
    def handler(request):
        assert request.url.path == "/rest/v1/profiles"
        return httpx.Response(200, json=[{"id": OWNER, "display_name": "Alex"}])

    with make_client(settings, handler) as client:
        result = client.get("/me", headers=AUTH)
        assert result.status_code == 200
        assert result.json() == {
            "id": OWNER,
            "display_name": "Alex",
            "email": "owner@example.invalid",
        }


def test_profile_update_rejects_precise_coordinates(settings):
    with make_client(settings) as client:
        result = client.patch(
            "/me",
            headers=AUTH,
            json={"location_mode": "auto", "city": "Vancouver", "lat": 49.2827, "lng": -123.1207},
        )
    assert result.status_code == 422


def test_account_stats_are_scoped_to_current_user(settings):
    def handler(request):
        if request.url.path == "/rest/v1/reflections":
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            return httpx.Response(200, json=[{"status": "submitted"}, {"status": "draft"}])
        if request.url.path == "/rest/v1/edition_sources":
            assert request.url.params["user_id"] == f"eq.{OWNER}"
            return httpx.Response(200, json=[{"edition_id": EDITION}])
        raise AssertionError(request.url)

    with make_client(settings, handler) as client:
        result = client.get("/me/stats", headers=AUTH)
    assert result.status_code == 200
    assert result.json() == {
        "groups_joined": 1,
        "groups_organized": 1,
        "email_subscriptions": 0,
        "reflections_total": 2,
        "reflections_submitted": 1,
        "editions_contributed_to": 1,
    }


def test_group_list_never_returns_nonmember_groups(settings):
    def handler(request):
        assert request.url.path == "/rest/v1/groups"
        assert request.url.params["id"] == f"in.({GROUP})"
        return httpx.Response(200, json=[{"id": GROUP, "name": "Family"}])

    with make_client(settings, handler) as client:
        result = client.get("/groups", headers=AUTH)
    assert result.status_code == 200
    assert result.json()[0]["membership"]["user_id"] == OWNER


def test_existing_n8n_header_is_supported(settings):
    from unittest.mock import AsyncMock

    with make_client(settings) as client:
        client.app.state.jobs.tick = AsyncMock(
            return_value={"closed": 0, "generated": 0, "sent": 0, "errors": 0}
        )
        result = client.post("/internal/tick", headers={"X-N8N-Secret": "test-worker"})
        assert result.status_code == 200
        client.app.state.jobs.tick.assert_awaited_once_with(5)


def test_many_notes_per_week_each_create_a_row(settings):
    import json

    created = []

    def handler(request):
        assert request.method == "POST" and request.url.path == "/rest/v1/reflections"
        data = json.loads(request.content)
        created.append(data)
        return httpx.Response(201, json=[{**data, "id": f"note-{len(created)}"}])

    with make_client(settings, handler) as client:
        for body in ["Monday: first ride", "Thursday: made it to the mailbox"]:
            result = client.post(
                f"/groups/{GROUP}/periods/{PERIOD}/reflections",
                headers=AUTH,
                json={"body": body, "city": "Vancouver", "lat": 49.3, "lng": -123.1},
            )
            assert result.status_code == 201
    assert len(created) == 2
    assert created[0]["lat"] == 49.3 and created[0]["lng"] == -123.1


def test_weekly_limit_maps_to_429(settings):
    def handler(request):
        return httpx.Response(400, json={"code": "P0001", "message": "Weekly note limit reached"})

    with make_client(settings, handler) as client:
        result = client.post(
            f"/groups/{GROUP}/periods/{PERIOD}/reflections", headers=AUTH, json={"body": "One more"}
        )
        assert result.status_code == 429
        assert "30 notes" in result.json()["detail"]


def test_replace_and_delete_target_one_note_owned_by_caller(settings):
    note = "99999999-9999-4999-8999-999999999999"
    seen = []

    def handler(request):
        assert request.url.path == "/rest/v1/reflections"
        assert request.url.params["id"] == f"eq.{note}"
        assert request.url.params["user_id"] == f"eq.{OWNER}"
        seen.append(request.method)
        return httpx.Response(200, json=[] if request.method == "PATCH" else None)

    with make_client(settings, handler) as client:
        missing = client.put(
            f"/groups/{GROUP}/reflections/{note}", headers=AUTH, json={"body": "x"}
        )
        assert missing.status_code == 404
        deleted = client.delete(f"/groups/{GROUP}/reflections/{note}", headers=AUTH)
        assert deleted.status_code == 204
    assert seen == ["PATCH", "DELETE"]


def test_note_counts_use_counts_only_rpc(settings):
    import json

    def handler(request):
        assert request.url.path == "/rest/v1/rpc/period_note_counts_for"
        assert json.loads(request.content) == {"actor_id": OWNER, "gid": GROUP, "pid": PERIOD}
        return httpx.Response(200, json=[{"user_id": OWNER, "notes": 3, "audio_seconds": 42}])

    with make_client(settings, handler) as client:
        result = client.get(f"/groups/{GROUP}/periods/{PERIOD}/note-counts", headers=AUTH)
        assert result.json() == [{"user_id": OWNER, "notes": 3, "audio_seconds": 42}]


def test_profile_update_is_partial_and_requires_rounded_location(settings):
    import json

    def handler(request):
        assert request.method == "PATCH" and request.url.path == "/rest/v1/profiles"
        data = json.loads(request.content)
        assert data.keys() == {"city", "lat", "lng", "location_mode", "location_updated_at"}
        assert (data["lat"], data["lng"]) == (38.7, -9.1)
        return httpx.Response(200, json=[{"id": OWNER, **data}])

    with make_client(settings, handler) as client:
        result = client.patch(
            "/me",
            headers=AUTH,
            json={"city": "Lisbon", "lat": 38.7, "lng": -9.1, "location_mode": "auto"},
        )
        assert result.status_code == 200
        precise = client.patch(
            "/me",
            headers=AUTH,
            json={"city": "Lisbon", "lat": 38.7223, "lng": -9.1393, "location_mode": "auto"},
        )
        assert precise.status_code == 422
        assert client.patch("/me", headers=AUTH, json={}).status_code == 422
        assert client.patch("/me", headers=AUTH, json={"timezone": "Mars/Base"}).status_code == 422


@pytest.mark.parametrize(
    "typed,sent",
    [("abcd-2345", "ABCD2345"), (" k7m9 p2qr ", "K7M9P2QR"), ("0" * 32, "0" * 32)],
)
def test_join_codes_are_normalized(settings, typed, sent):
    import json

    def handler(request):
        assert request.url.path == "/rest/v1/rpc/join_group_for"
        assert json.loads(request.content) == {"actor_id": OWNER, "invitation_code": sent}
        return httpx.Response(200, json=GROUP)

    with make_client(settings, handler) as client:
        assert client.post("/groups/join", headers=AUTH, json={"code": typed}).status_code == 200


def test_ambiguous_join_code_rejected(settings):
    with make_client(settings) as client:
        assert (
            client.post("/groups/join", headers=AUTH, json={"code": "OIL12345"}).status_code == 422
        )


def test_email_preview_is_the_members_own_email(settings, newspaper):
    def handler(request):
        if request.url.path == "/rest/v1/editions":
            assert request.url.params["status"] == "eq.published"
            return httpx.Response(
                200,
                json=[{"id": EDITION, "group_id": GROUP, "issue_number": 3, "content": newspaper}],
            )
        if request.url.path == "/rest/v1/groups":
            return httpx.Response(200, json=[{"name": "The Long-Distance Weekly"}])
        raise AssertionError(request.url)

    with make_client(settings, handler) as client:
        result = client.get(f"/groups/{GROUP}/editions/{EDITION}/email-preview", headers=AUTH)
    assert result.status_code == 200
    body = result.json()
    assert body["to"] == ["owner@example.invalid"]
    assert body["subject"].startswith("The Long-Distance Weekly, Issue 3: ")
    assert "Read the full issue" in body["html"]


def test_email_preview_hidden_from_outsiders_and_drafts(settings):
    with make_client(settings, member=False) as client:
        url = f"/groups/{GROUP}/editions/{EDITION}/email-preview"
        assert client.get(url, headers=AUTH).status_code == 404

    def unpublished(request):
        return httpx.Response(200, json=[])

    with make_client(settings, unpublished) as client:
        url = f"/groups/{GROUP}/editions/{EDITION}/email-preview"
        assert client.get(url, headers=AUTH).status_code == 404
