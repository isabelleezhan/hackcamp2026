begin;
create function pg_temp.assert_ok(ok boolean,message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',message; end if; end $$;
create temporary table job_test(owner_id uuid default gen_random_uuid(),member_id uuid default gen_random_uuid(),gid uuid,pid uuid,eid uuid,lease uuid,old_lease uuid,did uuid);
insert into job_test default values;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select owner_id,'worker-owner-'||owner_id||'@example.invalid',now(),'{"display_name":"Owner"}'::jsonb from job_test
union all select member_id,'worker-member-'||member_id||'@example.invalid',now(),'{"display_name":"Member"}'::jsonb from job_test;
select set_config('request.jwt.claim.sub',owner_id::text,true),set_config('request.jwt.claim.role','authenticated',true) from job_test;
update job_test set gid=public.create_group('Worker verification');
insert into public.memberships(group_id,user_id) select gid,member_id from job_test;
update public.memberships set email_enabled=true where user_id=(select owner_id from job_test);
update job_test t set pid=p.id from public.issue_periods p where p.group_id=t.gid;
insert into public.reflections(group_id,period_id,user_id,body,status)
select gid,pid,owner_id,'Finished a garden.','submitted' from job_test
union all select gid,pid,member_id,'Looking forward to a visit.','submitted' from job_test;
update job_test set eid=public.close_issue(gid,pid);
update job_test t set lease=c.lease_token from public.claim_generation((select eid from job_test)) c;
select pg_temp.assert_ok((select lease is not null from job_test),'first worker claimed generation');
select pg_temp.assert_ok((select count(*)=0 from public.claim_generation((select eid from job_test))),'second worker cannot claim active generation');
update job_test set old_lease=lease;
update public.editions set lease_expires_at=now()-interval '1 second' where id=(select eid from job_test);
update job_test t set lease=c.lease_token from public.claim_generation((select eid from job_test)) c;
select pg_temp.assert_ok((select lease<>old_lease from job_test),'expired generation lease reclaimed');
select pg_temp.assert_ok((select not public.finish_generation(eid,old_lease,'{"headline":"stale"}') from job_test),'stale worker cannot publish');
select pg_temp.assert_ok((select public.finish_generation(eid,lease,'{"headline":"verified"}') from job_test),'current worker publishes');
select pg_temp.assert_ok((select count(*)=1 from public.email_deliveries where edition_id=(select eid from job_test)),'only opted-in member queued');
select pg_temp.assert_ok((select not public.finish_generation(eid,lease,'{"headline":"duplicate"}') from job_test),'repeated completion cannot republish');
update job_test set did=(select id from public.email_deliveries where edition_id=job_test.eid);
update job_test t set lease=c.lease_token from public.claim_delivery((select did from job_test),'{"subject":"original"}') c;
select pg_temp.assert_ok((select count(*)=0 from public.claim_delivery((select did from job_test),'{"subject":"duplicate"}')),'second sender cannot claim live delivery');
update public.email_deliveries set lease_expires_at=now()-interval '1 second' where id=(select did from job_test);
update job_test t set lease=c.lease_token from public.claim_delivery((select did from job_test),'{"subject":"changed"}') c;
select pg_temp.assert_ok((select payload->>'subject'='original' and attempts=2 from public.email_deliveries where id=(select did from job_test)),'retry retains identical email payload');
update public.email_deliveries set status='sent',lease_token=null,lease_expires_at=null where id=(select did from job_test);
select pg_temp.assert_ok((select count(*)=0 from public.claim_delivery((select did from job_test),'{}')),'sent delivery never reclaimed');
update public.email_deliveries set status='pending' where id=(select did from job_test);
update public.memberships set email_enabled=false where user_id=(select owner_id from job_test);
select pg_temp.assert_ok((select count(*)=0 from public.claim_delivery((select did from job_test),'{}')),'opt-out prevents queued delivery');
select pg_temp.assert_ok((select status='skipped' from public.email_deliveries where id=(select did from job_test)),'ineligible delivery marked skipped');
update public.memberships set email_enabled=true where user_id=(select owner_id from job_test);
update public.email_deliveries set status='failed',first_attempt_at=now()-interval '24 hours' where id=(select did from job_test);
select pg_temp.assert_ok((select count(*)=0 from public.claim_delivery((select did from job_test),'{}')),'no retry beyond provider idempotency window');
select pg_temp.assert_ok((select next_attempt_at='infinity'::timestamptz and last_error like 'Automatic retries stopped:%' from public.email_deliveries where id=(select did from job_test)),'late uncertain delivery requires reconciliation');
select pg_temp.assert_ok(not has_function_privilege('authenticated','public.claim_generation(uuid)','execute'),'members cannot claim worker jobs');
select pg_temp.assert_ok(not has_function_privilege('anon','public.claim_delivery(uuid,jsonb)','execute'),'anonymous callers cannot claim email jobs');
rollback;
select 'PASS: exclusive job claims, stale-lease recovery, stale-worker fencing, atomic publication/opt-in queue, immutable email retries, sent-email protection, opt-out recheck, retry-window limit and worker permissions. Test data rolled back.' as verification;
