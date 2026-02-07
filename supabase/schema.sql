create extension if not exists "pgcrypto";

create type session_status as enum (
  'setup',
  'phase1_open',
  'phase1_closed',
  'phase2_open',
  'phase2_closed',
  'archived'
);

create type app_role as enum ('admin', 'facilitator', 'voter');

create type phase1_vote as enum ('strong_yes', 'yes', 'no');

create type view_mode as enum ('role_list', 'candidate_focus', 'phase2_role_select');

create table if not exists deliberation_sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status session_status not null default 'setup',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references deliberation_sessions(id) on delete cascade,
  name text not null,
  quota integer not null,
  sort_order integer not null default 0
);

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references deliberation_sessions(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  name text not null,
  slide_order integer not null default 0,
  is_active boolean not null default true,
  advanced_to_phase2 boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  app_role app_role not null default 'voter',
  created_at timestamptz not null default now()
);

create table if not exists phase1_votes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references deliberation_sessions(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  user_id uuid not null references user_profiles(id) on delete cascade,
  vote phase1_vote not null,
  updated_at timestamptz not null default now(),
  unique (session_id, candidate_id, user_id)
);

create table if not exists phase2_ballots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references deliberation_sessions(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  user_id uuid not null references user_profiles(id) on delete cascade,
  submitted boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (session_id, role_id, user_id)
);

create table if not exists phase2_selections (
  id uuid primary key default gen_random_uuid(),
  ballot_id uuid not null references phase2_ballots(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  unique (ballot_id, candidate_id)
);

create table if not exists sync_state (
  session_id uuid primary key references deliberation_sessions(id) on delete cascade,
  current_role_id uuid references roles(id) on delete set null,
  current_candidate_id uuid references candidates(id) on delete set null,
  view_mode view_mode,
  updated_by uuid references user_profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_sessions_updated_at
before update on deliberation_sessions
for each row execute function set_updated_at();

create trigger set_candidates_updated_at
before update on candidates
for each row execute function set_updated_at();

create trigger set_phase1_votes_updated_at
before update on phase1_votes
for each row execute function set_updated_at();

create trigger set_phase2_ballots_updated_at
before update on phase2_ballots
for each row execute function set_updated_at();

create trigger set_sync_state_updated_at
before update on sync_state
for each row execute function set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.user_profiles (id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
