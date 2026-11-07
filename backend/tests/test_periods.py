from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.periods import deadline_after_close, next_deadline


def test_manual_close_keeps_upcoming_cutoff():
    now = datetime(2026, 11, 7, 20, tzinfo=UTC)
    deadline = next_deadline(now, "America/Vancouver")
    assert deadline_after_close(deadline, now, "America/Vancouver") == deadline


def test_sunday_cutoff_advances_at_exact_deadline():
    zone = ZoneInfo("America/Vancouver")
    cutoff = datetime(2026, 11, 8, 18, tzinfo=zone)
    following = next_deadline(cutoff, "America/Vancouver").astimezone(zone)
    assert following == datetime(2026, 11, 15, 18, tzinfo=zone)
