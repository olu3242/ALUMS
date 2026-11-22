# ALUMS — Product Requirements Document (v2.0)
**Tagline:** Your Class. Your People. Your Network. **Founding MVP:** Accounting — Class of 2007 (institution pending confirmation)

## 1. Vision
ALUMS turns shared academic history into lifelong relationships, networking and opportunity. Unlike institution-centered alumni systems, **"Class of" is the primary discovery and onboarding path.**

## 2. Primary journey
Find My Class → Institution → Department → Graduation Year → Class Community → Membership Verification → Community Dashboard. One account, many verified communities; each community has its own members, leaders, content and admin boundary.

## 3. Capabilities
Alumni discovery · personal/professional profiles · business directory · geographic networking · class communities · events/reunions · announcements · welfare/contributions · mentorship · governance/administration.

## 4. Experiences and routes
- **Public:** `/ /about /discover /class-of /sign-in /register /community/[slug]`
- **Member portal:** `/app/{dashboard,my-classes,profile,alumni,businesses,locations,events,gallery,announcements,settings}`, scoped to the selected class
- **Admin control center:** `/admin/{dashboard,members,communities,institutions,roles,permissions,approvals,moderation,security,audit-logs,settings}`, plus a class-admin view exposing only authorized functions

## 5. Functional requirements
| ID | Requirement |
|---|---|
| FR-1 | Class finder (institution, department, year) with empty state and "request a missing community"; no fabricated counts |
| FR-2 | Register, verify email, apply, admin review, approval, community switching |
| FR-3 | Profile: identity, about, professional, location; per-field visibility (Everyone / Verified class members / Approved connections / Only me); sensitive fields private by default |
| FR-4 | Directory filters: name, institution, year, department, profession, industry, country, city, business owner; grid and list |
| FR-5 | Business directory: create, services, submit, review, approve, list; search, categories, owner verification |
| FR-6 | Privacy-first locations: country/city with opt-in; map and list; no precise address without informed consent |
| FR-7 | Events: create, detail, RSVP, attendance, reminders, albums (ticketing post-MVP) |
| FR-8 | Announcements, gallery, notifications |
| FR-9 | Admin: real metrics, approvals queue, moderation, role assignment, audit logs |
| FR-10 | Scoped RBAC: Super Admin, Platform Admin, Institution Admin, Class Admin, Class Secretary, Class Treasurer, Community Moderator, Verified Member |

## 6. Role assignment workflow
Select verified user → choose scope → select role → preview permissions → request approval if required → confirm → audit event → notify member.

## 7. Non-functional requirements
Supabase PostgreSQL (UUIDs, FKs, indexed membership lookups); RLS on all exposed tables; Zod server-side validation; MFA for privileged admins; audit logging; WCAG 2.2 AA; mobile-first; light/dark tokens; Vercel; versioned migrations.

## 8. Data model
users/profiles, institutions, departments, class_communities, memberships, membership_requests, invitations, roles, permissions, role_permissions, role_assignments, businesses, business_categories, events, event_rsvps, announcements, albums, media_assets, locations, notifications, moderation_reports, approval_requests, audit_logs.

## 9. Founding MVP workflows
A Membership · B Profile · C Business · D Events · E Administration (implemented as definitions in `automation/workflow-os`).

## 10. Brand
Navy #10243A, Orange #EA580C (primary action), Gold #D8AD58, Champagne #F2DCA5, Ivory #FAF8F3. Orange replaces Forest Green; green is semantic-only. Logo concepts: Connected A, Alumni Circle, Shared Path; nine required variations; SVG + PNG + usage guide. Type: Manrope/Plus Jakarta, Inter, DM Serif Display sparingly.

## 11. Testing
Automated tests for auth, membership, authorization (cross-community isolation, escalation), core features, responsive layouts, accessibility. Report PASS / FAIL / BLOCKED / NOT RUN.

## 12. Out of scope (MVP)
Payment ticketing; fabricated metrics or members; production changes without authorization.
