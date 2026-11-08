-- Organizer-managed calendar schedules. Apply once after 0007; no existing editions change.
begin;

alter table public.groups
  add column publication_mode text not null default 'weekly'
    check (publication_mode in ('weekly', 'interval')),
  add column publication_weekday integer default 6
    check (publication_weekday between 0 and 6),
  add column publication_interval_days integer
    check (publication_interval_days between 1 and 365),
  add column publication_anchor_date date not null default current_date,
  add constraint groups_publication_schedule_check check (
    (publication_mode='weekly' and publication_weekday is not null and publication_interval_days is null)
    or (publication_mode='interval' and publication_weekday is null and publication_interval_days is not null)
  );

-- A single daily n8n trigger must share one calendar with every group. Personal profile time zones
-- are unrelated and remain unchanged. New groups already default to this zone.
update public.groups set timezone='America/Vancouver',
  publication_anchor_date=(now() at time zone 'America/Vancouver')::date;
alter table public.groups add constraint groups_publication_timezone_check
  check (timezone='America/Vancouver');

-- Monday=0 ... Sunday=6. A Sunday issue closes Saturday at 23:59 in the group zone.
create function public.next_issue_deadline(
  tz text, schedule_mode text, schedule_weekday integer, schedule_interval_days integer,
  anchor_date date, after_at timestamptz
) returns timestamptz language plpgsql stable set search_path='' as $$
declare local_date date; publication_date date; step_days integer; cutoff timestamptz;
begin
  if tz is null or after_at is null or schedule_mode is null then
    raise exception 'Invalid publication schedule';
  end if;
  local_date := (after_at at time zone tz)::date;
  if schedule_mode='weekly' and schedule_weekday between 0 and 6 and schedule_interval_days is null then
    step_days := 7;
    publication_date := local_date + ((schedule_weekday - (extract(isodow from local_date)::integer - 1) + 7) % 7);
  elsif schedule_mode='interval' and schedule_interval_days between 1 and 365
    and schedule_weekday is null and anchor_date is not null then
    step_days := schedule_interval_days;
    publication_date := anchor_date + greatest(1, floor((local_date-anchor_date)::numeric / step_days)::integer) * step_days;
  else
    raise exception 'Invalid publication schedule';
  end if;
  cutoff := ((publication_date-1) + time '23:59') at time zone tz;
  while cutoff <= after_at loop
    publication_date := publication_date + step_days;
    cutoff := ((publication_date-1) + time '23:59') at time zone tz;
  end loop;
  return cutoff;
end $$;

-- Existing create_group/create_group_for callers retain their signatures and get the new default.
create or replace function public.next_weekly_deadline(tz text, after_at timestamptz)
returns timestamptz language sql stable set search_path='' as $$
  select public.next_issue_deadline(tz, 'weekly', 6, null, null, after_at)
$$;

-- Schedule changes and closure lock group then period, so concurrent operations serialize.
create function public.set_publication_schedule(
  actor_id uuid, gid uuid, schedule_mode text, schedule_weekday integer,
  schedule_interval_days integer
) returns setof public.groups language plpgsql security definer set search_path='' as $$
declare g public.groups; p public.issue_periods; anchor date; cutoff timestamptz;
begin
  select * into g from public.groups where id=gid for update;
  if not found or not exists (
    select 1 from public.memberships where group_id=gid and user_id=actor_id and role='organizer'
  ) then raise exception 'Organizer required'; end if;
  select * into p from public.issue_periods where group_id=gid and closed_at is null for update;
  anchor := (now() at time zone g.timezone)::date;
  cutoff := public.next_issue_deadline(g.timezone, schedule_mode, schedule_weekday,
    schedule_interval_days, anchor, greatest(now(), p.starts_at));
  -- Re-saving the same schedule must not reset an interval's anchor or postpone its deadline.
  if (g.publication_mode, g.publication_weekday, g.publication_interval_days)
    is not distinct from (schedule_mode, schedule_weekday, schedule_interval_days) then
    return next g;
    return;
  end if;
  update public.groups set publication_mode=schedule_mode, publication_weekday=schedule_weekday,
    publication_interval_days=schedule_interval_days, publication_anchor_date=anchor where id=gid;
  -- Never reopen an already-due period. Its next period will use the changed schedule.
  if p.id is not null and p.deadline_at > now() then
    update public.issue_periods set deadline_at=cutoff where id=p.id;
  end if;
  return query select * from public.groups where id=gid;
end $$;

create or replace function public.close_issue(gid uuid, expected_period_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare g public.groups; p public.issue_periods; eid uuid; cutoff timestamptz; next_cutoff timestamptz;
begin
  if coalesce(auth.role(),'') <> 'service_role' and not exists (
    select 1 from public.memberships
    where group_id=gid and user_id=public.current_profile_id() and role='organizer'
  ) then raise exception 'Organizer required'; end if;
  select * into g from public.groups where id=gid for update;
  if not found then raise exception 'Group not found'; end if;
  select * into p from public.issue_periods where id=expected_period_id and group_id=gid for update;
  if not found then raise exception 'Period not found'; end if;
  if p.closed_at is not null then
    select id into eid from public.editions where period_id=p.id;
    return eid;
  end if;
  cutoff := least(now(),p.deadline_at);
  update public.issue_periods set closed_at=cutoff where id=p.id;
  if exists(select 1 from public.reflections where period_id=p.id and status='submitted') then
    insert into public.editions(group_id,period_id) values(gid,p.id) returning id into eid;
    insert into public.edition_sources(edition_id,reflection_id,user_id,display_name,body)
      select eid,r.id,r.user_id,u.display_name,r.body from public.reflections r
      join public.profiles u on u.id=r.user_id where r.period_id=p.id and r.status='submitted';
  end if;
  next_cutoff := case when now()<p.deadline_at then p.deadline_at else
    public.next_issue_deadline(g.timezone,g.publication_mode,g.publication_weekday,
      g.publication_interval_days,g.publication_anchor_date,now()) end;
  insert into public.issue_periods(group_id,starts_at,deadline_at) values(gid,cutoff,next_cutoff);
  return eid;
end $$;

-- Move future open weeks to the new Sunday-publication cutoff. Preserve already-due work.
update public.issue_periods p set deadline_at=public.next_issue_deadline(
  g.timezone,g.publication_mode,g.publication_weekday,g.publication_interval_days,
  g.publication_anchor_date,greatest(now(),p.starts_at))
from public.groups g where p.group_id=g.id and p.closed_at is null and p.deadline_at>now();

revoke all on function public.next_issue_deadline(text,text,integer,integer,date,timestamptz),
  public.set_publication_schedule(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.next_issue_deadline(text,text,integer,integer,date,timestamptz),
  public.set_publication_schedule(uuid,uuid,text,integer,integer) to service_role;

notify pgrst, 'reload schema';
commit;
