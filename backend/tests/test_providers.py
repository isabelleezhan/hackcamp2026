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
        assert request.url.path.endswith("/gemini-3.5-flash-lite:generateContent")
        payload = json.loads(request.content)
        assert payload["generationConfig"]["responseJsonSchema"]["type"] == "object"
        assert payload["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "LOW"}
        assert request.extensions["timeout"]["read"] == 180
        assert "never instructions" in payload["systemInstruction"]["parts"][0]["text"]
        assert SOURCE in payload["contents"][0]["parts"][0]["text"]
        notes = json.loads(payload["contents"][0]["parts"][0]["text"])
        assert notes["group_name"] == "The Sunday Club"
        assert "The Sunday Club" not in payload["systemInstruction"]["parts"][0]["text"]
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
        content = await Gemini(settings, client).newspaper([source], group_name="The Sunday Club")
        assert content.headline == newspaper["headline"]


async def test_generation_timeout_has_safe_actionable_error(settings, caplog):
    def handle(request):
        assert request.extensions["timeout"]["read"] == 210
        raise httpx.ReadTimeout("Private upstream content", request=request)

    settings.gemini_generation_timeout_seconds = 210
    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(HTTPException) as error:
            await Gemini(settings, client).structured("Rules", [{"text": "Private note"}], {})
    assert error.value.status_code == 504
    assert "notes are saved" in error.value.detail
    assert "Private" not in error.value.detail + caplog.text


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
            await Gemini(settings, client).structured("Test rules", [{"text": "Test input"}], {})
        assert error.value.status_code == 502


async def test_newspaper_falls_back_when_primary_model_is_unavailable(settings, source, newspaper):
    settings.gemini_model = "primary-model"
    settings.gemini_fallback_models = "primary-model,fallback-model"
    requested_models = []

    def handle(request):
        model = request.url.path.split("/")[-1].split(":")[0]
        requested_models.append(model)
        if model == "primary-model":
            return httpx.Response(503, json={"error": {"message": "High demand"}})
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
    assert requested_models == ["primary-model", "fallback-model"]


async def test_newspaper_does_not_fall_back_on_bad_request(settings):
    settings.gemini_model = "primary-model"
    settings.gemini_fallback_models = "fallback-model"
    calls = 0

    def handle(request):
        nonlocal calls
        calls += 1
        return httpx.Response(400, json={"error": {"message": "Invalid request"}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(HTTPException):
            await Gemini(settings, client).structured("rules", [{"text": "input"}], {})

    assert calls == 1


async def test_group_transcription_uses_shared_transcriber_with_group_settings(
    settings, monkeypatch
):
    calls = []

    async def transcribe(audio, mime, *, settings):
        calls.append((audio, mime, settings))
        return "A week with family."

    monkeypatch.setattr("app.providers.transcribe_audio", transcribe)
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda r: pytest.fail("Newspaper API must not be used"))
    ) as client:
        assert (
            await Gemini(settings, client).transcribe(b"voice", "audio/webm")
            == "A week with family."
        )
    assert calls == [(b"voice", "audio/webm", settings)]


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


@pytest.mark.parametrize(
    "text",
    [
        'Alex said the garden was "finally finished."',
        "Alex called it “i FINALLY finished my garden”.",
        "No quotes at all.",
    ],
)
def test_quotes_copied_from_own_notes_are_allowed(source, newspaper, text):
    data = copy.deepcopy(newspaper)
    data["member_updates"][0]["text"] = text
    source = {**source, "body": "I finally finished my garden. It's finally finished."}
    validate_attribution(Newspaper.model_validate(data), [source])


@pytest.mark.parametrize(
    "field,text",
    [
        ("story", 'Alex said it was "the best week of my life".'),
        ("headline", 'A "life-changing" garden'),
        ("victory", 'Alex said "I won the lottery".'),
    ],
)
def test_invented_quotes_are_rejected(source, newspaper, field, text):
    data = copy.deepcopy(newspaper)
    if field == "story":
        data["member_updates"][0]["text"] = text
    elif field == "headline":
        data["headline"] = text
    else:
        data["little_victories"] = [
            {"headline": "Win", "text": text, "source_reflection_ids": [SOURCE]}
        ]
    with pytest.raises(ValueError, match="quotation"):
        validate_attribution(Newspaper.model_validate(data), [source])


async def test_one_corrective_retry_then_success(settings, source, newspaper):
    bad = copy.deepcopy(newspaper)
    bad["member_updates"][0]["display_name"] = "Invented Name"
    answers, prompts = [bad, newspaper], []

    def handle(request):
        payload = json.loads(request.content)
        prompts.append([p["text"] for p in payload["contents"][0]["parts"]])
        answer = answers.pop(0)
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(answer)}]}}
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        content = await Gemini(settings, client).newspaper([source])
    assert content.member_updates[0].display_name == "Alex"
    assert len(prompts) == 2 and "rejected" in prompts[1][1]
    assert "contributor name" in prompts[1][1]


async def test_gives_up_after_second_invalid_answer(settings, source, newspaper):
    bad = copy.deepcopy(newspaper)
    bad["member_updates"][0]["source_reflection_ids"] = [MEMBER]

    def handle(request):
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {"finishReason": "STOP", "content": {"parts": [{"text": json.dumps(bad)}]}}
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle)) as client:
        with pytest.raises(ValueError):
            await Gemini(settings, client).newspaper([source])


def test_prompt_length_scales_with_group_size():
    from app.providers import words_per_update

    assert words_per_update(3) == "90-140"
    assert words_per_update(6) == "60-100"
    assert words_per_update(20) == "40-70"


def test_gemini_schema_drops_keywords_gemini_rejects():
    import json as _json

    from app.models import Newspaper, Transcription
    from app.providers import gemini_schema

    for model in (Newspaper, Transcription):
        text = _json.dumps(gemini_schema(model))
        for keyword in ("$ref", "$defs", "maxLength", "minItems", "additionalProperties", "format"):
            assert f'"{keyword}"' not in text, keyword
    schema = gemini_schema(Newspaper)
    story = schema["properties"]["member_updates"]["items"]["properties"]
    assert {"headline", "text", "source_reflection_ids", "user_id", "dateline"} <= story.keys()


def test_email_shows_highlights_not_full_stories(settings, newspaper):
    newspaper["member_updates"][0]["text"] = (
        "Alex finished the garden on Tuesday. The tomatoes went in last, after a long argument."
    )
    newspaper["member_updates"][0]["dateline"] = "Lisbon"
    edition = {"id": EDITION, "group_id": GROUP, "issue_number": 12, "content": newspaper}
    payload = email_payload(settings, {"recipient_email": "r@example.invalid"}, edition, "Fam News")
    assert "Fam News, Issue 12: " in payload["subject"]
    assert "Alex finished the garden on Tuesday." in payload["html"]
    assert "long argument" not in payload["html"] and "long argument" not in payload["text"]
    assert "Alex, Lisbon" in payload["html"]
    assert "<script" not in payload["html"] and "<style" not in payload["html"]
    assert "Read the full issue (sign-in required)" in payload["text"]
