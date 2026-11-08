from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.jobs import Jobs
from app.models import Newspaper
from tests.conftest import DELIVERY, EDITION, LEASE


async def test_unclaimed_generation_never_calls_model(settings):
    store, gemini, resend = AsyncMock(), AsyncMock(), AsyncMock()
    store.rpc.return_value = []
    assert not await Jobs(settings, store, gemini, resend).generate(EDITION)
    gemini.newspaper.assert_not_called()


async def test_successful_generation_commits_with_lease(settings, source, newspaper):
    store, gemini, resend = AsyncMock(), AsyncMock(), AsyncMock()
    store.rpc.side_effect = [[{"lease_token": LEASE, "generation_attempts": 1}], True]
    store.rows.return_value = [source]
    gemini.newspaper.return_value = Newspaper.model_validate(newspaper)
    assert await Jobs(settings, store, gemini, resend).generate(EDITION)
    commit = store.rpc.call_args_list[1]
    assert commit.args[0] == "finish_generation"
    assert commit.args[1]["token"] == LEASE
    assert commit.args[1]["newspaper"] == newspaper


async def test_failed_generation_preserves_sources_and_schedules_retry(settings):
    store, gemini, resend = AsyncMock(), AsyncMock(), AsyncMock()
    store.rpc.return_value = [{"lease_token": LEASE, "generation_attempts": 2}]
    gemini.newspaper.side_effect = ValueError("Private provider content")
    assert not await Jobs(settings, store, gemini, resend).generate(EDITION)
    write = store.write.call_args
    assert write.args[2]["status"] == "failed"
    assert "Private" not in write.args[2]["generation_error"]
    assert write.kwargs["lease_token"] == f"eq.{LEASE}"
    assert "content" not in write.args[2]
    resend.send.assert_not_called()


async def test_timeout_keeps_snapshot_and_records_retryable_failure(settings):
    store, gemini, resend = AsyncMock(), AsyncMock(), AsyncMock()
    store.rpc.return_value = [{"lease_token": LEASE, "generation_attempts": 1}]
    gemini.newspaper.side_effect = HTTPException(504, "Private provider response")
    assert not await Jobs(settings, store, gemini, resend).generate(EDITION)
    write = store.write.call_args
    assert write.args[1] == "editions"
    assert write.args[2]["status"] == "failed"
    assert "timed out" in write.args[2]["generation_error"]
    assert "Private" not in write.args[2]["generation_error"]
    assert write.args[2]["next_attempt_at"]
    assert "content" not in write.args[2]
    assert write.kwargs["lease_token"] == f"eq.{LEASE}"
    resend.send.assert_not_called()


async def test_sent_or_ineligible_delivery_never_calls_provider(settings, newspaper):
    store, gemini, resend = AsyncMock(), AsyncMock(), AsyncMock()
    store.rows.return_value = [
        {"id": EDITION, "group_id": "33333333-3333-4333-8333-333333333333", "content": newspaper}
    ]
    store.rpc.return_value = []
    delivery = {"id": DELIVERY, "edition_id": EDITION, "recipient_email": "reader@example.invalid"}
    assert not await Jobs(settings, store, gemini, resend).deliver(delivery)
    resend.send.assert_not_called()


async def test_delivery_failure_is_separate_from_generation(settings):
    store, gemini, resend = AsyncMock(), AsyncMock(), AsyncMock()
    store.rows.return_value = [{"id": EDITION}]
    delivery = {
        "id": DELIVERY,
        "edition_id": EDITION,
        "payload": {"to": ["reader@example.invalid"]},
    }
    store.rpc.return_value = [{**delivery, "lease_token": LEASE, "attempts": 1}]
    resend.send.side_effect = RuntimeError("Private provider response")
    assert not await Jobs(settings, store, gemini, resend).deliver(delivery)
    assert store.write.call_args.args[1] == "email_deliveries"
    assert store.write.call_args.args[2]["status"] == "failed"
    gemini.newspaper.assert_not_called()


async def test_db_ack_failure_does_not_reset_successful_provider_send(settings):
    store, gemini, resend = AsyncMock(), AsyncMock(), AsyncMock()
    store.rows.return_value = [{"id": EDITION}]
    delivery = {
        "id": DELIVERY,
        "edition_id": EDITION,
        "payload": {"to": ["reader@example.invalid"]},
    }
    store.rpc.return_value = [{**delivery, "lease_token": LEASE, "attempts": 1}]
    resend.send.return_value = "message-id"
    store.write.side_effect = RuntimeError("DB unavailable")
    with pytest.raises(RuntimeError):
        await Jobs(settings, store, gemini, resend).deliver(delivery)
    assert store.write.call_count == 1
    assert store.write.call_args.args[2]["status"] == "sent"
