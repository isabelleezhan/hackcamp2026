-- Required by the FastAPI worker. Safe to apply once after 001_initial.sql.
begin;
alter table public.editions add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz not null default now();
alter table public.email_deliveries add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column next_attempt_at timestamptz not null default now(),
  add column first_attempt_at timestamptz,
  add column payload jsonb;
create index periods_due on public.issue_periods(deadline_at) where closed_at is null;
create index generation_queue on public.editions(next_attempt_at) where status <> 'published';
create index delivery_queue on public.email_deliveries(next_attempt_at) where status in ('pending','failed','sending');

create function public.claim_generation(eid uuid)
returns setof public.editions language sql security definer set search_path='' as $$
  update public.editions set status='generating', lease_token=gen_random_uuid(),
    lease_expires_at=now()+interval '10 minutes', generation_attempts=generation_attempts+1,
    generation_error=null
  where id=eid and next_attempt_at<=now() and
    (status in ('pending','failed') or (status='generating' and lease_expires_at<now()))
  returning *;
$$;

-- Publishing and queueing recipients commit together; subsequent retries never re-enroll recipients.
create function public.finish_generation(eid uuid, token uuid, newspaper jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare gid uuid;
begin
  update public.editions set status='published',content=newspaper,published_at=now(),
    lease_token=null,lease_expires_at=null,generation_error=null
  where id=eid and status='generating' and lease_token=token returning group_id into gid;
  if not found then return false; end if;
  insert into public.email_deliveries(edition_id,user_id,recipient_email)
  select eid,m.user_id,u.email from public.memberships m join auth.users u on u.id=m.user_id
  where m.group_id=gid and m.email_enabled and u.email is not null and u.email_confirmed_at is not null
  on conflict(edition_id,user_id) do nothing;
  return true;
end;
$$;

create function public.claim_delivery(did uuid, envelope jsonb)
returns setof public.email_deliveries language plpgsql security definer set search_path='' as $$
begin
  -- Eligibility is rechecked at send time, including changed email addresses.
  update public.email_deliveries d set status='skipped',last_error='Recipient no longer eligible',
    lease_token=null,lease_expires_at=null
  where d.id=did and (d.status in ('pending','failed') or
    (d.status='sending' and d.lease_expires_at<now())) and not exists(
    select 1 from public.editions e join public.memberships m on m.group_id=e.group_id
    join auth.users u on u.id=m.user_id
    where e.id=d.edition_id and e.status='published' and m.user_id=d.user_id
      and m.email_enabled and u.email=d.recipient_email and u.email_confirmed_at is not null
  );
  -- Resend retains idempotency keys for 24h. Stop automatic retries before that boundary.
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

revoke all on function public.claim_generation(uuid),public.finish_generation(uuid,uuid,jsonb),
  public.claim_delivery(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.claim_generation(uuid),public.finish_generation(uuid,uuid,jsonb),
  public.claim_delivery(uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
