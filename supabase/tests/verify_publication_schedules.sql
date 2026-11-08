-- Run after 0008. Everything is rolled back; no generation or email is triggered.
begin;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
declare
  owner_id uuid := gen_random_uuid(); member_id uuid := gen_random_uuid();
  gid uuid := gen_random_uuid(); pid uuid; eid uuid; old_anchor date; old_deadline timestamptz;
  actual timestamptz; weekday integer;
begin
  actual := public.next_issue_deadline('America/Vancouver','weekly',6,null,null,'2026-11-07 12:00-08');
  assert actual = '2026-11-07 23:59-08'::timestamptz, 'Sunday closes Saturday at 23:59';
  assert public.next_issue_deadline('America/Vancouver','weekly',6,null,null,actual)
    = '2026-11-14 23:59-08'::timestamptz, 'Exact cutoff advances to next publication';
  for weekday in 0..6 loop
    actual := public.next_issue_deadline('UTC','weekly',weekday,null,null,'2026-11-02 00:00Z');
    assert ((extract(isodow from actual at time zone 'UTC')::integer) % 7)=weekday,
      'Every weekday maps to the preceding closing day';
  end loop;
  assert public.next_issue_deadline('UTC','interval',null,2,'2026-11-07','2026-11-07 12:00Z')
    = '2026-11-08 23:59Z'::timestamptz, 'Every two calendar days';
  assert public.next_issue_deadline('UTC','interval',null,2,'2026-11-07','2026-11-12 00:01Z')
    = '2026-11-12 23:59Z'::timestamptz, 'Missed runs retain interval anchor';
  assert public.next_issue_deadline('America/Vancouver','interval',null,2,'2026-03-07','2026-03-07 12:00-08')
    = '2026-03-08 23:59-07'::timestamptz, 'Spring DST preserves calendar days';
  assert public.next_issue_deadline('America/Vancouver','interval',null,2,'2026-10-31','2026-10-31 12:00-07')
    = '2026-11-01 23:59-08'::timestamptz, 'Fall DST preserves calendar days';
  assert public.next_issue_deadline('Asia/Kolkata','interval',null,1,'2026-11-07','2026-11-07 12:00Z')
    = '2026-11-07 18:29Z'::timestamptz, 'Non-whole-hour timezone';

  insert into public.profiles(id,display_name,email,email_verified)
    values(owner_id,'Schedule owner',owner_id::text || '@example.invalid',true),
          (member_id,'Schedule member',member_id::text || '@example.invalid',true);
  insert into public.groups(id,name,created_by) values(gid,'Schedule test',owner_id);
  assert (select timezone='America/Vancouver' from public.groups where id=gid), 'One fixed publication timezone';
  begin
    update public.groups set timezone='Europe/London' where id=gid;
    raise exception 'Expected fixed timezone constraint';
  exception when check_violation then null;
  end;
  insert into public.memberships(group_id,user_id,role) values(gid,owner_id,'organizer'),(gid,member_id,'member');
  insert into public.issue_periods(group_id,deadline_at)
    values(gid,public.next_weekly_deadline('America/Vancouver',now())) returning id into pid;
  begin
    perform public.set_publication_schedule(member_id,gid,'interval',null,2);
    raise exception 'Expected organizer check';
  exception when raise_exception then
    if sqlerrm <> 'Organizer required' then raise; end if;
  end;
  perform public.set_publication_schedule(owner_id,gid,'interval',null,2);
  select publication_anchor_date into old_anchor from public.groups where id=gid;
  select deadline_at into old_deadline from public.issue_periods where id=pid;
  assert old_deadline=public.next_issue_deadline('America/Vancouver','interval',null,2,old_anchor,now()),
    'Saving updates the open deadline';
  perform public.set_publication_schedule(owner_id,gid,'interval',null,2);
  assert (select deadline_at=old_deadline from public.issue_periods where id=pid), 'Unchanged save is idempotent';

  -- Manual early publication creates one next period with the same upcoming cutoff.
  insert into public.reflections(group_id,period_id,user_id,body,status)
    values(gid,pid,owner_id,'I cooked a new recipe.','submitted');
  eid := public.close_issue(gid,pid);
  assert eid is not null, 'Submitted notes create an edition';
  assert public.close_issue(gid,pid)=eid, 'Repeated close returns the same edition';
  assert (select count(*)=1 from public.editions where group_id=gid), 'No duplicate edition';
  assert (select deadline_at=old_deadline from public.issue_periods where group_id=gid and closed_at is null),
    'Early close keeps the cutoff';
  assert (select count(*)=1 from public.edition_sources where edition_id=eid), 'Snapshot retained';

  select id into pid from public.issue_periods where group_id=gid and closed_at is null;
  update public.issue_periods set starts_at=now()-interval '2 days',deadline_at=now()-interval '1 minute' where id=pid;
  perform public.set_publication_schedule(owner_id,gid,'weekly',2,null);
  assert (select deadline_at=now()-interval '1 minute' from public.issue_periods where id=pid),
    'Saving a new schedule never reopens overdue notes';
  assert public.close_issue(gid,pid) is null, 'Empty due period produces no edition';
  assert (select deadline_at=public.next_issue_deadline('America/Vancouver','weekly',2,null,null,now())
    from public.issue_periods where group_id=gid and closed_at is null), 'New period uses updated schedule';
  assert not has_function_privilege('authenticated','public.set_publication_schedule(uuid,uuid,text,integer,integer)','execute'),
    'Members cannot call privileged schedule RPC directly';
end $$;
rollback;
select 'PASS: publication dates, DST, organizer access, atomic schedule updates, early/overdue closure and snapshots.' as verification;
