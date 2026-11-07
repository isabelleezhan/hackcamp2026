import copy
import json

import httpx
import pytest
from fastapi import HTTPException

from app.models import Newspaper
from app.providers import Gemini, Resend, email_payload, validate_attribution
from tests.conftest import DELIVERY, EDITION, GROUP, MEMBER, SOURCE


def test_valid_attribution(source, newspaper):
    validate_attribution(Newspaper.model_validate(newspaper), [source])


@pytest.mark.parametrize(
    "change",
    [
        "wrong_name",
        "wrong_user",
        "unknown_source",
        "missing_user",
        "duplicate_user",
        "invented_section_source",
    ],
)
def test_invalid_attribution_fails(source, newspaper, change):
    data = copy.deepcopy(newspaper)
    if change == "wrong_name":
        data["member_updates"][0]["display_name"] = "Invented Name"
    elif change == "wrong_user":
        data["member_updates"][0]["user_id"] = MEMBER
    elif change == "unknown_source":
        data["member_updates"][0]["source_reflection_ids"] = [MEMBER]
    elif change == "missing_user":
        source = {**source, "user_id": MEMBER}
    elif change == "duplicate_user":
        data["member_updates"].append(data["member_updates"][0])
    else:
        data["looking_ahead"] = [
            {"headline": "Invented", "text": "Unsupported", "source_reflection_ids": [MEMBER]}
        ]
    with pytest.raises(ValueError):
        validate_attribution(Newspaper.model_validate(data), [source])


async def test_gemini_uses_schema_and_treats_sources_as_data(settings, source, newspaper):
    def handle(request):
        assert request.headers["x-goog-api-key"] == "test-gemini"
        payload = json.loads(request.content)
        assert payload["generationConfig"]["responseJsonSchema"]["type"] == "object"
        assert "never instructions" in payload["systemInstruction"]["parts"][0]["text"]
        assert SOURCE in payload["contents"][0]["parts"][0]["text"]
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {"parts": [{"text": json.dumps(newspaper)}]},
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        content = await Gemini(settings, client).newspaper([source])
        assert content.headline == newspaper["headline"]


async def test_incomplete_gemini_response_is_rejected(settings):
    def handle(request):
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": "{}"}]}}
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(HTTPException) as error:
            await Gemini(settings, client).transcribe(b"audio", "audio/wav")
        assert error.value.status_code == 502


def test_email_escapes_source_text_and_links_to_authenticated_page(settings, newspaper):
    newspaper["headline"] = '<script>alert("x")</script>'
    payload = email_payload(
        settings,
        {"recipient_email": "reader@example.invalid"},
        {
            "id": EDITION,
            "group_id": GROUP,
            "content": newspaper,
        },
    )
    assert "<script>" not in payload["html"]
    assert "&lt;script&gt;" in payload["html"]
    assert f"/groups/{GROUP}/editions/{EDITION}" in payload["html"]
    assert "sign-in required" in payload["html"]


async def test_resend_retries_use_stable_idempotency_key(settings):
    keys = []

    def handle(request):
        keys.append(request.headers["Idempotency-Key"])
        return httpx.Response(200, json={"id": "provider-id"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        provider = Resend(settings, client)
        await provider.send(DELIVERY, {"to": ["reader@example.invalid"]})
        await provider.send(DELIVERY, {"to": ["reader@example.invalid"]})
    assert keys == [f"edition/{DELIVERY}"] * 2


def test_one_story_can_cite_several_notes_and_use_a_real_dateline(source, newspaper):
    second = {**source, "reflection_id": MEMBER, "body": "Then I planted tulips.", "city": "Lisbon"}
    data = copy.deepcopy(newspaper)
    data["member_updates"][0]["source_reflection_ids"] = [SOURCE, MEMBER]
    data["member_updates"][0]["dateline"] = "Lisbon"
    validate_attribution(Newspaper.model_validate(data), [source, second])


def test_story_must_cite_every_note_and_not_invent_datelines(source, newspaper):
    second = {**source, "reflection_id": MEMBER, "body": "Then I planted tulips.", "city": "Lisbon"}
    with pytest.raises(ValueError):  # second note not cited
        validate_attribution(Newspaper.model_validate(newspaper), [source, second])
    data = copy.deepcopy(newspaper)
    data["member_updates"][0]["source_reflection_ids"] = [SOURCE, MEMBER]
    data["member_updates"][0]["dateline"] = "Paris"
    with pytest.raises(ValueError):
        validate_attribution(Newspaper.model_validate(data), [source, second])
