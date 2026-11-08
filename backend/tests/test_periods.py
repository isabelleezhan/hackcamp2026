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


def test_custom_weekday_and_hour():
    zone = ZoneInfo("Europe/London")
    after = datetime(2026, 11, 7, 12, tzinfo=zone)  # Saturday noon
    friday = next_deadline(after, "Europe/London", weekday=4, hour=20).astimezone(zone)
    assert friday == datetime(2026, 11, 13, 20, tzinfo=zone)
    tonight = next_deadline(after, "Europe/London", weekday=5, hour=21).astimezone(zone)
    assert tonight == datetime(2026, 11, 7, 21, tzinfo=zone)


def test_overdue_close_rolls_to_custom_schedule():
    zone = ZoneInfo("America/Vancouver")
    now = datetime(2026, 11, 10, 9, tzinfo=zone)  # Tuesday
    overdue = datetime(2026, 11, 8, 18, tzinfo=zone)
    rolled = deadline_after_close(overdue, now, "America/Vancouver", weekday=2, hour=7)
    assert rolled.astimezone(zone) == datetime(2026, 11, 11, 7, tzinfo=zone)


def test_schedule_of_falls_back_to_sunday_six():
    from app.periods import schedule_of

    assert schedule_of({}) == (6, 18)
    assert schedule_of({"publish_weekday": 2, "publish_hour": 9}) == (2, 9)
