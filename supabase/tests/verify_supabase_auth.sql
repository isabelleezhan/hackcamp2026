-- Run after migration 0005. All test data is rolled back.
begin;
create function pg_temp.assert_ok(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',message; end if; end $$;
create temporary table t(legacy uuid default gen_random_uuid(), account uuid default gen_random_uuid(),
  outsider uuid default gen_random_uuid(), unverified uuid default gen_random_uuid(), gid uuid);
insert into t default values;
insert into public.profiles(id,display_name,email,email_verified)
  select legacy,'Existing member','migration-' || legacy || '@example.invalid',true from t;
insert into public.groups(name,created_by) select 'Preserved group',legacy from t;
update t set gid=g.id from public.groups g where g.created_by=t.legacy;
insert into public.memberships(group_id,user_id,role) select gid,legacy,'organizer' from t;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select account,'migration-' || legacy || '@example.invalid',now(),'{}'::jsonb from t
  union all select outsider,'new-' || outsider || '@example.invalid',now(),'{}'::jsonb from t
  union all select unverified,'unverified-' || unverified || '@example.invalid',null,'{}'::jsonb from t;
select pg_temp.assert_ok((select p.id=t.legacy from t cross join lateral public.ensure_supabase_profile(t.account) p), 'verified email preserves profile ID');
select pg_temp.assert_ok((select count(*)=1 from public.ensure_supabase_profile((select account from t))), 'repeated provisioning is idempotent');
select pg_temp.assert_ok((select p.id=t.outsider from t cross join lateral public.ensure_supabase_profile(t.outsider) p), 'new account gets a profile');
do $$ begin
  begin perform public.ensure_supabase_profile((select unverified from t));
    raise exception 'FAILED: unverified account accepted';
  exception when raise_exception then if SQLERRM <> 'Verified account required' then raise; end if; end;
end $$;
grant select on t to authenticated;
select set_config('request.jwt.claim.sub',account::text,true) from t;
set local role authenticated;
select pg_temp.assert_ok(public.current_profile_id()=(select legacy from t), 'auth UUID maps to stable profile ID');
select pg_temp.assert_ok(exists(select 1 from public.groups where id=(select gid from t)), 'legacy membership visible through RLS');
select pg_temp.assert_ok(public.create_group('Supabase account group') is not null, 'authenticated group creation uses mapped ID');
do $$ begin
  begin perform public.ensure_supabase_profile((select outsider from t));
    raise exception 'FAILED: user provisioned another account';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',outsider::text,true) from t;
set local role authenticated;
select pg_temp.assert_ok(not exists(select 1 from public.groups where id=(select gid from t)), 'outsider cannot read legacy group');
reset role;
select pg_temp.assert_ok(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='auth0_subject'), 'retired identity column removed');
rollback;
