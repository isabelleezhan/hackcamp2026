-- Supabase Auth replaces the retired external provider. Apply after 0004.
-- Keep internal profile IDs, memberships, reflections and editions unchanged.
begin;

alter table public.profiles add column supabase_user_id uuid unique
  references auth.users(id) on delete set null;

-- Only a confirmed Supabase identity can claim a legacy profile with the same
-- verified email. Never use client-supplied metadata or email to choose a profile.
create function public.ensure_supabase_profile(auth_user_id uuid)
returns setof public.profiles language plpgsql security definer set search_path='' as $$
declare account auth.users%rowtype; existing public.profiles%rowtype;
begin
  select * into account from auth.users where id=auth_user_id;
  if not found or account.email is null or account.email_confirmed_at is null then
    raise exception 'Verified account required';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(account.email), 0));
  select * into existing from public.profiles where supabase_user_id=account.id for update;
  if not found then
    select * into existing from public.profiles
      where supabase_user_id is null and
        (id=account.id or (email_verified and lower(email)=lower(account.email)))
      for update;
    if found then
      update public.profiles set supabase_user_id=account.id,
        email=lower(account.email), email_verified=true where id=existing.id;
    else
      insert into public.profiles(id,supabase_user_id,email,email_verified,display_name)
      values(account.id,account.id,lower(account.email),true,
        left(coalesce(nullif(trim(account.raw_user_meta_data->>'display_name'),''),split_part(account.email,'@',1)),80));
    end if;
  else
    update public.profiles set email=lower(account.email),email_verified=true where id=existing.id;
  end if;
  return query select * from public.profiles where supabase_user_id=account.id;
end $$;
revoke all on function public.ensure_supabase_profile(uuid) from public, anon, authenticated;
grant execute on function public.ensure_supabase_profile(uuid) to service_role;

-- Resolve RLS and legacy authenticated RPCs through stable internal profile IDs.
create function public.current_profile_id() returns uuid
language sql stable security definer set search_path='' as $$
  select id from public.profiles where supabase_user_id=auth.uid()
$$;
revoke all on function public.current_profile_id() from public, anon;
grant execute on function public.current_profile_id() to authenticated, service_role;

do $$
declare fn record; policy record; definition text; using_sql text; check_sql text;
begin
  for fn in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('is_group_member','create_group','join_group','set_email_preference',
       'guard_reflection','close_issue','create_group_for','join_group_for')
  loop
    definition := pg_get_functiondef(fn.oid);
    definition := replace(definition, 'auth.uid()', 'public.current_profile_id()');
    definition := replace(definition, 'auth0_subject is not null', 'supabase_user_id is not null');
    execute definition;
  end loop;
  for policy in
    select p.*, n.nspname, c.relname from pg_policy p
    join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='public' and c.relname in
      ('profiles','groups','memberships','issue_periods','reflections','editions','edition_sources','email_deliveries'))
      or (n.nspname='storage' and c.relname='objects' and p.polname in ('audio_read','audio_insert'))
  loop
    using_sql := replace(pg_get_expr(policy.polqual,policy.polrelid),'auth.uid()','public.current_profile_id()');
    check_sql := replace(pg_get_expr(policy.polwithcheck,policy.polrelid),'auth.uid()','public.current_profile_id()');
    execute format('alter policy %I on %I.%I%s%s',policy.polname,policy.nspname,policy.relname,
      case when using_sql is null then '' else ' using (' || using_sql || ')' end,
      case when check_sql is null then '' else ' with check (' || check_sql || ')' end);
  end loop;
end $$;

-- Obsolete identity data is no longer used anywhere in the application.
alter table public.profiles drop column auth0_subject;
notify pgrst, 'reload schema';
commit;
