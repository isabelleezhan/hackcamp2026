import logging
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException

from app.config import Settings
from app.periods import deadline_after_close, next_deadline, schedule_of
from app.providers import Gemini, Resend, email_payload
from app.store import Store

logger = logging.getLogger(__name__)


def parse_time(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


async def apply_schedule_after_close(store: Store, group_id: str, closed_deadline: str) -> None:
    """close_issue() opens the next week at Sunday 18:00; move it to the group's own release time.

    Best effort: publishing already succeeded, so a failure here only leaves the default time.
    """
    try:
        groups = await store.rows("groups", admin=True, id=f"eq.{group_id}")
        if not groups:
            return
        weekday, hour = schedule_of(groups[0])
        tz = groups[0]["timezone"]
        target = deadline_after_close(
            parse_time(closed_deadline), datetime.now(UTC), tz, weekday, hour
        )
        open_periods = await store.rows(
            "issue_periods", admin=True, group_id=f"eq.{group_id}", closed_at="is.null"
        )
        for period in open_periods:
            if parse_time(period["deadline_at"]) != target:
                await store.write(
                    "PATCH",
                    "issue_periods",
                    {"deadline_at": target.isoformat()},
                    admin=True,
                    id=f"eq.{period['id']}",
                )
    except Exception:
        logger.warning("Could not apply the release schedule for group %s", group_id)


async def reschedule_open_week(store: Store, group: dict) -> str | None:
    """After a schedule change, the open week closes at the next new release time."""
    weekday, hour = schedule_of(group)
    target = next_deadline(datetime.now(UTC), group["timezone"], weekday, hour)
    open_periods = await store.rows(
        "issue_periods", admin=True, group_id=f"eq.{group['id']}", closed_at="is.null"
    )
    for period in open_periods:
        await store.write(
            "PATCH",
            "issue_periods",
            {"deadline_at": target.isoformat()},
            admin=True,
            id=f"eq.{period['id']}",
        )
    return target.isoformat() if open_periods else None


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
            groups = await self.store.rows(
                "groups", admin=True, id=f"eq.{claim['group_id']}", select="name"
            )
            group_name = groups[0].get("name") if groups else None
            newspaper = await self.gemini.newspaper(sources, group_name=group_name)
            return await self.store.rpc(
                "finish_generation",
                {
                    "eid": edition_id,
                    "token": claim["lease_token"],
                    "newspaper": newspaper.model_dump(mode="json"),
                },
                admin=True,
            )
        except Exception as exc:
            # Persist a safe error without source text or provider response bodies.
            logger.warning("Generation failed for edition %s: %s", edition_id, type(exc).__name__)
            error_message = (
                "Gemini generation timed out. Your notes are saved; try again shortly."
                if isinstance(exc, HTTPException) and exc.status_code == 504
                else "Generation failed validation or provider request; retry scheduled"
            )
            await self.store.write(
                "PATCH",
                "editions",
                {
                    "status": "failed",
                    "generation_error": error_message,
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
        payload = delivery.get("payload")
        if not payload:
            groups = await self.store.rows(
                "groups", admin=True, id=f"eq.{edition[0]['group_id']}", select="name"
            )
            name = groups[0].get("name") if groups else None  # never block an email on this
            payload = email_payload(self.settings, delivery, edition[0], name)
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
                await apply_schedule_after_close(
                    self.store, period["group_id"], period["deadline_at"]
                )
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
