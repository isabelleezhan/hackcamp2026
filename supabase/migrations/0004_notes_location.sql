-- 0004: align the live schema with AGENTS.md. Apply once, after 0003_auth0_accounts.sql.
--
--  1. Many notes (reflections) per person per week instead of one.
--  2. Voice notes up to 180 s; transcripts of voice notes up to 4,000 characters.
--  3. Approximate location and time zone on profiles; where/when each note was recorded.
--     Coordinates must be rounded to 1 decimal (~10 km); the database rejects anything finer.
--  4. Datelines: the edition snapshot copies each note's city and recorded_at (by trigger,
--     so close_issue() is unchanged).
--  5. Weekly limit per person: 30 notes and 1,800 s of audio.
--  6. Notes stay private to their author until the week closes (others read the snapshot);
--     a counts-only function lets the globe show "3 notes this week".
--  7. Voice clips are readable only by their author.
--  8. Short, typeable 8-character join codes for new groups (existing codes keep working).
--  9. Issue numbers on editions for the masthead.
begin;

-- 1. Many notes per week ----------------------------------------------------------------
alter table public.reflections drop constraint reflections_period_id_user_id_key;
create index reflections_period_user on public.reflections (period_id, user_id);

-- 2. Longer voice notes and transcripts -------------------------------------------------
alter table public.reflections drop constraint reflections_audio_duration_seconds_check;
alter table public.reflections add constraint reflections_audio_duration_seconds_check
  check (audio_duration_seconds > 0 and audio_duration_seconds <= 180);
alter table public.reflections drop constraint reflections_body_check;
alter table public.reflections add constraint reflections_body_check
  check (length(body) <= case when audio_path is null then 2000 else 4000 end);

-- 3. Location -----------------------------------------------------------------------------
-- Profile location columns were added by 0003_auth0_accounts.sql. Tighten their validation.
alter table public.profiles drop constraint if exists profiles_lat_check;
alter table public.profiles drop constraint if exists profiles_lng_check;
alter table public.profiles add constraint profiles_lat_check
  check (lat between -90 and 90 and lat = round(lat::numeric, 1)::double precision);
alter table public.profiles add constraint profiles_lng_check
  check (lng between -180 and 180 and lng = round(lng::numeric, 1)::double precision);

alter table public.reflections
  add column recorded_at timestamptz not null default now(),
  add column city text check (city is null or length(trim(city)) between 1 and 120),
  add column lat double precision check (lat between -90 and 90 and lat = round(lat::numeric, 1)::double precision),
  add column lng double precision check (lng between -180 and 180 and lng = round(lng::numeric, 1)::double precision),
  add constraint reflections_lat_lng_together check ((lat is null) = (lng is null));

-- 4. Datelines in the snapshot ----------------------------------------------------------------
-- close_issue() inserts the first five columns positionally; these new columns are filled here.
alter table public.edition_sources add column city text, add column recorded_at timestamptz;
create function public.fill_edition_source() returns trigger language plpgsql security definer set search_path='' as $$
begin
  select r.city, r.recorded_at into new.city, new.recorded_at from public.reflections r where r.id = new.reflection_id;
  return new;
end $$;
create trigger fill_edition_source before insert on public.edition_sources
  for each row execute function public.fill_edition_source();

-- 5. Weekly limits + server-controlled recorded_at ----------------------------------------
-- Runs after guard_reflection (triggers fire alphabetically), which has already locked the
-- period row, so concurrent inserts for the same week are serialized.
create function public.reflection_limits() returns trigger language plpgsql security definer set search_path='' as $$
declare note_count int; audio_total numeric;
begin
  if TG_OP = 'INSERT' then new.recorded_at := now(); else new.recorded_at := old.recorded_at; end if;
  select count(*), coalesce(sum(audio_duration_seconds), 0) into note_count, audio_total
    from public.reflections where period_id = new.period_id and user_id = new.user_id and id <> new.id;
  if TG_OP = 'INSERT' and note_count >= 30 then raise exception 'Weekly note limit reached'; end if;
  if audio_total + coalesce(new.audio_duration_seconds, 0) > 1800 then raise exception 'Weekly audio limit reached'; end if;
  return new;
end $$;
create trigger reflection_limits before insert or update on public.reflections
  for each row execute function public.reflection_limits();

-- 6. Notes private until published --------------------------------------------------------
drop policy reflection_read on public.reflections;
create policy reflection_read on public.reflections for select to authenticated
  using (user_id = auth.uid() and public.is_group_member(group_id));

create function public.period_note_counts_for(actor_id uuid, gid uuid, pid uuid)
returns table (user_id uuid, notes bigint, audio_seconds numeric)
language sql stable security definer set search_path='' as $$
  select r.user_id, count(*), coalesce(sum(r.audio_duration_seconds), 0)
  from public.reflections r
  where r.group_id = gid and r.period_id = pid and r.status = 'submitted'
    and exists (select 1 from public.memberships m where m.group_id = gid and m.user_id = actor_id)
  group by r.user_id
$$;

-- 7. Voice clips readable only by their author ------------------------------------------
drop policy audio_read on storage.objects;
create policy audio_read on storage.objects for select to authenticated
  using (bucket_id = 'reflection-audio'
    and split_part(name, '/', 2) = auth.uid()::text
    and exists (select 1 from public.memberships m where m.group_id::text = split_part(name, '/', 1) and m.user_id = auth.uid()));

-- 8. Short join codes (no 0/O, 1/I/L) --------------------------------------------------------
create function public.new_join_code() returns text language sql volatile set search_path='' as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ', 1 + get_byte(r.b, i) % 31, 1), '' order by i)
  from (select extensions.gen_random_bytes(8) as b) r, generate_series(0, 7) as i
$$;
alter table public.groups alter column join_code set default public.new_join_code();

-- 9. Issue numbers ----------------------------------------------------------------------------
alter table public.editions add column issue_number int;
update public.editions e set issue_number = s.n
  from (select id, row_number() over (partition by group_id order by created_at, id) as n from public.editions) s
  where s.id = e.id;
create function public.number_edition() returns trigger language plpgsql security definer set search_path='' as $$
begin
  new.issue_number := coalesce((select max(issue_number) from public.editions where group_id = new.group_id), 0) + 1;
  return new;
end $$;
create trigger number_edition before insert on public.editions
  for each row execute function public.number_edition();
alter table public.editions alter column issue_number set not null;
create unique index editions_group_issue on public.editions (group_id, issue_number);

-- Grants ------------------------------------------------------------------------------------------
revoke all on function public.fill_edition_source(), public.reflection_limits(), public.period_note_counts_for(uuid, uuid, uuid),
  public.new_join_code(), public.number_edition() from public, anon, authenticated;
grant execute on function public.period_note_counts_for(uuid, uuid, uuid) to service_role;

notify pgrst, 'reload schema';
commit;
