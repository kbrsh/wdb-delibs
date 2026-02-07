alter table deliberation_sessions enable row level security;
alter table roles enable row level security;
alter table candidates enable row level security;
alter table user_profiles enable row level security;
alter table phase1_votes enable row level security;
alter table phase2_ballots enable row level security;
alter table phase2_selections enable row level security;
alter table sync_state enable row level security;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_profiles
    where id = auth.uid() and app_role = 'admin'
  );
$$;

create or replace function is_facilitator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_profiles
    where id = auth.uid() and app_role = 'facilitator'
  );
$$;

create or replace function is_admin_or_facilitator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_profiles
    where id = auth.uid() and app_role in ('admin', 'facilitator')
  );
$$;

drop policy if exists "Sessions readable" on deliberation_sessions;
create policy "Sessions readable" on deliberation_sessions
for select
using (auth.uid() is not null);

drop policy if exists "Sessions admin write" on deliberation_sessions;
create policy "Sessions admin write" on deliberation_sessions
for all
using (is_admin())
with check (is_admin());

drop policy if exists "Roles readable" on roles;
create policy "Roles readable" on roles
for select
using (auth.uid() is not null);

drop policy if exists "Roles admin write" on roles;
create policy "Roles admin write" on roles
for all
using (is_admin())
with check (is_admin());

drop policy if exists "Candidates readable" on candidates;
create policy "Candidates readable" on candidates
for select
using (auth.uid() is not null);

drop policy if exists "Candidates admin write" on candidates;
create policy "Candidates admin write" on candidates
for all
using (is_admin_or_facilitator())
with check (is_admin_or_facilitator());

drop policy if exists "Profiles self read" on user_profiles;
create policy "Profiles self read" on user_profiles
for select
using (id = auth.uid() or is_admin_or_facilitator());

drop policy if exists "Profiles self insert" on user_profiles;
create policy "Profiles self insert" on user_profiles
for insert
with check (id = auth.uid());

drop policy if exists "Profiles self update" on user_profiles;
create policy "Profiles self update" on user_profiles
for update
using (id = auth.uid() or is_admin())
with check (id = auth.uid() or is_admin());

drop policy if exists "Phase1 votes read own" on phase1_votes;
create policy "Phase1 votes read own" on phase1_votes
for select
using (user_id = auth.uid() or is_admin_or_facilitator());

drop policy if exists "Phase1 votes write own" on phase1_votes;
create policy "Phase1 votes write own" on phase1_votes
for insert
with check (user_id = auth.uid());

drop policy if exists "Phase1 votes update own" on phase1_votes;
create policy "Phase1 votes update own" on phase1_votes
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Phase2 ballots read own" on phase2_ballots;
create policy "Phase2 ballots read own" on phase2_ballots
for select
using (user_id = auth.uid() or is_admin_or_facilitator());

drop policy if exists "Phase2 ballots write own" on phase2_ballots;
create policy "Phase2 ballots write own" on phase2_ballots
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from deliberation_sessions
    where deliberation_sessions.id = phase2_ballots.session_id
      and deliberation_sessions.status = 'phase2_open'
  )
);

drop policy if exists "Phase2 ballots update own" on phase2_ballots;
create policy "Phase2 ballots update own" on phase2_ballots
for update
using (
  user_id = auth.uid()
  and exists (
    select 1 from deliberation_sessions
    where deliberation_sessions.id = phase2_ballots.session_id
      and deliberation_sessions.status = 'phase2_open'
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1 from deliberation_sessions
    where deliberation_sessions.id = phase2_ballots.session_id
      and deliberation_sessions.status = 'phase2_open'
  )
);

drop policy if exists "Phase2 selections read own" on phase2_selections;
create policy "Phase2 selections read own" on phase2_selections
for select
using (
  exists (
    select 1 from phase2_ballots
    where phase2_ballots.id = phase2_selections.ballot_id
      and (phase2_ballots.user_id = auth.uid() or is_admin_or_facilitator())
  )
);

drop policy if exists "Phase2 selections write own" on phase2_selections;
create policy "Phase2 selections write own" on phase2_selections
for insert
with check (
  exists (
    select 1 from phase2_ballots
    join deliberation_sessions on deliberation_sessions.id = phase2_ballots.session_id
    where phase2_ballots.id = phase2_selections.ballot_id
      and phase2_ballots.user_id = auth.uid()
      and deliberation_sessions.status = 'phase2_open'
  )
);

drop policy if exists "Phase2 selections delete own" on phase2_selections;
create policy "Phase2 selections delete own" on phase2_selections
for delete
using (
  exists (
    select 1 from phase2_ballots
    join deliberation_sessions on deliberation_sessions.id = phase2_ballots.session_id
    where phase2_ballots.id = phase2_selections.ballot_id
      and phase2_ballots.user_id = auth.uid()
      and deliberation_sessions.status = 'phase2_open'
  )
);

drop policy if exists "Sync readable" on sync_state;
create policy "Sync readable" on sync_state
for select
using (auth.uid() is not null);

drop policy if exists "Sync write" on sync_state;
create policy "Sync write" on sync_state
for all
using (is_admin_or_facilitator())
with check (is_admin_or_facilitator());
