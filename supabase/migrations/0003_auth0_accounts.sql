-- Replace Supabase Auth identities with Auth0 while retaining internal UUID user IDs.
-- FastAPI validates Auth0 JWTs and is the only service-role caller of these functions.
begin;

drop trigger if exists on_auth_user_created on auth.users;
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles
  add column auth0_subject text unique,
  add column email text,
  add column email_verified boolean not null default false,
  add column location_mode text not null default 'manual'
    check (location_mode in ('auto','manual')),
  add column city text check (city is null or length(city) between 1 and 120),
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180),
  add column location_updated_at timestamptz,
  add column timezone text,
  add column created_at timestamptz not null default now(),
  add constraint profile_coordinates_together check ((lat is null) = (lng is null)),
  add constraint profile_auth0_subject_length check (
    auth0_subject is null or length(auth0_subject) between 1 and 255
  );
create unique index profiles_email_unique on public.profiles(lower(email)) where email is not null;

create function public.create_group_for(
  actor_id uuid,
  group_name text,
  group_timezone text default 'America/Vancouver'
) returns uuid language plpgsql security definer set search_path='' as $$
declare gid uuid;
begin
  if not exists(select 1 from public.profiles where id=actor_id and auth0_subject is not null)
  then raise exception 'Account required'; end if;
  insert into public.groups(name,timezone,created_by)
    values(trim(group_name),group_timezone,actor_id) returning id into gid;
  insert into public.memberships values(gid,actor_id,'organizer',false);
  insert into public.issue_periods(group_id,deadline_at)
    values(gid,public.next_weekly_deadline(group_timezone,now()));
  return gid;
end $$;

create function public.join_group_for(actor_id uuid, invitation_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare gid uuid;
begin
  if not exists(select 1 from public.profiles where id=actor_id and auth0_subject is not null)
  then raise exception 'Account required'; end if;
  select id into gid from public.groups where join_code=trim(invitation_code);
  if gid is null then raise exception 'Invalid invitation'; end if;
  insert into public.memberships(group_id,user_id) values(gid,actor_id) on conflict do nothing;
  return gid;
end $$;

create function public.set_email_preference_for(actor_id uuid, gid uuid, enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.memberships set email_enabled=enabled
    where group_id=gid and user_id=actor_id;
  if not found then raise exception 'Membership required'; end if;
end $$;

-- Publishing enrolls verified Auth0-backed profiles instead of Supabase Auth users.
create or replace function public.finish_generation(eid uuid, token uuid, newspaper jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare gid uuid;
begin
  update public.editions set status='published',content=newspaper,published_at=now(),
    lease_token=null,lease_expires_at=null,generation_error=null
  where id=eid and status='generating' and lease_token=token returning group_id into gid;
  if not found then return false; end if;
  insert into public.email_deliveries(edition_id,user_id,recipient_email)
  select eid,m.user_id,p.email from public.memberships m
    join public.profiles p on p.id=m.user_id
  where m.group_id=gid and m.email_enabled and p.email is not null and p.email_verified
  on conflict(edition_id,user_id) do nothing;
  return true;
end;
$$;

create or replace function public.claim_delivery(did uuid, envelope jsonb)
returns setof public.email_deliveries language plpgsql security definer set search_path='' as $$
begin
  update public.email_deliveries d set status='skipped',last_error='Recipient no longer eligible',
    lease_token=null,lease_expires_at=null
  where d.id=did and (d.status in ('pending','failed') or
    (d.status='sending' and d.lease_expires_at<now())) and not exists(
    select 1 from public.editions e join public.memberships m on m.group_id=e.group_id
    join public.profiles p on p.id=m.user_id
    where e.id=d.edition_id and e.status='published' and m.user_id=d.user_id
      and m.email_enabled and p.email=d.recipient_email and p.email_verified
  );
  update public.email_deliveries set status='failed',
    last_error='Automatic retries stopped: reconcile with Resend before retrying outside its idempotency window',
    lease_token=null,lease_expires_at=null,next_attempt_at='infinity'::timestamptz
  where id=did and status in ('pending','failed','sending')
    and first_attempt_at<=now()-interval '23 hours'
    and (lease_expires_at is null or lease_expires_at<now());
  return query update public.email_deliveries d set status='sending',
    lease_token=gen_random_uuid(),lease_expires_at=now()+interval '2 minutes',
    first_attempt_at=coalesce(d.first_attempt_at,now()),payload=coalesce(d.payload,envelope),
    attempts=d.attempts+1,last_error=null
  where d.id=did and d.next_attempt_at<=now()
    and (d.first_attempt_at is null or d.first_attempt_at>now()-interval '23 hours')
    and (d.status in ('pending','failed') or (d.status='sending' and d.lease_expires_at<now()))
  returning d.*;
end;
$$;

revoke all on function public.create_group_for(uuid,text,text),
  public.join_group_for(uuid,text),public.set_email_preference_for(uuid,uuid,boolean)
  from public,anon,authenticated;
grant execute on function public.create_group_for(uuid,text,text),
  public.join_group_for(uuid,text),public.set_email_preference_for(uuid,uuid,boolean)
  to service_role;

notify pgrst, 'reload schema';
commit;
