// Mirror of supabase/migrations/*_rbac_catalog.sql for UI previews only.
// Authorization is always decided in Postgres. tests/catalog-sync.test.ts fails on drift.
export type ScopeType = "platform" | "institution" | "community";

export const PERMISSIONS = {
  "community.view_admin": "Open the admin control center for a scope",
  "community.manage": "Edit community details and settings",
  "community.create": "Create and verify class communities",
  "institution.manage": "Create and verify institutions",
  "member.view": "View the member roster and membership status",
  "member.invite": "Invite classmates by email",
  "member.suspend": "Suspend or reinstate members",
  "membership.review": "View the membership verification queue",
  "membership.approve": "Approve or reject membership requests",
  "role.assign": "Assign and revoke lower-ranked roles",
  "approval.decide": "Independently approve critical changes",
  "business.review": "Review, approve or suspend business listings",
  "event.create": "Create events",
  "event.manage": "Manage events, attendance and reminders",
  "announcement.publish": "Publish community announcements",
  "gallery.manage": "Create albums and moderate media",
  "moderation.resolve": "Resolve moderation reports",
  "audit.view": "View audit logs",
  "finance.manage": "Manage welfare and contributions (post-MVP)",
  "security.manage": "Manage security policy",
  "platform.settings": "Change platform-wide settings",
  "institution.brand": "Manage institution logo, colours and public page",
  "institution.network": "Publish institution news and opportunities, and manage linkages",
  "finance.view": "View dues plans, payment status and totals",
} as const;
export type Permission = keyof typeof PERMISSIONS;
const ALL = Object.keys(PERMISSIONS) as Permission[];

export type RoleDef = {
  key: string; name: string; scope: ScopeType; rank: number;
  requiresApproval: boolean; financial: boolean; assignable: boolean; permissions: Permission[];
};

const COMMUNITY_LEAD: Permission[] = ["community.view_admin", "community.manage", "member.view", "member.invite", "member.suspend",
  "membership.review", "membership.approve", "role.assign", "approval.decide", "business.review", "event.create", "event.manage",
  "announcement.publish", "gallery.manage", "moderation.resolve", "audit.view"];

export const ROLES: RoleDef[] = [
  { key: "super_admin", name: "Super Admin", scope: "platform", rank: 100, requiresApproval: true, financial: false, assignable: false, permissions: ALL },
  { key: "platform_admin", name: "Platform Admin", scope: "platform", rank: 90, requiresApproval: true, financial: false, assignable: true,
    permissions: ALL.filter((p) => p !== "platform.settings") },
  { key: "institution_admin", name: "Institution Admin", scope: "institution", rank: 70, requiresApproval: true, financial: false, assignable: true,
    permissions: [...COMMUNITY_LEAD, "community.create", "institution.brand", "institution.network", "finance.view"] },
  { key: "class_admin", name: "Class Admin", scope: "community", rank: 50, requiresApproval: true, financial: false, assignable: true, permissions: [...COMMUNITY_LEAD, "finance.view"] },
  { key: "class_secretary", name: "Class Secretary", scope: "community", rank: 40, requiresApproval: false, financial: false, assignable: true,
    permissions: ["community.view_admin", "member.view", "member.invite", "membership.review", "event.create", "event.manage", "announcement.publish", "gallery.manage"] },
  { key: "class_treasurer", name: "Class Treasurer", scope: "community", rank: 40, requiresApproval: true, financial: true, assignable: true,
    permissions: ["community.view_admin", "member.view", "finance.manage", "finance.view"] },
  { key: "community_moderator", name: "Community Moderator", scope: "community", rank: 30, requiresApproval: false, financial: false, assignable: true,
    permissions: ["community.view_admin", "member.view", "moderation.resolve", "gallery.manage"] },
  { key: "verified_member", name: "Verified Member", scope: "community", rank: 10, requiresApproval: false, financial: false, assignable: false, permissions: [] },
];

export const ROLE_CONFLICTS: [string, string][] = [["class_admin", "class_treasurer"]];

export const roleByKey = (key: string) => ROLES.find((r) => r.key === key);
export const roleName = (key: string) => roleByKey(key)?.name ?? key;

/** Roles an actor of `actorRank` could request in `scope` — a UI hint mirroring assign_role(); the DB re-checks. */
export const assignableRoles = (scope: ScopeType, actorRank: number) =>
  ROLES.filter((r) => r.assignable && r.scope === scope && r.rank < actorRank);

export const conflictsWith = (roleKey: string, held: string[]) =>
  ROLE_CONFLICTS.filter(([a, b]) => (a === roleKey && held.includes(b)) || (b === roleKey && held.includes(a))).map(([a, b]) => (a === roleKey ? b : a));
