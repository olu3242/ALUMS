import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { assignRole, revokeRole } from "@/lib/actions/admin";
import { assignableRoles, conflictsWith, PERMISSIONS, roleByKey, roleName } from "@/lib/rbac/catalog";
import { cn, formatDate } from "@/lib/utils";

export const metadata = { title: "Roles" };
type A = { id: string; user_id: string; full_name: string; role_key: string; status: string; assigned_by_name: string | null; created_at: string };
type M = { user_id: string; full_name: string; status: string; roles: string[] };

const STEPS = ["Select verified user", "Choose role", "Preview & confirm"];

export default async function Roles({ searchParams }: { searchParams: Promise<{ user?: string; role?: string; email?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireAdmin("role.assign");
  const supabase = await createClient();
  const scope = ctx.current;
  const { data: assigned } = await supabase.rpc("admin_role_assignments", { p_scope_type: scope.scope_type, p_scope_id: scope.scope_id });
  const assignments = (assigned as A[] | null) ?? [];

  // Step 1 candidates: community → verified roster; platform/institution → exact email lookup.
  let candidates: { user_id: string; full_name: string; roles?: string[] }[] = [];
  if (scope.scope_type === "community") {
    const { data } = await supabase.rpc("admin_members", { p_community_id: scope.scope_id, p_status: "active" });
    candidates = ((data as M[] | null) ?? []);
  } else if (sp.email) {
    const { data } = await supabase.rpc("admin_find_user", { p_email: sp.email.slice(0, 254) });
    candidates = ((data as { user_id: string; full_name: string; email_verified: boolean }[] | null) ?? []).filter((u) => u.email_verified);
  }
  const target = candidates.find((c) => c.user_id === sp.user);
  const held = assignments.filter((a) => a.user_id === sp.user).map((a) => a.role_key);
  const options = assignableRoles(scope.scope_type, ctx.maxRank);
  const role = sp.role ? roleByKey(sp.role) : undefined;
  const step = !target ? 0 : !role ? 1 : 2;
  const conflicts = role ? conflictsWith(role.key, held) : [];

  return (
    <>
      <PageHeader eyebrow={scope.label} title="Role assignment" description="Leaders can only grant roles ranked below their own, never to themselves. Critical and financial roles require an independent approval." />
      <Card className="mb-10">
        <ol className="mb-6 grid gap-2 sm:grid-cols-3" aria-label="Assignment steps">
          {STEPS.map((s, i) => (
            <li key={s} aria-current={i === step ? "step" : undefined} className={cn("rounded-xl border px-3 py-2 text-sm", i === step ? "border-accent bg-champagne/30 font-semibold" : i < step ? "border-success/40 text-success" : "border-line text-muted")}>
              {i + 1}. {s}
            </li>
          ))}
        </ol>

        {step === 0 && (scope.scope_type === "community" ? (
          candidates.length === 0 ? <p className="text-sm text-muted">No verified members yet.</p> : (
            <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Verified member" htmlFor="user" className="flex-1">
                <Select id="user" name="user" required>{candidates.map((c) => <option key={c.user_id} value={c.user_id}>{c.full_name || c.user_id.slice(0, 8)}</option>)}</Select>
              </Field>
              <Button>Continue</Button>
            </form>
          )
        ) : (
          <>
            <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Find a user by verified email" htmlFor="email" className="flex-1"><Input id="email" name="email" type="email" defaultValue={sp.email} required /></Field>
              <Button>Search</Button>
            </form>
            {sp.email && (candidates.length === 0 ? <p className="mt-3 text-sm text-muted">No verified account with that email.</p> : (
              <ul className="mt-4 grid gap-2">{candidates.map((c) => (
                <li key={c.user_id}><Link className="font-semibold text-accent-text hover:underline" href={`?email=${encodeURIComponent(sp.email!)}&user=${c.user_id}`}>Select {c.full_name || c.user_id.slice(0, 8)} →</Link></li>
              ))}</ul>
            ))}
          </>
        ))}

        {step === 1 && (
          <form method="get" className="grid gap-4">
            {sp.email && <input type="hidden" name="email" value={sp.email} />}
            <input type="hidden" name="user" value={target!.user_id} />
            <p>Assigning to <strong>{target!.full_name || "selected user"}</strong>{held.length ? <> · currently {held.map(roleName).join(", ")}</> : null}. <Link href="/admin/roles" className="text-sm text-accent-text underline">Change</Link></p>
            {options.length === 0 ? <Notice>Your rank doesn't allow assigning roles in this scope.</Notice> : (
              <fieldset className="grid gap-2 sm:grid-cols-2">
                <legend className="mb-2 font-heading text-sm font-semibold">Role</legend>
                {options.map((r) => (
                  <label key={r.key} className="flex cursor-pointer gap-3 rounded-xl border border-line p-3 has-[:checked]:border-accent has-[:checked]:bg-champagne/20">
                    <input type="radio" name="role" value={r.key} required className="mt-1 accent-[rgb(var(--primary))]" />
                    <span><span className="font-semibold">{r.name}</span>
                      <span className="mt-1 flex flex-wrap gap-1">{r.requiresApproval && <Badge tone="warning">Needs approval</Badge>}{r.financial && <Badge tone="accent">Financial</Badge>}</span></span>
                  </label>
                ))}
              </fieldset>
            )}
            <div><Button>Preview permissions</Button></div>
          </form>
        )}

        {step === 2 && role && (
          <ActionForm action={assignRole} className="grid gap-5">
            <input type="hidden" name="user_id" value={target!.user_id} />
            <input type="hidden" name="role_key" value={role.key} />
            <input type="hidden" name="scope_type" value={scope.scope_type} />
            <input type="hidden" name="scope_id" value={scope.scope_id ?? ""} />
            <p><strong>{target!.full_name}</strong> will become <strong>{role.name}</strong> in <strong>{scope.label}</strong>. <Link href={`?${new URLSearchParams({ ...(sp.email ? { email: sp.email } : {}), user: target!.user_id })}`} className="text-sm text-accent-text underline">Change role</Link></p>
            {conflicts.length > 0 && <Notice tone="warning">Separation of duties: this conflicts with {conflicts.map(roleName).join(", ")}. The request will be refused.</Notice>}
            {role.requiresApproval && <Notice>This role takes effect only after an independent approver confirms it.</Notice>}
            <div>
              <h3 className="mb-2 font-heading text-sm font-semibold">Permissions granted ({role.permissions.length})</h3>
              <ul className="grid gap-1.5 text-sm sm:grid-cols-2">{role.permissions.map((p) => <li key={p} className="flex gap-2"><span className="text-success">✓</span><span><code className="text-xs">{p}</code> — {PERMISSIONS[p]}</span></li>)}</ul>
            </div>
            <Field label="Reason (recorded in the audit log)" htmlFor="reason"><Textarea id="reason" name="reason" maxLength={500} className="min-h-20" /></Field>
            <Checkbox name="confirm" required label="I've reviewed these permissions and confirm this assignment" />
            <div><SubmitButton pendingLabel="Submitting…">{role.requiresApproval ? "Request approval" : "Assign role"}</SubmitButton></div>
          </ActionForm>
        )}
      </Card>

      <h2 className="mb-4 text-lg font-bold">Current roles in this scope</h2>
      {assignments.length === 0 ? <EmptyState title="No roles assigned in this scope" /> : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {assignments.map((a) => {
            const r = roleByKey(a.role_key);
            const canRevoke = r ? r.rank < ctx.maxRank : false;
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1"><p className="font-semibold">{a.full_name || "—"}</p><p className="text-sm text-muted">{roleName(a.role_key)} · since {formatDate(a.created_at)}{a.assigned_by_name ? ` · by ${a.assigned_by_name}` : ""}</p></div>
                <StatusBadge status={a.status} />
                {canRevoke && <form action={revokeRole}><input type="hidden" name="id" value={a.id} /><Button size="sm" variant="ghost">{a.status === "pending_approval" ? "Cancel" : "Revoke"}</Button></form>}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
