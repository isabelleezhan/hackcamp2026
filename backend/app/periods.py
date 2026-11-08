from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

# Defaults (and the database defaults): Sunday 6 p.m. in the group's time zone.
DEADLINE_WEEKDAY = 6  # Monday=0 ... Sunday=6
DEADLINE_HOUR = 18
DEADLINE_TIME = time(DEADLINE_HOUR, 0)


def next_deadline(
    after: datetime,
    tz_name: str,
    weekday: int = DEADLINE_WEEKDAY,
    hour: int = DEADLINE_HOUR,
) -> datetime:
    """The first `weekday` at `hour`:00 (group-local time) strictly after `after`, in UTC."""
    tz = ZoneInfo(tz_name)
    local = after.astimezone(tz)
    days_ahead = (weekday - local.weekday()) % 7
    candidate = datetime.combine(
        local.date() + timedelta(days=days_ahead), time(hour, 0), tzinfo=tz
    )
    if candidate <= local:
        # Same-tzinfo arithmetic is wall-clock arithmetic, so the hour holds across DST.
        candidate += timedelta(days=7)
    return candidate.astimezone(UTC)


def deadline_after_close(
    current_deadline: datetime,
    now: datetime,
    tz_name: str,
    weekday: int = DEADLINE_WEEKDAY,
    hour: int = DEADLINE_HOUR,
) -> datetime:
    """Manual early closes keep the upcoming scheduled deadline; overdue closes roll forward."""
    if current_deadline > now:
        return current_deadline
    return next_deadline(now, tz_name, weekday, hour)


def schedule_of(group: dict) -> tuple[int, int]:
    """(weekday, hour) for a group row; older schemas without the columns use the defaults."""
    return (
        int(group.get("publish_weekday", DEADLINE_WEEKDAY)),
        int(group.get("publish_hour", DEADLINE_HOUR)),
    )
