import pytest

from app.config import Settings

OWNER = "11111111-1111-4111-8111-111111111111"
MEMBER = "22222222-2222-4222-8222-222222222222"
GROUP = "33333333-3333-4333-8333-333333333333"
PERIOD = "44444444-4444-4444-8444-444444444444"
EDITION = "55555555-5555-4555-8555-555555555555"
SOURCE = "66666666-6666-4666-8666-666666666666"
DELIVERY = "77777777-7777-4777-8777-777777777777"
LEASE = "88888888-8888-4888-8888-888888888888"


@pytest.fixture
def settings():
    return Settings(
        _env_file=None,
        supabase_anon_key="test-public",
        supabase_service_role_key="test-service",
        gemini_api_key="test-gemini",
        resend_api_key="test-resend",
        email_from="Newspaper <news@example.invalid>",
        worker_secret="test-worker",
    )


@pytest.fixture
def source():
    return {
        "edition_id": EDITION,
        "reflection_id": SOURCE,
        "user_id": OWNER,
        "display_name": "Alex",
        "body": "I finished my garden.",
    }


@pytest.fixture
def newspaper():
    return {
        "headline": "A week in the garden",
        "introduction": "Alex shared a garden update.",
        "member_updates": [
            {
                "user_id": OWNER,
                "display_name": "Alex",
                "headline": "Garden finished",
                "text": "Alex finished the garden.",
                "source_reflection_ids": [SOURCE],
                "dateline": None,
            }
        ],
        "little_victories": [],
        "looking_ahead": [],
    }
