# Relay — Kanban task board

A drag-and-drop task board built for the Next Play Games software development
internship assessment. React + TypeScript on the front, Supabase (Postgres,
anonymous auth, Row Level Security) behind it. No custom server.

## What it does

**Core**

- Four columns: To Do, In Progress, In Review, Done
- Drag cards between columns and reorder them inside a column (mouse, touch, keyboard)
- Create tasks with title, description, priority, due date, assignees and labels
- Automatic guest account on first visit (Supabase anonymous sign-in); every row is scoped to that guest by RLS
- Loading skeleton, per-column empty states, inline form errors, and a full-page error with retry

**Advanced features**

| Feature | How it works |
| --- | --- |
| Team members and assignees | Add people (name + colour) from the Team menu or any assignee picker. A task can have several assignees (`task_assignees` join table); avatars show on the card. |
| Comments | Open a task to write comments. Stored in `comments`, shown oldest first with relative timestamps. |
| Activity log | Status moves, renames, priority, due date, assignee and label changes are written to `task_activity` and shown as a timeline in the task panel. |
| Labels | Create coloured labels, attach several to a task, filter the board by label chips. |
| Due date indicators | Cards show "2 days overdue" (red), "Due today" / "Due tomorrow" (amber) or the date. Done tasks never count as overdue. |
| Search and filtering | Search by title; filter by priority, assignee (including Unassigned) and label. Column headers show "2 of 5" while a filter is on. |
| Board summary | Header shows total, done (with %) and overdue, plus a bar with one segment per column sized by task count. |

## Stack

- React 19, TypeScript, Vite
- [`@dnd-kit`](https://dndkit.com) for drag and drop
- `@supabase/supabase-js` called directly from the browser
- Hand-written CSS with design tokens (`src/styles.css`); fonts self-hosted via Fontsource

## Run it locally

Requires Node 20+.

```bash
npm install
cp .env.example .env      # then fill in the two values below
npm run dev
```

`.env`:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<public anon / publishable key>
```

Without a `.env` the app starts in **local demo mode**: same UI, data kept in
`localStorage`, clearly tagged "Local demo" in the header. Useful for a quick
look at the interface; the deployed app uses Supabase.

### Supabase setup

1. Create a free project at supabase.com.
2. SQL Editor → paste all of [`supabase/schema.sql`](supabase/schema.sql) → Run. It is safe to re-run.
3. Authentication → Sign In / Providers → turn on **Allow anonymous sign-ins**.
4. Project Settings → API → copy the project URL and the **anon (publishable)** key into `.env`.

Never use the `service_role` key in this app. Only the public key is needed,
and `.env` is git-ignored.

### Deploy (Vercel)

Import the GitHub repo in Vercel (framework preset: Vite), add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables, deploy.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Typecheck, then production build to `dist/` |
| `npm run test:rls` | Runs `supabase/schema.sql` in an in-process Postgres (PGlite) and checks 22 isolation and constraint cases: user B cannot read, update, delete, comment on, label or assign user A's tasks |

## Database

Full schema with policies: [`supabase/schema.sql`](supabase/schema.sql).

| Table | Purpose |
| --- | --- |
| `tasks` | id, user_id, title, description, status, priority, due_date, position, created_at, updated_at |
| `team_members` | People the guest has added (name, colour) |
| `labels` | Custom labels (name, colour) |
| `task_assignees` | task ↔ member (many-to-many) |
| `task_labels` | task ↔ label (many-to-many) |
| `comments` | Comments on a task |
| `task_activity` | Change history (`kind` + `detail` jsonb) |

Security model:

- RLS is enabled on every table. One policy per table: `user_id = auth.uid()` for both reads and writes, granted to `authenticated` only (anonymous sign-ins get that role with their own uid). The `anon` role has no access.
- `user_id` defaults to `auth.uid()`, so the client never sends it.
- Child tables (`task_assignees`, `task_labels`, `comments`, `task_activity`) also check that the parent task/member/label belongs to the same user. Foreign keys bypass RLS, so without this a user who learned someone else's task id could attach rows to it.
- `status`, `priority` and text lengths are enforced with `CHECK` constraints, not just in the UI.

## Code layout

```
src/
  lib/
    backend.ts          Persistence interface the UI depends on
    supabaseBackend.ts  Supabase implementation (the only file that talks to Supabase)
    localBackend.ts     localStorage implementation for demo mode
    types.ts, util.ts, toast.ts
  hooks/useBoard.ts     Board state + optimistic writes with rollback
  components/
    Board.tsx           Columns, cards, drag and drop
    TopBar.tsx          Summary, search, filters, team
    TaskDialog.tsx      Create task
    TaskDrawer.tsx      Task detail: edit, comments, activity
    ui.tsx              Avatar, popover, modal, pickers, toasts, icons
supabase/schema.sql
scripts/test-rls.mjs
```

## Design decisions

- **Fractional `position`** for ordering: dropping a card writes one row (the midpoint between its neighbours) instead of renumbering the column.
- **Optimistic updates with rollback**: a drop or edit shows immediately; if Supabase rejects it the change is reverted and a toast says why.
- **Join table for assignees** rather than a single `assignee_id`, because the brief asks for one or more assignees per task.
- **One persistence interface, two implementations**: components never import Supabase, which keeps the data calls in one reviewable file and makes a custom API a drop-in swap.
- **Native `<dialog>`** for the create modal and detail panel: focus trapping, Esc and backdrop come from the browser.
- **Status marks are progress pies** (empty, half, three-quarters, full), so columns are distinguishable without relying on colour.

## Tradeoffs and what I'd do next

- The activity log is written by the client after each successful change. Database triggers would make it tamper-proof and atomic with the change; I kept it client-side so messages can carry display names without extra joins.
- No realtime sync: a second tab of the same guest sees changes after a refresh. Supabase Realtime on `tasks` would fix that.
- A guest session lives in the browser's storage. Clearing storage means a new guest and an empty board; linking the anonymous user to an email (Supabase supports upgrading anonymous users) would make boards recoverable.
- Repeated midpoint drops in the same gap eventually exhaust float precision (dozens of consecutive drops in one spot); a periodic re-spacing of the column would cover it.
- Automated tests cover the database rules only. Next would be component tests for drag-and-drop and the optimistic rollback paths.
- Light theme only; no comment editing or deletion; filters are not saved in the URL.
