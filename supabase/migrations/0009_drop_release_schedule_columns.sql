-- Clean-up. A parallel schedule design (groups.publish_weekday / publish_hour, from a migration that
-- was later dropped in favour of 0008_publication_schedules) was applied to the live project on
-- November 8, 2026. Nothing reads these columns. Safe to run anywhere: no-op where they don't exist.
begin;

alter table public.groups
  drop column if exists publish_weekday,
  drop column if exists publish_hour;

notify pgrst, 'reload schema';
commit;
