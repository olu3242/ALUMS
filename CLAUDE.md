# CLAUDE.md — ALUMS (v2.0 Orange Brand Edition)
Act as a multidisciplinary product team: product designer, brand designer, UX researcher, frontend, backend/DB architect, security, accessibility, QA.
Build a cohesive, reusable multi-community alumni product. Accounting — Class of 2007 validates it; never hardcode one institution, class, department or year.

## Stack
Next.js App Router, TypeScript, Tailwind, Supabase (Auth, PostgreSQL, Storage), Zod, Vitest, Vercel.
Inspect the repo first and verify current package docs before using APIs.

## Primary journey
ALUMS → Find My Class → Institution → Department → Graduation Year → Class Community → Membership Verification → Community Dashboard. One account can belong to many verified communities.

## Brand (strict)
Navy #10243A (structure) · Orange #EA580C (CTAs, active states) · Gold #D8AD58 · Champagne #F2DCA5 · Ivory #FAF8F3 · White · Ink #1E293B · Slate #64748B · Border #E5E7EB. Success #166534 · Warning #B7791F · Error #B42318.
Orange replaces Forest Green. Green only for verified/approved. Fonts: Manrope/Plus Jakarta Sans (headings), Inter (body), DM Serif Display (sparingly). No glassmorphism, neon, heavy gradients, or generic graduation-cap logo. WCAG 2.2 AA; light and dark via semantic tokens.

## Routes
Public: `/ /about /discover /class-of /sign-in /register /community/[slug]`
Member: `/app/{dashboard,my-classes,profile,alumni,businesses,locations,events,gallery,announcements,settings}`
Admin: `/admin/{dashboard,members,communities,institutions,roles,permissions,approvals,moderation,security,audit-logs,settings}`

## Security rules
RLS on every exposed table; server-side authorization; scoped RBAC (platform / institution / community); never trust client role names or user-editable auth metadata; service keys server-only; no stale-JWT-only authorization; audit all privileged mutations; MFA for privileged admins; separation of financial duties.

## Prohibitions
No hardcoded admin credentials, fabricated metrics or member counts, invented institution or alumni, mock auth presented as real, placeholder buttons presented as working, cross-community data leakage, uncontrolled migrations, or production changes without authorization. Label dev sample data clearly.

## Automation layer (`automation/`)
- `workflow-os/` declarative workflows A–E (membership, profile, business, events, administration)
- `runtime/` executes steps with typed context, permission checks, audit events
- `orchestrator/` sequences runs, approval gates, retries, CLI
Extend by adding a definition in `workflow-os/definitions.ts` and handlers in `runtime/handlers.ts`.

## Stages
1 Architecture → 2 Brand/design system → 3 Public experience → 4 Community portal → 5 Administration → 6 Backend integration → 7 Testing → 8 Release prep.
After each stage report: completed work, changed files, tests run, unresolved issues, next action. Report tests as PASS / FAIL / BLOCKED / NOT RUN.

## Implementation conventions (established — keep consistent)
- **New table checklist:** add `community_id` if tenant-owned → RLS policy using `private.is_member()` / `private.can(perm, community_id)` → explicit `grant` (table/column) to `authenticated` (0300 revokes defaults) → audit via RPC or `private.audit_content` trigger → a case in `supabase/tests/*.test.sql`. `10_rls_coverage` fails if RLS is missing.
- **Privileged mutation = RPC** in `public`, `security definer set search_path = ''`, starting with `private.require_auth()`, then permission check, `private.require_mfa()` where critical, state validation, `private.audit(...)`, `private.notify*`. Revoke from public, grant to `authenticated` explicitly. Raise user-safe messages with SQLSTATE 42501 / P0001 / P0002 (mapped by `lib/errors.ts`).
- **Permissions/roles change:** edit `20261122000250_rbac_catalog.sql` via a new migration *and* `lib/rbac/catalog.ts`; `tests/catalog-sync.test.ts` enforces parity.
- **Server actions:** Zod-parse `FormData` → call RPC/table with the session client from `lib/supabase/server.ts` → `ActionState`. Never import a service-role key.
- **UI:** semantic tokens only (`bg-surface`, `text-muted`, `text-accent-text`, `bg-primary`); `dark:` follows system preference unless `data-theme` forces it. `npm run test:ui` must stay at zero axe violations.
