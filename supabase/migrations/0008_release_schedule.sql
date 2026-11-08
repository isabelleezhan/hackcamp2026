-- Per-newsletter release day and time. Apply after 0007.
-- Weekday uses Monday=0 ... Sunday=6 (Python's convention); the hour is in the group's time zone.
-- The defaults keep today's behaviour (Sunday 18:00). The backend applies the schedule to the open
-- week when it changes and to each new week after a close; close_issue() itself is unchanged.
begin;

alter table public.groups
  add column if not exists publish_weekday smallint not null default 6 check (publish_weekday between 0 and 6),
  add column if not exists publish_hour smallint not null default 18 check (publish_hour between 0 and 23);

commit;
