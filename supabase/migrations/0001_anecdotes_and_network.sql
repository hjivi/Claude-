-- Migration: Anecdote Bank + Network Bank
-- Run in the Supabase SQL editor. Idempotent: safe to re-run.

-- =========================
-- Shared: updated_at trigger
-- =========================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================
-- Table: anecdotes
-- =========================
create table if not exists public.anecdotes (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  company                text not null default '',
  job_title              text not null default '',
  date_range             text not null default '',
  situation_bullets      text[] not null default '{}',
  task_bullets           text[] not null default '{}',
  action_bullets         text[] not null default '{}',
  result_bullets         text[] not null default '{}',
  long_term_implications text not null default '',
  skill_tags             text[] not null default '{}',
  status                 text not null default 'in_process'
                           check (status in ('in_process', 'approved')),
  conversation_history   jsonb not null default '[]',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.anecdotes enable row level security;

drop policy if exists "Users manage own anecdotes" on public.anecdotes;
create policy "Users manage own anecdotes"
  on public.anecdotes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists anecdotes_updated_at on public.anecdotes;
create trigger anecdotes_updated_at
  before update on public.anecdotes
  for each row execute procedure public.set_updated_at();

create index if not exists anecdotes_user_id_idx       on public.anecdotes (user_id);
create index if not exists anecdotes_user_status_idx   on public.anecdotes (user_id, status);
create index if not exists anecdotes_user_created_idx  on public.anecdotes (user_id, created_at desc);

-- =========================
-- Table: network_contacts
-- =========================
create table if not exists public.network_contacts (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  name               text not null,
  email              text not null default '',
  phone              text not null default '',
  company            text not null,
  connection_source  text not null default ''
                       check (connection_source in
                         ('LinkedIn','Referral','Event','Cold Outreach','Class','Alumni Network','Other','')),
  last_interaction   date,
  discussion_notes   text not null default '',
  created_at         timestamptz not null default now()
);

alter table public.network_contacts enable row level security;

drop policy if exists "Users manage own contacts" on public.network_contacts;
create policy "Users manage own contacts"
  on public.network_contacts for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists network_contacts_user_id_idx        on public.network_contacts (user_id);
create index if not exists network_contacts_user_lastint_idx   on public.network_contacts (user_id, last_interaction desc nulls last);
