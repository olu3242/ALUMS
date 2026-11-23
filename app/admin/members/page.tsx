import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";
import { NeedsCommunity } from "@/components/app/scope-note";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { inviteMember, removeMember, revokeInvitation, setMemberStatus } from "@/lib/actions/admin";
import { createInviteCode, revokeInviteCode } from "@/lib/actions/network";
import { Checkbox, Select } from "@/components/ui/form";
import { env } from "@/lib/env";
import { roleName } from "@/lib/rbac/catalog";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Members" };
type M = { membership_id: string; user_id: string; full_name: string; status: string; verification_method: string; verified_at: string; roles: string[] };

export default async function Members() {
  const ctx = await requireAdmin("member.view");
  if (ctx.current.scope_type !== "community") return <><PageHeader title="Members" /><NeedsCommunity next="/admin/members" /></>;
  const supabase = await createClient();
  const [{ data }, { data: codes }, { data: invites }] = await Promise.all([
    supabase.rpc("admin_members", { p_community_id: ctx.current.scope_id }),
    ctx.permissions.has("member.invite")
      ? supabase.from("invite_codes").select("id, code, label, auto_approve, max_uses, uses, expires_at, revoked_at, created_at").eq("community_id", ctx.current.scope_id!).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
    ctx.permissions.has("member.invite")
      ? supabase.from("invitations").select("id, email, created_at, expires_at, accepted_at, revoked_at").eq("community_id", ctx.current.scope_id!).order("created_at", { ascending: false }).limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  const now = new Date();
  const inviteState = (i: { accepted_at: string | null; revoked_at: string | null; expires_at: string }) =>
    i.accepted_at ? "accepted" : i.revoked_at ? "revoked" : new Date(i.expires_at) < now ? "expired" : "pending";
  const canAuto = ctx.permissions.has("membership.approve");
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
          <h3 className="mt-6 text-sm font-bold">Invited classmates ({(invites ?? []).length})</h3>
          {(invites ?? []).length === 0 ? <p className="mt-1 text-sm text-muted">No invitations sent yet. Invitations you create appear here with their status.</p> : (
            <ul className="mt-2 divide-y divide-line">
              {invites!.map((i) => {
                const st = inviteState(i);
                return (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1"><span className="break-all font-semibold">{i.email}</span>
                      <span className="block text-xs text-muted">Sent {formatDate(i.created_at)}{st === "pending" ? ` · expires ${formatDate(i.expires_at)}` : ""}{i.accepted_at ? ` · joined ${formatDate(i.accepted_at)}` : ""}</span></span>
                    <StatusBadge status={st === "accepted" ? "accepted" : st === "pending" ? "pending" : st === "revoked" ? "revoked" : "archived"} />
                    {st === "pending" && (
                      <ActionForm action={revokeInvitation}><input type="hidden" name="id" value={i.id} />
                        <SubmitButton size="sm" variant="ghost" aria-label={`Revoke invitation for ${i.email}`}>Revoke</SubmitButton></ActionForm>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
      {ctx.permissions.has("member.invite") && (
        <Card className="mb-8">
          <h2 className="font-bold">Invitation codes</h2>
          <p className="text-sm text-muted">Shareable codes for WhatsApp groups, flyers or reunions. Anyone with the code can use it after verifying their email, so set limits.</p>
          <ActionForm action={createInviteCode} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <Field label="Label" htmlFor="ic-label"><Input id="ic-label" name="label" maxLength={80} placeholder="e.g. Class WhatsApp group" /></Field>
            <Field label="Max uses (optional)" htmlFor="ic-max"><Input id="ic-max" name="max_uses" type="number" min={1} max={10000} placeholder="Unlimited" /></Field>
            <Field label="Expires after" htmlFor="ic-exp"><Select id="ic-exp" name="expires_in_days" defaultValue="30"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></Select></Field>
            <SubmitButton>Create code</SubmitButton>
            <div className="sm:col-span-2 lg:col-span-4">
              <Checkbox name="auto_approve" disabled={!canAuto} label="Verify members automatically"
                hint={canAuto ? "Off: people who use the code join the review queue. On: they become verified members immediately — only share with trusted groups." : "Only leaders who can approve members may create auto-verifying codes; your codes send people to the review queue."} />
            </div>
          </ActionForm>
          {(codes ?? []).length > 0 && (
            <ul className="mt-6 divide-y divide-line">
              {codes!.map((c) => {
                const expired = c.expires_at && new Date(c.expires_at) < new Date();
                const used = c.max_uses !== null && c.uses >= c.max_uses;
                const state = c.revoked_at ? "revoked" : expired ? "expired" : used ? "used up" : "active";
                return (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 py-3 text-sm">
                    <code className="rounded-lg bg-surface-2 px-2.5 py-1 font-mono text-base font-bold tracking-wider">{c.code}</code>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold">{c.label ?? "Untitled"}</span>
                      <span className="block text-xs text-muted">{c.auto_approve ? "Auto-verify" : "Review required"} · {c.uses}{c.max_uses ? `/${c.max_uses}` : ""} used{c.expires_at ? ` · expires ${formatDate(c.expires_at)}` : ""}</span>
                      {state === "active" && <span className="block break-all text-xs text-muted">{env.siteUrl}/join/{c.code}</span>}
                    </span>
                    <StatusBadge status={state === "active" ? "active" : state === "revoked" ? "revoked" : "archived"} />
                    {state === "active" && <form action={revokeInviteCode}><input type="hidden" name="id" value={c.id} /><Button size="sm" variant="ghost">Revoke</Button></form>}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
      <h2 className="mb-3 text-lg font-bold">Class members ({rows.length})</h2>
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
                    {canSuspend && r.status === "left" && (
                      <form action={setMemberStatus}><input type="hidden" name="id" value={r.membership_id} /><input type="hidden" name="status" value="active" />
                        <Button size="sm" variant="secondary">Reinstate</Button></form>
                    )}
                    {canSuspend && r.status !== "left" && (
                      <details className="mt-2 text-left">
                        <summary className="cursor-pointer text-xs font-semibold text-muted">Remove from class</summary>
                        <ActionForm action={removeMember} className="mt-2 grid gap-2">
                          <input type="hidden" name="id" value={r.membership_id} />
                          <label htmlFor={`rm-${r.membership_id}`} className="sr-only">Reason</label>
                          <input id={`rm-${r.membership_id}`} name="reason" required minLength={3} maxLength={500} placeholder="Reason (sent to the member)"
                            className="h-9 rounded-lg border border-line bg-surface px-2 text-sm" />
                          <SubmitButton size="sm" variant="danger">Remove</SubmitButton>
                        </ActionForm>
                      </details>
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
