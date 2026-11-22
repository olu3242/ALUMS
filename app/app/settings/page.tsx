import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { getViewer } from "@/lib/session";
import { updatePassword } from "@/lib/actions/auth";
import { removeConnection, respondConnection } from "@/lib/actions/profile";
import { roleName } from "@/lib/rbac/catalog";

export const metadata = { title: "Settings" };

export default async function Settings() {
  const { user, supabase } = await getViewer();
  const [{ data: conns }, { data: roles }] = await Promise.all([
    supabase.from("connections").select("id, requester_id, addressee_id, status").order("created_at", { ascending: false }),
    supabase.from("role_assignments").select("id, role_key, scope_type, status").in("status", ["active", "pending_approval"]),
  ]);
  const incoming = (conns ?? []).filter((c) => c.addressee_id === user.id && c.status === "pending");
  const accepted = (conns ?? []).filter((c) => c.status === "accepted");
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-bold">Account</h2>
          <dl className="mt-3 text-sm"><dt className="text-muted">Email</dt><dd className="font-semibold break-all">{user.email}</dd></dl>
          <ActionForm action={updatePassword} resetOnSuccess className="mt-5 grid gap-3">
            <Field label="New password" htmlFor="password" hint="At least 10 characters."><Input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required /></Field>
            <div><SubmitButton variant="secondary">Change password</SubmitButton></div>
          </ActionForm>
        </Card>
        <Card>
          <h2 className="font-bold">Appearance</h2>
          <p className="mt-1 text-sm text-muted">Follow your device, or choose light or dark.</p>
          <ThemeToggle className="mt-4 inline-block" />
          <h2 className="mt-8 font-bold">Privacy</h2>
          <p className="mt-1 text-sm text-muted">Field-by-field visibility and location sharing live on your <Link href="/app/profile" className="text-accent-text underline">profile</Link>.</p>
        </Card>
        <Card>
          <h2 className="font-bold">Connection requests</h2>
          {incoming.length === 0 ? <p className="mt-2 text-sm text-muted">No pending requests.</p> : (
            <ul className="mt-3 divide-y divide-line">
              {incoming.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <Link href={`/app/alumni/${c.requester_id}`} className="flex-1 font-semibold hover:text-accent-text">View classmate</Link>
                  <form action={respondConnection}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="accepted" /><Button size="sm">Accept</Button></form>
                  <form action={respondConnection}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="declined" /><Button size="sm" variant="ghost">Decline</Button></form>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-muted">{accepted.length} approved connection{accepted.length === 1 ? "" : "s"}.</p>
          {accepted.length > 0 && (
            <ul className="mt-2 grid gap-1 text-sm">
              {accepted.map((c) => {
                const other = c.requester_id === user.id ? c.addressee_id : c.requester_id;
                return <li key={c.id} className="flex items-center gap-2"><Link href={`/app/alumni/${other}`} className="flex-1 hover:text-accent-text">Classmate profile</Link>
                  <form action={removeConnection}><input type="hidden" name="id" value={c.id} /><Button size="sm" variant="ghost">Remove</Button></form></li>;
              })}
            </ul>
          )}
        </Card>
        <Card>
          <h2 className="font-bold">Your roles</h2>
          {(roles ?? []).length === 0 ? <p className="mt-2 text-sm text-muted">You're a verified member with no leadership roles.</p> : (
            <ul className="mt-3 grid gap-2">{roles!.map((r) => <li key={r.id} className="flex items-center justify-between text-sm"><span className="font-semibold">{roleName(r.role_key)}</span><StatusBadge status={r.status} /></li>)}</ul>
          )}
        </Card>
      </div>
    </>
  );
}
