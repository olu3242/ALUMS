# ALUMS MVP: readiness report
_Updated 2026-11-22. Production: **https://alums-one.vercel.app** (Vercel project `alums`, team Eduradius LLC) on Supabase project `adtwqlhpghmrwyaumcbp`._
_Verdict: **LIVE FOR PILOT, NOT READY FOR PUBLIC LAUNCH.** Signed-in journeys haven't been exercised end-to-end against production, and the email, legal and admin bootstrap items below are still open._

## Environments
| Item | State |
|---|---|
| Vercel | Git-linked to `olu3242/ALUMS`. `main` deploys to production and PRs get preview deployments. Production is public (Vercel Authentication turned off for production by decision); member data is protected in-app. |
| Vercel env | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (all environments), `NEXT_PUBLIC_SITE_URL` (production). There is no service-role key anywhere. |
| Supabase schema | Migrations `0100`–`0770` applied. `pg_cron` job `alums-automations` runs every 15 minutes. Migration history matches `supabase/migrations/` file versions exactly. |
| Supabase data | Founding class seed. Institution directory: 10,277 entries across 201 countries, including 139 Nigerian. |
| Supabase Auth | Email confirmation on. TOTP MFA on. Site URL `https://alums-one.vercel.app`. Redirect URLs: prod domain and `http://localhost:3000/**`. Minimum password length 10. |
| Integrations | GitHub Actions CI (`verify`) and Supabase Preview check, both required to be green before merging. |

