from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

DEADLINE_WEEKDAY = 6  # Publication Sunday (Monday = 0).
DEADLINE_TIME = time(23, 59)


def next_deadline(
    after: datetime,
    tz_name: str,
    *,
    mode: str = "weekly",
    weekday: int = DEADLINE_WEEKDAY,
    interval_days: int = 7,
    anchor_date: date | None = None,
) -> datetime:
    """Next cutoff: 23:59 before a publication date, matching next_issue_deadline in SQL.

    Interval schedules start on anchor_date and first publish N calendar days later.
    Calendar arithmetic keeps the local cutoff fixed across daylight-saving changes.
    """
    if after.tzinfo is None:
        raise ValueError("An aware datetime is required")
    tz = ZoneInfo(tz_name)
    local = after.astimezone(tz)
    if mode == "weekly":
        if not 0 <= weekday <= 6:
            raise ValueError("Weekday must be between 0 and 6")
        publication = local.date() + timedelta(days=(weekday - local.weekday()) % 7)
        step = 7
    elif mode == "interval":
        if not 1 <= interval_days <= 365 or anchor_date is None:
            raise ValueError("Interval requires 1-365 days and an anchor date")
        step = interval_days
        periods = max(1, (local.date() - anchor_date).days // step)
        publication = anchor_date + timedelta(days=periods * step)
    else:
        raise ValueError("Unknown publication schedule")
    candidate = datetime.combine(publication - timedelta(days=1), DEADLINE_TIME, tzinfo=tz)
    while candidate <= after:
        candidate += timedelta(days=step)
    return candidate.astimezone(UTC)


def deadline_after_close(
    current_deadline: datetime, now: datetime, tz_name: str, **schedule
) -> datetime:
    """Manual early closes keep the upcoming scheduled deadline; overdue closes roll forward."""
    if current_deadline > now:
        return current_deadline
    return next_deadline(now, tz_name, **schedule)
