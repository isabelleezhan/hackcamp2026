-- Profile photos. Apply after 0005. Photos live in a private bucket; the backend checks group
-- membership and hands out short-lived signed URLs, so only people who share a group see them.
begin;

alter table public.profiles
  add column if not exists avatar_path text
  check (avatar_path is null or avatar_path like id::text || '/%');

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- No storage policies: clients never read or write this bucket directly (service role only).

commit;
