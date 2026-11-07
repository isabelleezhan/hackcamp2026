-- Verifies 0004_notes_location.sql. Run after all migrations; everything is rolled back.
begin;
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAILED: %', message; end if; end $$;
create temporary table t(owner_id uuid default gen_random_uuid(), member_id uuid default gen_random_uuid(), gid uuid, pid uuid, eid uuid, code text);
insert into t default values;
insert into public.profiles(id, display_name, auth0_subject, email, email_verified)
  select owner_id, 'Ana', 'auth0|notes-owner-' || owner_id, 'o-' || owner_id || '@example.invalid', true from t
  union all select member_id, 'Bea', 'auth0|notes-member-' || member_id, 'm-' || member_id || '@example.invalid', true from t;

update t set gid = public.create_group_for(owner_id, 'Notes group', 'America/Vancouver');
update t set code = g.join_code from public.groups g where g.id = t.gid;
update t set pid = p.id from public.issue_periods p where p.group_id = t.gid and p.closed_at is null;
select pg_temp.assert_ok((select code ~ '^[2-9A-HJKMNP-Z]{8}$' from t), 'new groups get an 8-character join code');

-- profile location (rounded only)
update public.profiles set location_mode = 'auto', city = 'Vancouver', lat = 49.3, lng = -123.1, timezone = 'America/Vancouver', location_updated_at = now() where id = (select owner_id from t);
select pg_temp.assert_ok((select city = 'Vancouver' from public.profiles where id = (select owner_id from t)), 'member can set rounded location');
do $$ begin begin update public.profiles set lat = 49.2827, lng = -123.1207 where id = (select owner_id from t); raise exception 'FAILED precise coordinates accepted'; exception when check_violation then null; end; end $$;
do $$ begin begin update public.profiles set lat = 49.3, lng = null where id = (select owner_id from t); raise exception 'FAILED lat without lng accepted'; exception when check_violation then null; end; end $$;

-- many notes per week, server-set recorded_at
insert into public.reflections(group_id, period_id, user_id, body, status, city, lat, lng, recorded_at)
  select gid, pid, owner_id, 'Monday: rode to the mailbox.', 'submitted', 'Vancouver', 49.3, -123.1, '2000-01-01' from t;
insert into public.reflections(group_id, period_id, user_id, body, status, audio_path, audio_duration_seconds, city)
  select gid, pid, owner_id, repeat('a', 3500), 'submitted', gid || '/' || owner_id || '/x.webm', 170, 'Kamloops' from t;
select pg_temp.assert_ok((select count(*) = 2 from public.reflections where user_id = (select owner_id from t)), 'two notes in one week');
select pg_temp.assert_ok((select bool_and(recorded_at > now() - interval '1 minute') from public.reflections), 'recorded_at is set by the server');
do $$ begin begin insert into public.reflections(group_id, period_id, user_id, body, status) select gid, pid, owner_id, repeat('a', 2001), 'submitted' from t; raise exception 'FAILED long typed note accepted'; exception when check_violation then null; end; end $$;
do $$ begin begin insert into public.reflections(group_id, period_id, user_id, body, status, audio_path, audio_duration_seconds) select gid, pid, owner_id, 'x', 'submitted', gid || '/' || owner_id || '/y.webm', 181 from t; raise exception 'FAILED 181 s accepted'; exception when check_violation then null; end; end $$;

-- weekly limits
insert into public.reflections(group_id, period_id, user_id, body, status) select gid, pid, owner_id, 'note ' || i, 'draft' from t, generate_series(1, 28) i;
do $$ begin begin insert into public.reflections(group_id, period_id, user_id, body, status) select gid, pid, owner_id, 'note 31', 'draft' from t; raise exception 'FAILED 31st note accepted'; exception when raise_exception then if SQLERRM <> 'Weekly note limit reached' then raise; end if; end; end $$;
delete from public.reflections where user_id = (select owner_id from t) and body like 'note %';
do $$ begin begin insert into public.reflections(group_id, period_id, user_id, body, status, audio_path, audio_duration_seconds) select gid, pid, owner_id, 'x', 'submitted', gid || '/' || owner_id || '/' || i || '.webm', 180 from t, generate_series(1, 10) i; raise exception 'FAILED over 30 minutes accepted'; exception when raise_exception then if SQLERRM <> 'Weekly audio limit reached' then raise; end if; end; end $$;

-- privacy before publishing
select public.join_group_for(member_id, code) from t;
insert into public.reflections(group_id, period_id, user_id, body, status, city) select gid, pid, member_id, 'London rain again.', 'submitted', 'London' from t;
select pg_temp.assert_ok((select count(*) = 1 from public.reflections), 'members see only their own notes before publishing');
select pg_temp.assert_ok((select count(*) = 2 from public.period_note_counts_for((select member_id from t), (select gid from t), (select pid from t))), 'counts visible for members');
select pg_temp.assert_ok((select notes = 2 and audio_seconds = 170 from public.period_note_counts_for((select member_id from t), (select gid from t), (select pid from t)) c join t on c.user_id = t.owner_id), 'counts are correct');
select pg_temp.assert_ok((select city = 'Vancouver' from public.profiles p join t on p.id = t.owner_id), 'members can see each other''s city');

-- publish: snapshot carries datelines, issue number assigned
update t set eid = public.close_issue(gid, pid);
select pg_temp.assert_ok((select count(*) = 3 from public.edition_sources), 'every note snapshotted');
select pg_temp.assert_ok((select count(*) = 3 from public.edition_sources where city is not null and recorded_at is not null), 'snapshot carries city and recorded_at');
select pg_temp.assert_ok((select issue_number = 1 from public.editions), 'first edition is issue 1');
select pg_temp.assert_ok((select count(*) = 3 from public.edition_sources), 'members read everyone''s notes after publishing');
select pg_temp.assert_ok((select count(*) = 0 from public.period_note_counts_for((select member_id from t), (select gid from t), (select owner_id from t))), 'counts reveal nothing for unknown periods');

-- second issue gets number 2
update t set pid = p.id from public.issue_periods p where p.group_id = t.gid and p.closed_at is null;
insert into public.reflections(group_id, period_id, user_id, body, status) select gid, pid, owner_id, 'Week two.', 'submitted' from t;
select public.close_issue(gid, pid) from t;
select pg_temp.assert_ok((select max(issue_number) = 2 from public.editions), 'second edition is issue 2');

-- outsiders still see nothing
select pg_temp.assert_ok((select count(*) = 0 from public.period_note_counts_for('00000000-0000-0000-0000-000000000099', (select gid from t), (select pid from t))), 'outsider gets no counts');
select 'PASS: many notes per week, 180 s audio, 4,000-char transcripts, rounded locations, server recorded_at, weekly limits, private notes until publish, counts, datelines in snapshot, issue numbers, short join codes. Test data rolled back.' as verification;
rollback;
