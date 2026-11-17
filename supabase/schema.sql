-- Task board schema for Supabase (Postgres).
-- Run this whole file once in the Supabase SQL editor.
-- Every table is owned per guest user (auth.uid()) and protected by RLS.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 1 and 200),
  description text not null default '',
  status      text not null default 'todo'
              check (status in ('todo', 'in_progress', 'in_review', 'done')),
  priority    text not null default 'normal'
              check (priority in ('low', 'normal', 'high')),
  due_date    date,
  -- Fractional ordering inside a column: a move writes one row, not the column.
  position    double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  color      text not null default '#3B5BDB',
  created_at timestamptz not null default now()
);

create table if not exists public.labels (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  color      text not null default '#3B5BDB',
  created_at timestamptz not null default now()
);

-- A task can have several assignees, so this is a join table rather than a
-- single tasks.assignee_id column.
create table if not exists public.task_assignees (
  task_id   uuid not null references public.tasks (id) on delete cascade,
  member_id uuid not null references public.team_members (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (task_id, member_id)
);

create table if not exists public.task_labels (
  task_id  uuid not null references public.tasks (id) on delete cascade,
  label_id uuid not null references public.labels (id) on delete cascade,
  user_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  primary key (task_id, label_id)
);

create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.task_activity (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists tasks_user_idx          on public.tasks (user_id, status, position);
create index if not exists team_members_user_idx   on public.team_members (user_id);
create index if not exists labels_user_idx         on public.labels (user_id);
create index if not exists task_assignees_user_idx on public.task_assignees (user_id);
create index if not exists task_labels_user_idx    on public.task_labels (user_id);
create index if not exists comments_task_idx       on public.comments (task_id, created_at);
create index if not exists task_activity_task_idx  on public.task_activity (task_id, created_at);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Anonymous (guest) sign-ins get the `authenticated` role with their own
-- auth.uid(), so one policy per table covers them. The `anon` role (no
-- session at all) gets nothing.
-- ---------------------------------------------------------------------------

alter table public.tasks          enable row level security;
alter table public.team_members   enable row level security;
alter table public.labels         enable row level security;
alter table public.task_assignees enable row level security;
alter table public.task_labels    enable row level security;
alter table public.comments       enable row level security;
alter table public.task_activity  enable row level security;

drop policy if exists "own tasks" on public.tasks;
create policy "own tasks" on public.tasks
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own team members" on public.team_members;
create policy "own team members" on public.team_members
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own labels" on public.labels;
create policy "own labels" on public.labels
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Child rows must also point at a parent the same user owns. Foreign keys
-- bypass RLS, so without the EXISTS checks a user who learned another user's
-- task id could attach rows to it.
drop policy if exists "own task assignees" on public.task_assignees;
create policy "own task assignees" on public.task_assignees
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t
                where t.id = task_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.team_members m
                where m.id = member_id and m.user_id = (select auth.uid()))
  );

drop policy if exists "own task labels" on public.task_labels;
create policy "own task labels" on public.task_labels
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t
                where t.id = task_id and t.user_id = (select auth.uid()))
    and exists (select 1 from public.labels l
                where l.id = label_id and l.user_id = (select auth.uid()))
  );

drop policy if exists "own comments" on public.comments;
create policy "own comments" on public.comments
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t
                where t.id = task_id and t.user_id = (select auth.uid()))
  );

drop policy if exists "own task activity" on public.task_activity;
create policy "own task activity" on public.task_activity
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.tasks t
                where t.id = task_id and t.user_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Grants (explicit, so the Data API works regardless of project defaults)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  public.tasks, public.team_members, public.labels, public.task_assignees,
  public.task_labels, public.comments, public.task_activity
to authenticated;

revoke all on
  public.tasks, public.team_members, public.labels, public.task_assignees,
  public.task_labels, public.comments, public.task_activity
from anon;
