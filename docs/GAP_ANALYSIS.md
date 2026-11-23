# ALUMS: current state → future state gap analysis
_2026-11-23 · production https://alums-one.vercel.app · Supabase `adtwqlhpghmrwyaumcbp`_

Evidence: the repo at `main`, production database counts, Supabase security/performance advisors and the auth config,
taken on 2026-11-23. All counts are real.

## 1. Current state (what is live)

| Layer | State |
|---|---|
| **Product** | Public site: landing, discover, class pages, institution pages, worldwide institution lookup (10,277 entries), `/join/<code>`. Member portal with 8 class modules and a dashboard with an editable header. Admin center covers members, invitations and codes, accounts, content, communities, institutions, roles, approvals, moderation, dues, automations, audit, security and settings (feature list view). |
| **Data / tenancy** | Class-first and multi-tenant. RLS is on every table and test-enforced (`10_rls_coverage`). Scoped RBAC: platform ⊇ institution ⊇ community, 8 roles and 24 permissions, with SQL↔TS parity enforced by tests. |
| **Security** | Every privileged write goes through a SECURITY DEFINER RPC with a pinned `search_path`. MFA (AAL2) is required for privileged actions, with independent approvals and separation of duties. Audit is append-only. No service-role key in the app. |
| **Automation** | Workflow OS A–E is live in Postgres. `pg_cron` runs 7 jobs every 15 minutes: **553 runs, 0 failures**. |
| **Quality** | 15 DB suites (345 assertions), 47 unit tests, and an axe WCAG 2.2 AA smoke test (52 checks). CI and Supabase Preview checks are required before merging. |
| **Production data** | 3 accounts · 1 class (Accounting — Class of 2007, 2 verified members) · 1 institution (OAU Ile-Ife, **unverified**) · 1 platform admin (MFA on) · 2 pending invitations. |
| **Ops** | Vercel deploys from git. Logs come from Vercel and Supabase. Custom SMTP (Gmail) is configured but **rejects the login**. |

## 2. Future state (launch-ready, then platform)

1. **Trustworthy communications:** every auth, invitation and reminder email is delivered from a branded domain, with delivery monitoring.
2. **Governed and resilient:** at least two platform admins (independent approvals actually possible), verified institutions, legal pages, and data rights (export and deletion).
3. **Defence in depth:** product switches and policies are enforced in the database as well as the UI, and breached passwords are refused.
4. **Observable:** health probe, error tracking, and alerting on automation failures.
5. **Scales cleanly:** indexed joins, generated DB types, an end-to-end test account, and load-tested hot paths.
6. **Monetisation-ready:** card or bank payments for dues through a provider (Paystack or Flutterwave), webhook-verified.

## 3. Gap register

Priority: **P0** blocks the launch, **P1** is needed for a confident launch, **P2** is for scale/platform. "Status" refers to this change set.

| # | Gap | P | Owner | Status |
|---|---|---|---|---|
| G1 | **Email delivery:** Gmail rejects the SMTP login (535), so confirmations, resets and invitations are not emailed | P0 | **You:** new Gmail app password, or a Resend/Postmark key | Needs you |
| G2 | **Single platform admin:** independent approvals need a second platform-level person | P0 | **You:** pick the person; then I bootstrap them (audited) | Needs you |
| G3 | **Legal:** no privacy policy or terms (NDPR/GDPR) | P0 | **You / counsel** | Needs you. I can draft from the actual data practices for legal review |
| G4 | **Founding institution unverified** (OAU Ile-Ife) | P1 | **You:** confirm, then Admin → Institutions → Verified | Needs you |
| G5 | Class modules switched off were hidden in the UI only; the DB still accepted new rows | P1 | Claude | **Done:** insert triggers on 8 tables (`enforce_feature`) |
| G6 | Leaked-password protection off (Supabase gates it behind the Pro plan) | P1 | Claude | **Done in-app:** HIBP k-anonymity check on sign-up and password change (fails open). Plan upgrade optional |
| G7 | 50 unindexed foreign keys (performance advisor) | P1 | Claude | **Done:** 50 indexes |
| G8 | No health probe for uptime monitoring | P1 | Claude | **Done:** `GET /api/health` (200 ok / 503 degraded, DB check, commit) |
| G9 | Data portability (export) missing | P1 | Claude | **Done:** "Download my data" in Settings (`export_my_data`, own rows only, audited) |
| G10 | Account deletion | P1 | **You:** retention policy for audit/financial records; then Claude | Decision needed |
| G11 | Error tracking and alerting (no Sentry-style sink; automation failures not alerted) | P1 | **You:** choose a provider and DSN; Claude wires it | Needs you |
| G12 | Signed-in journeys never run end-to-end on production | P1 | **You:** approve a labelled QA account; Claude runs Playwright | Needs you |
| G13 | Handwritten Supabase types | P2 | Claude | Planned (generate from schema, CI drift check) |
| G14 | Membership and business approvals don't require AAL2 | P2 | Product decision | Planned |
| G15 | Card payments for dues (provider, webhooks, idempotency) | P2 | **You:** provider account | Planned |
| G16 | Load and performance testing; announcement fan-out is synchronous | P2 | Claude | Planned |
| G17 | Mentorship matching, profile photos, location map, welfare | P2 | Product | Backlog |
| G18 | Advisor lint 0029 (66 SECURITY DEFINER RPCs callable by `authenticated`) | — | — | **Accepted by design:** each RPC authorizes internally. `automation_sent` and `invite_code_attempts` have RLS on and no policies on purpose (internal-only). |

## 4. Rollout sequence
1. **This change set (G5–G9):** migration 0780, the in-app breached-password check, the health route and data export. Backward compatible; no env changes.
2. **Unblock launch (G1–G4):** fix SMTP, then I re-send the pending invitations and run the email flows. Name the second admin. Approve the legal drafts. Verify OAU.
3. **Confidence (G10–G12):** deletion policy, then implement it. Choose an error-tracking provider, then wire alerts (including automation failures). Create a QA account, then run the E2E suite on every deploy.
4. **Scale (G13–G16):** generated types, approval MFA, the payments provider, and load tests.
