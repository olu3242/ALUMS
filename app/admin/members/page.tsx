import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";
import { NeedsCommunity } from "@/components/app/scope-note";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { inviteMember, setMemberStatus } from "@/lib/actions/admin";
import { roleName } from "@/lib/rbac/catalog";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Members" };
type M = { membership_id: string; user_id: string; full_name: string; status: string; verification_method: string; verified_at: string; roles: string[] };

export default async function Members() {
  const ctx = await requireAdmin("member.view");
  if (ctx.current.scope_type !== "community") return <><PageHeader title="Members" /><NeedsCommunity /></>;
  const { data } = await (await createClient()).rpc("admin_members", { p_community_id: ctx.current.scope_id });
  const rows = (data as M[] | null) ?? [];
  const canSuspend = ctx.permissions.has("member.suspend");
  return (
    <>
      <PageHeader eyebrow={ctx.current.label} title="Members" description="Verified roster. Profile details remain subject to each member's own visibility settings." />
      {ctx.permissions.has("member.invite") && (
        <Card className="mb-8">
          <h2 className="font-bold">Invite a classmate</h2>
          <p className="text-sm text-muted">Invitations verify membership on acceptance and are bound to the email address you enter.</p>
          <ActionForm action={inviteMember} resetOnSuccess className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Email" htmlFor="email" className="flex-1"><Input id="email" name="email" type="email" required /></Field>
            <SubmitButton>Create invitation</SubmitButton>
          </ActionForm>
        </Card>
      )}
      {rows.length === 0 ? <EmptyState title="No members yet" /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Members of {ctx.current.label}</caption>
            <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wider text-muted">
              <tr><th className="p-3">Name</th><th className="p-3">Roles</th><th className="p-3">Verified</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.membership_id}>
                  <td className="p-3 font-semibold">{r.full_name || "—"}</td>
                  <td className="p-3"><div className="flex flex-wrap gap-1">{r.roles.length ? r.roles.map((k) => <Badge key={k} tone="accent">{roleName(k)}</Badge>) : <span className="text-muted">Member</span>}</div></td>
                  <td className="p-3 text-muted">{formatDate(r.verified_at)} · {r.verification_method.replace("_", " ")}</td>
                  <td className="p-3"><StatusBadge status={r.status} /></td>
                  <td className="p-3 text-right">
                    {canSuspend && r.status !== "left" && (
                      <form action={setMemberStatus}><input type="hidden" name="id" value={r.membership_id} /><input type="hidden" name="status" value={r.status === "active" ? "suspended" : "active"} />
                        <Button size="sm" variant={r.status === "active" ? "danger" : "secondary"}>{r.status === "active" ? "Suspend" : "Reinstate"}</Button></form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
