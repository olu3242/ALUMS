# ALUMS
**Your Class. Your People. Your Network.** — a reusable, multi-community alumni platform. Founding MVP: **Accounting — Class of 2007** (institution pending confirmation; never invented).

Next.js 15 (App Router) · TypeScript · Tailwind · Supabase (Auth, Postgres, Storage) · Zod · Vitest · Playwright/axe · Vercel.

## Architecture in one screen
- **Authorization lives in Postgres.** Every exposed table has RLS; least-privilege column grants; privileged writes go through `SECURITY DEFINER` RPCs that re-check permissions live from `role_assignments` (never JWT claims or user metadata), validate state, write an append-only audit event and notify. The app uses only the user's session — **no service-role key anywhere**.
- **Scoped RBAC:** platform ⊇ institution ⊇ community. Rank-bounded assignment (only below your rank, never yourself), independent approval for critical/financial roles (requester and nominee can't approve), separation of duties (Class Admin ≠ Class Treasurer), community roles lapse with membership, AAL2 (MFA) for privileged mutations.
- **Privacy:** base `profiles`/`locations` are self-only; others read masked data through RPCs that apply per-field visibility (Everyone / Verified class members / Approved connections / Only me). Filters run on masked values so hidden fields can't be inferred. Locations are country/city opt-in with recorded consent; no addresses are stored.
- **Tenancy:** one account, many verified communities. The selected class is a cookie preference re-validated against live memberships each request.
- **Automation layer:** `automation/workflow-os` (Workflows A–E) → `runtime` (permission pre-check, audit, BLOCKED on missing handlers) → `orchestrator` (approval gates, retries). `createSupabaseHandlers()` binds steps to the same RPCs the UI uses.

```
app/(site)      public: / about discover class-of community/[slug] sign-in register invite/[token] …
app/app         member portal: dashboard my-classes profile alumni businesses locations events gallery announcements notifications settings
app/admin       control center: dashboard approvals members communities institutions roles permissions moderation security audit-logs settings
lib/            session + scope context, server actions, Zod schemas, RBAC catalog mirror
supabase/       migrations (0100 foundation → 0500), seed (founding class), ops scripts, SQL test suites
automation/     workflow definitions, runtime, orchestrator, Supabase handlers
```

## Run locally
```bash
npm install
cp .env.example .env.local   # fill NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```
Behind an HTTPS proxy (some sandboxes/CI), Node's `fetch` ignores `HTTPS_PROXY`; use `NODE_USE_ENV_PROXY=1` (`npm run start:proxy`). Not needed on Vercel.

Without Supabase env vars the public site renders and every data surface shows an explicit "backend not connected" state — never sample data.

**Database:** apply `supabase/migrations/*` in order (`supabase db push`, or the SQL editor), then `supabase/seed.sql`. In Supabase Auth: enable email confirmations and TOTP MFA; add `<site>/auth/confirm` to redirect URLs. Bootstrap the first Super Admin once with `supabase/ops/bootstrap-super-admin.sql` (Super Admin is not assignable in-app). Bootstrap **two** platform-level people so independent approvals are possible. Optionally schedule reminders with `supabase/ops/schedule-event-reminders.sql` (pg_cron).

## Test
| Command | What |
|---|---|
| `npm test` | Vitest: validation, RBAC mirror ↔ SQL drift, automation runtime/orchestrator/Supabase handlers |
| `npm run test:db` | Applies all migrations to a throwaway Postgres (or `$DATABASE_URL`) with a Supabase auth/storage stub and runs the RLS / isolation / escalation / privacy / workflow suites |
| `node scripts/load-institution-directory.mjs --out <dir>` | Builds the worldwide institution directory upsert SQL (Hipo upstream + `data/institutions/curated.json`); apply files in order |
| `npm run build && npm run test:ui` | Playwright: public pages at 375px & 1280px, light & dark — no horizontal overflow, zero axe WCAG 2.2 AA violations; protected routes never render data |

See `docs/READINESS.md` for the current PASS / FAIL / BLOCKED / NOT RUN report.

## Brand tokens
Navy #10243A · Orange #EA580C (accent; filled controls use #C2410C so white text passes AA) · Gold #D8AD58 · Champagne #F2DCA5 · Ivory #FAF8F3 · Ink #1E293B. Green is semantic-only (verified/approved).