## Test results
| Area (PRD §11) | Suite | Result |
|---|---|---|
| RLS coverage, grants, anon surface | `supabase/tests/10_rls_coverage` (15) | **PASS** |
| Membership workflow A (apply → review → approve, invitations, suspension) | `20_membership` (28) | **PASS** |
| Cross-community isolation (members, class/institution admins, storage paths) | `30_isolation` (30) | **PASS** |
| Escalation (rank limits, self-assignment, independent approval, SoD, AAL2, role lapse, immutable audit) | `40_escalation` (35) | **PASS** |
| Privacy (per-field visibility, connections, opt-in location, inference-safe filters) | `50_privacy` (18) | **PASS** |
| Businesses, events, announcements, moderation, real metrics | `60_content` (20) | **PASS** |
| Institution directory (lookup, ranking, Nigeria coverage, write protection, official-name enforcement) | `70_directory` (18) | **PASS** |
| Institution branding/network (scoped to own institution, storage folder scoping, public vs alumni-only posts) and dues (MFA, SoD, independent confirmation, void, real totals, cross-class isolation) | `80_institution_dues` (33) | **PASS** |
| Full directory load (10k rows, idempotent re-run) | one-off local run | **PASS** |
| Affiliations (independent MFA approval, governance granted/withdrawn, duplicate-class guard, either side can end) and invitation codes (permissions, auto-verify vs review, single-use, expiry, revocation, brute-force throttling) | `90_affiliations_invites` (37) | **PASS** |
| Workflow OS (A–E advance from real activity, gates wait, actors recorded, visibility) and scheduled automations (exactly-once reminders, paid members skipped, failure isolation, on-demand runs) | `95_workflows_automations` (28) | **PASS** |
| Class dashboard header (community.manage only, own-class cover folder, object must exist, audited, anon can't read cover path) | `96_community_header` (11) | **PASS** |
| Platform CRED (institution/community edit + safe delete, MFA, rank limits, member removal reversible, account list/suspend platform-only, sessions revoked, audit) | `97_platform_crud` (27) | **PASS** |
| Class editing via institution lookup (official directory name, unverified creation by platform admins only, reuse/no duplicates, detach, institution admins can't move classes) | `98_edit_community_lookup` (12) | **PASS** |
| Class modules on/off (default on, MFA, platform locks, class isolation, no direct writes), invitation list/revoke, admin feature summary (real counts, admin-only) | `99_features_invitations` (21) | **PASS** |
| Validation, redirect safety, error mapping, RBAC TS↔SQL parity, workflow definitions↔SQL parity, handler coverage for every step, runtime waiting/denied/gates, brand contrast, money parsing | Vitest (40) | **PASS** |
| Production automation cycle: all 7 jobs | `private.run_all_automations()` | **PASS** (all succeeded) |
| Responsive + WCAG 2.2 AA (axe), light/dark, public pages incl. `/join/[code]`, open lookup listbox + keyboard, feature carousel with motion on | `scripts/ui-smoke.mjs` (52) | **PASS** (local, against the live DB) |
| CI on Postgres 17, `tsc`, `next build`, Supabase Preview | GitHub checks | **PASS** |
| Production: routes, 404s, auth guards, security headers, live DB data | HTTP probes | **PASS** |
| Production: sign-in rejects bad credentials | Playwright | **PASS** |
| Supabase security advisor | `/advisors/security` | **PASS with 1 open item.** Lint 0029 (signed-in users can call SECURITY DEFINER RPCs) is intended: each RPC authorizes internally. **Open:** leaked-password protection is off (Auth setting; turn it on in Supabase → Authentication). |
| Signup → confirm email → apply → approve; password reset; TOTP enrolment (production) | — | **NOT RUN**: creates real users and sends real email; waiting on custom SMTP and a test inbox |
| Signed-in pages against live data (incl. admin Accounts/Content and edit/delete forms, axe on admin pages); storage uploads and signed URLs | — | **NOT RUN**: needs a confirmed test account |
| Lint | — | **NOT RUN** (ESLint not configured; strict `tsc` only) |
| Load / performance | — | **NOT RUN** |

## Operational readiness
| Check | Status |
|---|---|
| Auth | Supabase Auth with email confirmation; middleware uses server-verified `getUser()` |
| Authorization | RLS on every table (test-enforced); live permission checks in SECURITY DEFINER RPCs with pinned `search_path` |
| MFA | AAL2 required for role assignment and revocation, approvals, community and institution changes, and platform settings |
| Audit | Append-only (UPDATE, DELETE and TRUNCATE are blocked), records the real actor |
| Public reference data | The directory lookup is anon-readable; the API route is edge-cached for 1 hour; queries need at least 2 characters and are capped at 25 results |
| Cron | pg_cron runs `private.run_all_automations()` every 15 minutes (7 idempotent jobs, each logged in `automation_runs`; failures are isolated). Admin → Automations shows runs and has a "Run now" button. |
| Observability | Audit log, notifications, Vercel runtime logs. **Gap:** no error-tracking or metrics sink |
| Billing protection | N/A: no payments in the MVP |

## Launch blockers
1. **Email:** custom SMTP is configured (Gmail), but Gmail rejects the saved app password with `535 BadCredentials`, so no email can be sent. Fix the app password; branded templates and a 30/hour limit are already in place.
2. **First admins:** two founders sign up, then run `supabase/ops/bootstrap-super-admin.sql`. Independent approvals need two platform-level people.
3. **Legal:** privacy policy and terms (the footer says they're pending, with no dead links).
4. **Founding institution:** still unconfirmed. Once verified, add it from the directory and link the community. It is never inferred.
5. **End-to-end run** of the signed-in journeys on production (see NOT RUN above).

## Institution directory
- **Sources:**
  - Hipo `university-domains-list`, fetched at load time and not vendored. The upstream repo has no license file; its README invites free use.
  - The ALUMS-curated `data/institutions/curated.json`: 24 Nigerian additions plus 4 corrections of misspelled or outdated upstream names.
- **Refresh:** run `node scripts/load-institution-directory.mjs --out <dir>`, then apply the files in order (`999_prune.sql` last).
- **Known gaps:**
  - Nigerian coverage is now 139 entries, but many state polytechnics and colleges of education are still missing.
  - Nicknames (e.g. "Legon", "UNILAG") don't match.
  - Typed names outside the directory still work for search and requests.
  - Before adding any curated entry, verify it against NUC/NBTE lists.
- **Separation:** directory entries are reference data. An institution is verified only through `create_institution` (MFA, audited), which keeps a `directory_id` link.

## Membership dues and institution network (MVP scope)
- **Dues are recorded, not processed.**
  - Class Treasurers (`finance.manage`) publish plans with payment instructions and an optional external payment link, e.g. a Paystack page.
  - Members submit "I've paid" notices, and treasurers confirm them.
  - All financial actions need AAL2 and are audited. Nobody can confirm, record or void their own payment.
  - Class Admins get read-only totals (`finance.view`).
  - Card payment processing and webhooks (Paystack or Flutterwave) are a later phase and need a provider account.
- **Institution branding:**
  - The logo (PNG, JPEG or WebP, up to 1 MB) lives in a public bucket under the institution's own folder.
  - Brand colours are applied only where text reaches 4.5:1 contrast; otherwise ALUMS navy is used.
  - The public page shows only for verified institutions that opt in.
- **Alumni network:** posts are public or alumni-only. Alumni are verified members of any class at that institution. Linkages cover partners, associations, chapters and official channels.

## Affiliations and invitation codes
- **Affiliation:**
  - A Class Admin requests that their class join a *verified* institution's network.
  - Approval needs `community.create` at that institution (institution or platform admins), AAL2, and an approver other than the requester.
  - Approval links the class, which gives the institution's admins oversight of it, branding, alumni-only news and network stats.
  - Either side can end it with a reason, which removes the oversight immediately. Everything is audited.
- **Invitation codes:**
  - Format: `PREFIX-XXXXXX` (32-symbol alphabet, about 10⁹ combinations per prefix).
  - Members redeem them at `/join/<code>` or under My classes, and need a verified email.
  - Codes either verify the member immediately (only leaders with `membership.approve` can create these) or create a pending request.
  - Limits: max uses, expiry (up to 1 year), revocation, and 10 failed attempts per user per hour.
  - Codes belong to a class community, so there are no platform-wide codes. ALUMS is class-first.

## Not built (deliberately, so nothing is presented as working)
- Location map: a list plus a country distribution ships instead.
- Profile photos: initials are used.
- Welfare and contributions: only `finance.manage` and the separation-of-duties rule exist.
- Mentorship matching: only an "open to mentoring" flag exists.
- Account deletion and data export.
- The logo system's nine variations (one mark is implemented).
- Higher-resolution landing imagery: the two AI-generated illustrations ship at their supplied sizes (549×310 and 441×549) and are labelled as AI-generated. Replace them with larger exports for sharper retina display.

## Debt and MVP shortcuts
- Class modules switched off are hidden in the member portal and their pages redirect; RLS does not yet block writes to an off module's tables.
- Membership and business approvals don't require AAL2.
- Supabase types are handwritten.
- Directory masking runs per row; revisit at around 10k members per scope.
- Announcement fan-out is synchronous.
- 36 unindexed `*_by` foreign keys (INFO level).
- Directory search scans the table per query (about 10k rows, fast today). Move to the `%>` operator and the trigram index if the catalogue grows past about 100k rows.

## Brand and accessibility reconciliation
White text on #EA580C is 3.6:1, which fails AA. Filled buttons therefore use #C2410C, and #EA580C stays the accent colour. The project brief bans glassmorphism and neon, so CLAUDE.md rules over the general style preferences.
