import logging
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from app.config import Settings
from app.providers import Gemini, Resend, email_payload
from app.store import Store

logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def retry_at(attempts: int) -> str:
    return (
        datetime.now(UTC) + timedelta(seconds=min(3600, 30 * 2 ** min(attempts, 7)))
    ).isoformat()


class Jobs:
    def __init__(self, settings: Settings, store: Store, gemini: Gemini, resend: Resend):
        self.settings, self.store, self.gemini, self.resend = settings, store, gemini, resend

    async def generate(self, edition_id: str) -> bool:
        claims = await self.store.rpc("claim_generation", {"eid": edition_id}, admin=True)
        if not claims:
            return False
        claim = claims[0]
        try:
            sources = await self.store.rows(
                "edition_sources", admin=True, edition_id=f"eq.{edition_id}"
            )
            newspaper = await self.gemini.newspaper(sources)
            return await self.store.rpc(
                "finish_generation",
                {
                    "eid": edition_id,
                    "token": claim["lease_token"],
                    "newspaper": newspaper.model_dump(mode="json"),
                },
                admin=True,
            )
        except Exception:
            # Persist a safe error without source text or provider response bodies.
            logger.warning("Generation failed for edition %s", edition_id)
            await self.store.write(
                "PATCH",
                "editions",
                {
                    "status": "failed",
                    "generation_error": "Generation failed validation or provider request; retry scheduled",
                    "next_attempt_at": retry_at(claim["generation_attempts"]),
                    "lease_token": None,
                    "lease_expires_at": None,
                },
                admin=True,
                id=f"eq.{edition_id}",
                lease_token=f"eq.{claim['lease_token']}",
            )
            return False

    async def deliver(self, delivery: dict) -> bool:
        if not self.settings.resend_api_key.get_secret_value() or not self.settings.email_from:
            return False
        edition = await self.store.rows(
            "editions", admin=True, id=f"eq.{delivery['edition_id']}", status="eq.published"
        )
        if not edition:
            return False
        payload = delivery.get("payload") or email_payload(self.settings, delivery, edition[0])
        claims = await self.store.rpc(
            "claim_delivery", {"did": delivery["id"], "envelope": payload}, admin=True
        )
        if not claims:
            return False
        claim = claims[0]
        try:
            message_id = await self.resend.send(claim["id"], claim["payload"])
        except Exception:
            logger.warning("Email provider request failed for delivery %s", claim["id"])
            await self.store.write(
                "PATCH",
                "email_deliveries",
                {
                    "status": "failed",
                    "last_error": "Provider acceptance unconfirmed; retry uses the same idempotency key",
                    "next_attempt_at": retry_at(claim["attempts"]),
                    "lease_token": None,
                    "lease_expires_at": None,
                },
                admin=True,
                id=f"eq.{claim['id']}",
                lease_token=f"eq.{claim['lease_token']}",
            )
            return False
        # A failed DB acknowledgement must leave the lease in place; a later retry reuses the key.
        rows = await self.store.write(
            "PATCH",
            "email_deliveries",
            {
                "status": "sent",
                "provider_message_id": message_id,
                "sent_at": now_iso(),
                "lease_token": None,
                "lease_expires_at": None,
                "last_error": None,
            },
            admin=True,
            id=f"eq.{claim['id']}",
            lease_token=f"eq.{claim['lease_token']}",
        )
        return bool(rows)

    async def process_edition(self, edition_id: str) -> None:
        """Best-effort request acceleration; n8n tick is the durable recovery path."""
        try:
            await self.generate(edition_id)
            deliveries = await self.store.rows(
                "email_deliveries",
                admin=True,
                edition_id=f"eq.{edition_id}",
                status="in.(pending,failed)",
                limit="100",
            )
            for delivery in deliveries:
                await self.deliver(delivery)
        except Exception:
            logger.warning(
                "Edition processing interrupted for %s; scheduled worker will resume", edition_id
            )

    async def tick(self, batch_size: int) -> dict:
        report = {"closed": 0, "generated": 0, "sent": 0, "errors": 0}
        due = await self.store.rows(
            "issue_periods",
            admin=True,
            closed_at="is.null",
            deadline_at=f"lte.{now_iso()}",
            order="deadline_at.asc",
            limit=str(batch_size),
        )
        for period in due:
            try:
                await self.store.rpc(
                    "close_issue",
                    {
                        "gid": period["group_id"],
                        "expected_period_id": period["id"],
                    },
                    admin=True,
                )
                report["closed"] += 1
            except HTTPException:
                report["errors"] += 1
        editions = await self.store.rows(
            "editions",
            admin=True,
            next_attempt_at=f"lte.{now_iso()}",
            order="next_attempt_at.asc",
            limit=str(batch_size),
            **{
                "or": f"(status.in.(pending,failed),and(status.eq.generating,lease_expires_at.lt.{now_iso()}))"
            },
        )
        for edition in editions:
            try:
                report["generated"] += bool(await self.generate(edition["id"]))
            except HTTPException:
                report["errors"] += 1
        deliveries = await self.store.rows(
            "email_deliveries",
            admin=True,
            next_attempt_at=f"lte.{now_iso()}",
            order="next_attempt_at.asc",
            limit=str(batch_size),
            **{
                "or": f"(status.in.(pending,failed),and(status.eq.sending,lease_expires_at.lt.{now_iso()}))"
            },
        )
        for delivery in deliveries:
            try:
                report["sent"] += bool(await self.deliver(delivery))
            except HTTPException:
                report["errors"] += 1
        return report
