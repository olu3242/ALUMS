import Link from "next/link";
import { Stat } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { roleName } from "@/lib/rbac/catalog";

export const metadata = { title: "Admin dashboard" };

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const ctx = await requireAdmin();
  const { data, error } = await (await createClient()).rpc("admin_overview", { p_scope_type: ctx.current.scope_type, p_scope_id: ctx.current.scope_id });
  const m = (data as Record<string, number | null> | null) ?? {};
  const myRoles = ctx.scopes.find((s) => s.scope_type === ctx.current.scope_type && s.scope_id === ctx.current.scope_id)?.roles
    ?? ctx.scopes.filter((s) => s.scope_type !== "community").flatMap((s) => s.roles);
  return (
    <>
      <PageHeader eyebrow={ctx.current.scope_type} title={ctx.current.label}
        description={<>Live figures from this scope only. <span className="inline-flex flex-wrap gap-1 align-middle">{myRoles.map((r) => <Badge key={r} tone="accent">{roleName(r)}</Badge>)}</span></>} />
      {notice === "forbidden" && <div className="mb-6"><Notice tone="warning">You don't have permission for that page in this scope.</Notice></div>}
      {error ? <Notice tone="warning">Metrics are unavailable for this scope.</Notice> : (
        <>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Needs attention</h2>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Link href="/admin/approvals"><Stat label="Membership requests" value={m.pending_requests} /></Link>
            <Link href="/admin/approvals#businesses"><Stat label="Businesses awaiting review" value={m.businesses_pending} /></Link>
            <Link href="/admin/approvals#roles"><Stat label="Role approvals" value={m.pending_approvals} /></Link>
            <Link href="/admin/moderation"><Stat label="Open reports" value={m.open_reports} /></Link>
          </div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Community health</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ctx.current.scope_type !== "community" && <Stat label="Communities" value={m.communities} />}
            <Stat label="Verified members" value={m.active_members} />
            <Stat label="Profiles completed" value={m.profiles_completed} hint="Name, headline and profession set" />
            <Stat label="Approved businesses" value={m.businesses_approved} />
            <Stat label="Upcoming events" value={m.upcoming_events} />
            <Stat label="RSVPs (going)" value={m.rsvps_going} />
            <Stat label="Suspended members" value={m.suspended_members} />
            {m.community_requests !== null && m.community_requests !== undefined && <Link href="/admin/communities"><Stat label="Community requests" value={m.community_requests} /></Link>}
          </div>
        </>
      )}
    </>
  );
}
