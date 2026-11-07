-- Community Newspaper schema.
-- Run this in the Supabase dashboard SQL editor (or `supabase db push`).
-- The FastAPI backend uses the service-role key (which bypasses RLS) and enforces
-- membership checks itself. RLS is enabled with NO policies so the browser's anon key
-- cannot read these tables directly; all data access goes through the backend.
--
-- Idempotency without transactions (supabase-py has none):
--   * close a period with `update ... where id = :id and status = 'open'` and treat
--     zero returned rows as "already closed";
--   * editions.period_id is UNIQUE, so a second publish of the same period fails to insert;
--   * email_deliveries (edition_id, user_id) is UNIQUE, so recipients are recorded once;
--     only send rows whose status is 'pending' or 'failed'.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  join_code text not null unique,
  timezone text not null default 'America/Vancouver',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('organizer', 'member')),
  email_opt_in boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index on public.memberships (user_id);

create table public.issue_periods (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  number int not null,
  starts_at timestamptz not null,
  deadline_at timestamptz not null,
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  unique (group_id, number)
);
-- Exactly one open period per group.
create unique index one_open_period_per_group on public.issue_periods (group_id) where status = 'open';
create index on public.issue_periods (status, deadline_at);

create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.issue_periods (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  prompt text,
  audio_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_id, user_id)
);

create table public.editions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  period_id uuid not null unique references public.issue_periods (id) on delete cascade,
  issue_number int not null,
  status text not null default 'generating' check (status in ('generating', 'published', 'failed')),
  content jsonb,
  source_snapshot jsonb not null,
  error text,
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create index on public.editions (group_id, issue_number desc);

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_id text,
  error text,
  attempts int not null default 0,
  sent_at timestamptz,
  unique (edition_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.memberships enable row level security;
alter table public.issue_periods enable row level security;
alter table public.reflections enable row level security;
alter table public.editions enable row level security;
alter table public.email_deliveries enable row level security;

-- Private bucket for audio reflections (backend uploads with the service role key).
insert into storage.buckets (id, name, public)
values ('reflection-audio', 'reflection-audio', false)
on conflict (id) do nothing;
