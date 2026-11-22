# ALUMS MVP: readiness report
_Updated 2026-11-22 · branch `claude/determined-edison-t18uzd` · Verdict: **NOT YET RELEASABLE.** The code is complete for the MVP scope. The database is live on Supabase project `adtwqlhpghmrwyaumcbp`. The signed-in journeys haven't been exercised end-to-end yet._

## Test results
| Area (PRD §11) | Suite | Result |
|---|---|---|
| RLS coverage, grants, anon surface | `supabase/tests/10_rls_coverage` (15) | **PASS** |
| Membership workflow A (verify email → apply → review → approve, invitations, suspension) | `20_membership` (28) | **PASS** |
| Cross-community isolation (members, class admins, institution admins, storage paths) | `30_isolation` (30) | **PASS** |
| Escalation (rank limits, self-assignment, independent approval, SoD, MFA/AAL2, role lapse, immutable audit) | `40_escalation` (35) | **PASS** |
| Privacy (per-field visibility, connections, opt-in location, inference-safe filters, unlisting) | `50_privacy` (18) | **PASS** |
| Businesses, events (capacity, attendance, reminders), announcements, moderation, real metrics | `60_content` (20) | **PASS** |
| Validation, redirect safety, error mapping | `tests/validation` (9) | **PASS** |
| RBAC catalog TS ↔ SQL parity, previews | `tests/catalog-sync`, `tests/rbac` (8) | **PASS** |
| Automation runtime, orchestrator, Supabase handlers | `tests/automation` (10) | **PASS** |
| Responsive (375/1280 px) + WCAG 2.2 AA (axe), light & dark, public pages | `scripts/ui-smoke.mjs` (42) | **PASS** |
| Typecheck / production build | `tsc`, `next build` | **PASS** |
| Live project: 6 migrations + seed applied, 27/27 tables with RLS, 55 policies, bucket present | Management API checks | **PASS** |
| Live anon surface: founding class discoverable; memberships, internal columns and admin RPCs denied | PostgREST probes | **PASS** |
| Live public pages incl. `/community/accounting-class-of-2007`, guards redirect via real `getUser()` | UI smoke against the live backend (42) | **PASS** |
| Live sign-in rejects bad credentials with a generic message | Playwright | **PASS** |
| Supabase security advisor | `/advisors/security` | **PASS**. Only lint 0029 (signed-in users can call SECURITY DEFINER RPCs), 36 notices, which is intended: each RPC authorizes internally |
| Signup → confirm email → apply → approve; password reset; TOTP enrolment | — | **NOT RUN**: creates real users and sends real email on the built-in SMTP (2 emails/hour). Needs your go-ahead or a test inbox |
| Signed-in pages against live data; storage uploads and signed URLs | — | **NOT RUN**: needs a confirmed test account |
| Accessibility of authenticated pages | — | **NOT RUN** (same dependency) |
| Lint | — | **NOT RUN** (ESLint not configured; strict `tsc` only) |
| Load / performance | — | **NOT RUN** |

DB suites run on PostgreSQL 16 with a minimal Supabase `auth`/`storage` stub (`supabase/tests/00_supabase_stub.sql`). They exercise the real migrations, policies and RPCs, but not GoTrue, PostgREST or Storage themselves.

## Operational readiness
| Check | Status |
|---|---|
| Auth | Supabase Auth with email confirmation; middleware calls `getUser()` (server-verified, not a cookie decode) |
| RLS | On every public table (test-enforced); default grants revoked; column-level writes |
| Authorization | Live table checks in SECURITY DEFINER RPCs with pinned `search_path`; no service-role key in the app |
| MFA | AAL2 required for role assignment and revocation, approvals, community and institution changes, and platform settings |
| Audit | Append-only (`UPDATE`/`DELETE`/`TRUNCATE` blocked by triggers), records the real actor |
| Billing protection | N/A: no payments in the MVP |
| Webhooks | None |
| Cron | `private.enqueue_event_reminders()` is idempotent; scheduling is opt-in via pg_cron (`supabase/ops`) |
| Retries | Orchestrator step retries; DB writes are transactional |
| Telemetry / observability | Audit log and notifications only. **Gap:** no error tracking or metrics sink yet |

## Known gaps and decisions needed before launch
1. **GTM blockers:** privacy policy and terms (the footer says they're pending, with no dead links). Email delivery for invitations and notifications: invitations currently produce a one-time link for the leader to share, and notifications are in-app only.
2. **Remaining provisioning:**
   - Done: migrations, seed, email confirmation and TOTP MFA.
   - Still needed in Auth settings: minimum password length 6 → 10 (the app enforces 10), and add `<site>/auth/confirm` plus `http://localhost:3000/**` to the redirect URLs. My API change to these was blocked by session permissions.
   - Set the Site URL once there is a deployed URL.
   - Configure custom SMTP, because the built-in mailer allows 2 emails/hour.
   - Bootstrap two platform-level admins.
   - Set the Vercel env vars.
3. **Founding institution:** still unconfirmed. Once verified, create the institution and link the community. It is never inferred.
4. **Not built (deliberately, so nothing is presented as working):** location *map* (a list plus a country distribution ships instead; a tile provider needs choosing), profile photos (initials are used), welfare/contributions (BRD "later"; only the `finance.manage` permission and the SoD rule exist), mentorship matching (only an "open to mentoring" flag), account deletion and data export, the logo system's nine variations and usage guide (one "Alumni Circle" mark is implemented).
5. **MVP-safe shortcuts and debt:** Performance advisor: 36 unindexed foreign keys (INFO; mostly `*_by` audit columns, so add indexes where joins need them). membership and business approvals don't require AAL2 (only role, approval and platform changes do). Supabase types are handwritten (run `supabase gen types` once a project exists). Directory masking evaluates per row (fine at class scale, revisit at around 10k members per scope). Announcement fan-out is synchronous (move to a queue at scale).
6. **Brand and accessibility reconciliation:** white text on #EA580C is 3.6:1 and fails AA, so filled buttons use #C2410C (orange-700) and #EA580C stays the accent. The supplied landing HTML used #EA580C buttons. The project brief bans glassmorphism and neon, so the UI follows CLAUDE.md rather than those general style preferences.
