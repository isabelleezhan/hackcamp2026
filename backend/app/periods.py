from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

DEADLINE_WEEKDAY = 6  # Sunday
DEADLINE_TIME = time(18, 0)


def next_deadline(after: datetime, tz_name: str) -> datetime:
    """The first Sunday 6 p.m. (group-local time) strictly after `after`, returned in UTC."""
    tz = ZoneInfo(tz_name)
    local = after.astimezone(tz)
    days_ahead = (DEADLINE_WEEKDAY - local.weekday()) % 7
    candidate = datetime.combine(
        local.date() + timedelta(days=days_ahead), DEADLINE_TIME, tzinfo=tz
    )
    if candidate <= local:
        # Same-tzinfo arithmetic is wall-clock arithmetic, so this stays at 18:00 across DST.
        candidate += timedelta(days=7)
    return candidate.astimezone(UTC)


def deadline_after_close(current_deadline: datetime, now: datetime, tz_name: str) -> datetime:
    """Manual early closes keep the upcoming scheduled deadline; overdue closes roll forward."""
    if current_deadline > now:
        return current_deadline
    return next_deadline(now, tz_name)
