# ALUMS — Business Requirements Document (v2.0)

## 1. Purpose
Establish ALUMS as a **reusable commercial product** for alumni communities, validated by Accounting — Class of 2007.

## 2. Problem
Classmates lose touch after graduation. Institution-centered alumni systems leave class-led groups on scattered chats and spreadsheets, with weak verification, privacy and governance.

## 3. Business objectives
1. Validate the class-first model with one founding community.
2. Show new class communities can be created without code changes.
3. Build trust through verified membership, privacy controls and auditable governance.
4. Create a platform other classes and institutions can adopt.

## 4. Stakeholders
Product owner · Super/Platform Admins · Institution Admins · Class Admins, Secretary, Treasurer, Moderators · Verified alumni · Alumni business owners.

## 5. Scope
**In:** discovery, membership verification, profiles, directory, businesses, locations, events, announcements, gallery, administration, RBAC, audit.
**Later:** payment ticketing, welfare/contribution workflows, mentorship matching, institution-level plans.

## 6. Business requirements
| ID | Requirement |
|---|---|
| BR-1 | Class of is the primary discovery path |
| BR-2 | Multi-tenant: one account, many communities, strict isolation |
| BR-3 | Verified membership before access to member data |
| BR-4 | Class leaders administer only their own community |
| BR-5 | Businesses reviewed before listing |
| BR-6 | Privacy by default; opt-in location sharing |
| BR-7 | Financial duties separated; critical changes independently approved |
| BR-8 | Metrics come only from real data |

## 7. Assumptions and constraints
Institution for the founding class is unconfirmed and must not be invented. Stack: Next.js, Supabase, Vercel. No production changes without authorization.

## 8. Commercial model (to validate)
Candidates: per-community subscription, institution-wide plans, premium business listings, event ticketing fees. Pricing is not set here.

## 9. Success measures
Founding class activated; applicants verified; profiles completed; businesses approved; events with RSVPs; zero cross-community leaks in authorization tests. Targets are set after baseline data exists.

## 10. Risks
| Risk | Mitigation |
|---|---|
| Privacy or data leakage | RLS, scoped RBAC, isolation tests |
| Low adoption | Class-led invitations, simple onboarding |
| Admin abuse | MFA, audit logs, independent approvals |
| Brand drift | Tokens and design system |
| Unverified claims | Labeled sample data; no fabricated counts |

## 11. Readiness gate
MVP release requires an honest readiness report with every test marked PASS / FAIL / BLOCKED / NOT RUN.
