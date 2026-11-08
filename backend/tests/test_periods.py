from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.periods import deadline_after_close, next_deadline


def test_manual_close_keeps_upcoming_cutoff():
    now = datetime(2026, 11, 7, 20, tzinfo=UTC)
    deadline = next_deadline(now, "America/Vancouver")
    assert deadline_after_close(deadline, now, "America/Vancouver") == deadline


def test_sunday_publication_closes_saturday_at_2359():
    zone = ZoneInfo("America/Vancouver")
    now = datetime(2026, 11, 7, 12, tzinfo=zone)
    assert next_deadline(now, zone.key).astimezone(zone) == datetime(
        2026, 11, 7, 23, 59, tzinfo=zone
    )


def test_cutoff_advances_at_exact_deadline():
    zone = ZoneInfo("America/Vancouver")
    cutoff = datetime(2026, 11, 7, 23, 59, tzinfo=zone)
    assert next_deadline(cutoff, zone.key).astimezone(zone) == datetime(
        2026, 11, 14, 23, 59, tzinfo=zone
    )


@pytest.mark.parametrize("weekday", range(7))
def test_all_publication_weekdays(weekday):
    now = datetime(2026, 11, 2, 0, tzinfo=UTC)
    cutoff = next_deadline(now, "UTC", weekday=weekday)
    assert cutoff.hour == 23 and cutoff.minute == 59
    assert (cutoff.weekday() + 1) % 7 == weekday
    assert cutoff > now


def test_two_day_schedule_is_anchored_and_skips_missed_dates():
    now = datetime(2026, 11, 7, 12, tzinfo=UTC)
    schedule = {"mode": "interval", "interval_days": 2, "anchor_date": date(2026, 11, 7)}
    assert next_deadline(now, "UTC", **schedule) == datetime(2026, 11, 8, 23, 59, tzinfo=UTC)
    late = datetime(2026, 11, 12, 0, 1, tzinfo=UTC)
    assert next_deadline(late, "UTC", **schedule) == datetime(2026, 11, 12, 23, 59, tzinfo=UTC)


@pytest.mark.parametrize("month,day", [(3, 7), (10, 31)])
def test_calendar_days_survive_dst(month, day):
    zone = ZoneInfo("America/Vancouver")
    now = datetime(2026, month, day, 12, tzinfo=zone)
    cutoff = next_deadline(now, zone.key, mode="interval", interval_days=2, anchor_date=now.date())
    local = cutoff.astimezone(zone)
    assert local.date() == now.date() + timedelta(days=1)
    assert (local.hour, local.minute) == (23, 59)


def test_daily_schedule_and_non_whole_hour_timezone():
    now = datetime(2026, 11, 7, 12, tzinfo=UTC)
    cutoff = next_deadline(
        now, "Asia/Kolkata", mode="interval", interval_days=1, anchor_date=date(2026, 11, 7)
    )
    assert cutoff == datetime(2026, 11, 7, 18, 29, tzinfo=UTC)


@pytest.mark.parametrize(
    "options",
    [
        {"mode": "hourly"},
        {"weekday": 7},
        {"mode": "interval", "interval_days": 0},
        {"mode": "interval", "interval_days": 366},
    ],
)
def test_invalid_schedules(options):
    with pytest.raises(ValueError):
        next_deadline(datetime(2026, 11, 7, tzinfo=UTC), "UTC", **options)
