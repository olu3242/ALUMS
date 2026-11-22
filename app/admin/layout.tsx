import { Shell, type NavItem } from "@/components/app/shell";
import { BackendNotice } from "@/components/ui/misc";
import { isBackendConfigured } from "@/lib/env";
import { getViewer, requireAdmin } from "@/lib/session";
import { setAdminScope } from "@/lib/actions/admin";

export const dynamic = "force-dynamic";

// Nav is filtered by live permissions for the selected scope (class admins only see what they may use).
const NAV: (NavItem & { perm?: string; scopes?: string[] })[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: "home" },
  { href: "/admin/approvals", label: "Approvals", icon: "check" },
  { href: "/admin/members", label: "Members", icon: "users", perm: "member.view", scopes: ["community"] },
  { href: "/admin/communities", label: "Communities", icon: "layers", perm: "community.view_admin" },
  { href: "/admin/institutions", label: "Institutions", icon: "building", perm: "institution.manage", scopes: ["platform"] },
  { href: "/admin/institution", label: "Institution brand & network", icon: "building", perm: "institution.brand", scopes: ["institution"] },
  { href: "/admin/dues", label: "Dues", icon: "briefcase", perm: "finance.view", scopes: ["community"] },
  { href: "/admin/roles", label: "Roles", icon: "key", perm: "role.assign" },
  { href: "/admin/permissions", label: "Permissions", icon: "list" },
  { href: "/admin/moderation", label: "Moderation", icon: "flag", perm: "moderation.resolve", scopes: ["community"] },
  { href: "/admin/security", label: "Security", icon: "shield" },
  { href: "/admin/automations", label: "Automations", icon: "layers", perm: "audit.view" },
  { href: "/admin/audit-logs", label: "Audit logs", icon: "scroll", perm: "audit.view" },
  { href: "/admin/settings", label: "Settings", icon: "settings", perm: "community.manage" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isBackendConfigured()) return <main id="main" className="container py-16"><BackendNotice /></main>;
  const ctx = await requireAdmin();
  const { user, profile } = await getViewer();
  const nav = [
    ...NAV.filter((n) => (!n.perm || ctx.permissions.has(n.perm)) && (!n.scopes || n.scopes.includes(ctx.current.scope_type))),
    { href: "/app/dashboard", label: "Back to member portal", icon: "arrow" as const },
  ];
  const options = ctx.options.map((o) => ({
    value: `${o.scope_type}:${o.scope_id ?? ""}`,
    label: o.scope_type === "institution" ? `${o.label} (institution)` : o.label,
  }));
  const current = `${ctx.current.scope_type}:${ctx.current.scope_id ?? ""}`;
  return (
    <Shell title="Admin control center" nav={nav} user={{ name: profile?.full_name ?? "", email: user.email }}
      top={
        <form action={setAdminScope} className="rounded-xl border border-white/15 bg-white/5 p-3">
          <label htmlFor="scope" className="text-[11px] font-bold uppercase tracking-[0.14em] text-champagne">Admin scope</label>
          <div className="mt-1.5 flex gap-2">
            <select id="scope" name="scope" defaultValue={current} className="h-9 min-w-0 flex-1 rounded-lg border border-white/20 bg-navy px-2 text-sm text-white">
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="h-9 rounded-lg bg-orange-strong px-3 text-sm font-semibold text-white">Go</button>
          </div>
        </form>
      }>
      {children}
    </Shell>
  );
}
