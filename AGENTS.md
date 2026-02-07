# AGENTS.md

This file documents work completed so far on the WDB Deliberations Voting App.

## Overview
The app is a Next.js (App Router) project using Tailwind v4, TypeScript, shadcn/ui components, and Supabase for auth, database, and realtime sync.

## Key Features Implemented
- Supabase auth (Google OAuth + magic link) with callback handler.
- Session landing page with role-based redirect (admin/facilitator -> control, voters -> live).
- Live voter view with realtime sync for current candidate and session status.
- Phase 1 voting (Strong Yes / Yes / No) per candidate.
- Phase 2 ballot view with quota enforcement and submit/unsubmit.
- Facilitator/Admin control room (phase controls, sync controls, Phase 1 aggregates, Phase 2 results).
- Admin screenshare dashboard (Phase 1 + Phase 2 summaries).
- Supabase schema + RLS SQL files.
- Realtime resubscribe on tab focus/visibility for the live view to prevent stale sockets.

## Supabase Schema & RLS
Files:
- `supabase/schema.sql`
- `supabase/rls.sql`

Schema includes:
- `deliberation_sessions`
- `roles`
- `candidates`
- `user_profiles`
- `phase1_votes`
- `phase2_ballots`
- `phase2_selections`
- `sync_state`

Notes:
- Trigger `public.handle_new_user` inserts into `user_profiles` on new `auth.users`.
- RLS policies restrict writes to admins/facilitators and limit voters to their own ballots/votes.
- Role check functions (`is_admin`, `is_facilitator`, `is_admin_or_facilitator`) are `SECURITY DEFINER`.

## Realtime
- Live view subscribes to `sync_state` and `deliberation_sessions` for candidate pointer and phase status.
- Added resume logic to re-subscribe and re-fetch state on visibility/focus.
- Supabase Realtime publication must include:
  - `public.sync_state`
  - `public.deliberation_sessions`

SQL to enable:
```
alter publication supabase_realtime add table public.sync_state;
alter publication supabase_realtime add table public.deliberation_sessions;
```

## Auth Flow
- `/login`: Google OAuth and magic link.
- `/auth/callback`: exchanges code for session and redirects to `/`.
- `/`: session list with role-based auto-redirect if only one session.

## Pages
- `/login` – login screen.
- `/` – session list (auto-redirect by role if only one session).
- `/session/[sessionId]/live` – voter live screen (sync + phase 1 voting).
- `/session/[sessionId]/phase2/[roleId]` – phase 2 ballot UI.
- `/session/[sessionId]/control` – admin/facilitator controls.
- `/session/[sessionId]/dashboard` – screenshare dashboard.

## UI
- Official shadcn/ui components are used. Install via:
```
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add badge
npx shadcn@latest add input
npx shadcn@latest add label
npx shadcn@latest add textarea
npx shadcn@latest add checkbox
npx shadcn@latest add table
```

## Environment
- `.env.example`:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Files Added / Updated (high level)
- Supabase:
  - `lib/supabase/server.ts`
  - `lib/supabase/browser.ts`
  - `middleware.ts`
- Pages:
  - `app/login/page.tsx`
  - `app/page.tsx`
  - `app/session/[sessionId]/live/page.tsx`
  - `app/session/[sessionId]/phase2/[roleId]/page.tsx`
  - `app/session/[sessionId]/control/page.tsx`
  - `app/session/[sessionId]/dashboard/page.tsx`
- Components:
  - `components/auth/login-panel.tsx`
  - `components/auth/sign-out-button.tsx`
  - `components/live/live-client.tsx`
  - `components/phase2/phase2-ballot.tsx`
  - `components/control/control-panel.tsx`
- SQL:
  - `supabase/schema.sql`
  - `supabase/rls.sql`

## Known Setup Steps
1. Run SQL from `supabase/schema.sql` and `supabase/rls.sql`.
2. Ensure your user exists in `user_profiles` and is `admin` (magic-link users may need manual insert).
3. Enable Realtime for `sync_state` and `deliberation_sessions`.
4. Add candidates + roles for a session.

