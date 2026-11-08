-- Leave and delete a group. Apply after 0006.
-- The backend calls these with the service role after its own checks; they re-check roles anyway.
begin;

-- Same guard as 0001, plus one escape hatch: delete_group_for() may remove notes from closed weeks
-- of the group it is deleting (it sets app.deleting_group for its own transaction only).
create or replace function public.guard_reflection() returns trigger language plpgsql security definer set search_path='' as $$
declare p public.issue_periods;
begin
  if TG_OP='DELETE' and current_setting('app.deleting_group', true) = old.group_id::text then
    return old;
  end if;
  select * into p from public.issue_periods
    where id = case when TG_OP='DELETE' then old.period_id else new.period_id end for update;
  if p.id is null or p.closed_at is not null or p.deadline_at <= now() then
    raise exception 'Period is closed';
  end if;
  if TG_OP='DELETE' then return old; end if;
  if TG_OP='UPDATE' and (new.id,new.period_id,new.group_id,new.user_id) is distinct from (old.id,old.period_id,old.group_id,old.user_id) then
    raise exception 'Reflection identity cannot change';
  end if;
  new.updated_at := now();
  new.submitted_at := case when new.status='submitted' then now() else null end;
  return new;
end $$;

-- Leave a group. Notes in the still-open week are removed so they don't appear in a paper the
-- person is no longer part of; published issues keep what they already printed.
-- The last organizer can't leave while others remain (they delete the group instead).
create function public.leave_group_for(actor_id uuid, gid uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m public.memberships;
begin
  select * into m from public.memberships where group_id=gid and user_id=actor_id for update;
  if not found then raise exception 'Group not found'; end if;
  if m.role='organizer'
     and not exists(select 1 from public.memberships where group_id=gid and role='organizer' and user_id<>actor_id)
     and exists(select 1 from public.memberships where group_id=gid and user_id<>actor_id) then
    raise exception 'Last organizer cannot leave';
  end if;
  delete from public.reflection_images ri using public.reflections r, public.issue_periods p
    where ri.reflection_id=r.id and r.period_id=p.id and r.group_id=gid and r.user_id=actor_id
      and p.closed_at is null and p.deadline_at > now();
  delete from public.reflections r using public.issue_periods p
    where r.period_id=p.id and r.group_id=gid and r.user_id=actor_id
      and p.closed_at is null and p.deadline_at > now();
  delete from public.memberships where group_id=gid and user_id=actor_id;
  -- Nobody left: remove the empty group entirely.
  if not exists(select 1 from public.memberships where group_id=gid) then
    perform public.delete_group_rows(gid);
  end if;
end $$;

-- Remove a group and everything in it. Internal: callers check permissions first.
create function public.delete_group_rows(gid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform set_config('app.deleting_group', gid::text, true);
  delete from public.email_deliveries where edition_id in (select id from public.editions where group_id=gid);
  delete from public.edition_sources where edition_id in (select id from public.editions where group_id=gid);
  delete from public.editions where group_id=gid;
  delete from public.reflection_images where reflection_id in (select id from public.reflections where group_id=gid);
  delete from public.reflections where group_id=gid;
  delete from public.issue_periods where group_id=gid;
  delete from public.memberships where group_id=gid;
  delete from public.groups where id=gid;
  perform set_config('app.deleting_group', '', true);
end $$;

-- Delete a group for everyone. Organizers only.
create function public.delete_group_for(actor_id uuid, gid uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.memberships where group_id=gid and user_id=actor_id and role='organizer') then
    raise exception 'Organizer required';
  end if;
  perform public.delete_group_rows(gid);
end $$;

revoke all on function public.leave_group_for(uuid, uuid) from public, anon, authenticated;
revoke all on function public.delete_group_rows(uuid) from public, anon, authenticated;
revoke all on function public.delete_group_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.leave_group_for(uuid, uuid) to service_role;
grant execute on function public.delete_group_rows(uuid) to service_role;
grant execute on function public.delete_group_for(uuid, uuid) to service_role;

commit;
