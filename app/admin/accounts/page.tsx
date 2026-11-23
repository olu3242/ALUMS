import { Card } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireUser } from "@/lib/session";
import { setAccountStatus } from "@/lib/actions/admin";
import { roleName } from "@/lib/rbac/catalog";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Accounts" };
type U = { user_id: string; full_name: string | null; email: string; email_confirmed: boolean; created_at: string;
  last_sign_in_at: string | null; suspended: boolean; platform_roles: string[]; communities: { membership_id: string; name: string; status: string }[] };

export default async function Accounts({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const ctx = await requireAdmin("member.view");
  if (ctx.current.scope_type !== "platform") return <><PageHeader title="Accounts" /><Notice>Switch the Admin scope to <strong>Platform</strong> to manage accounts.</Notice></>;
  const { data, error } = await (await createClient()).rpc("admin_list_users", { p_query: q ?? null, p_limit: 100 });
  const rows = (data ?? []) as U[];
  const canSuspend = ctx.permissions.has("member.suspend");
  const me = (await requireUser()).id;
  return (
    <>
      <PageHeader eyebrow="Platform" title="Accounts" description="Every ALUMS account. Suspending blocks sign-in and signs the person out everywhere; it is reversible and audited. Class membership is managed per class under Members." />
      <form className="mb-6 flex max-w-xl gap-2" role="search">
        <label htmlFor="q" className="sr-only">Search by name or email</label>
        <Input id="q" name="q" defaultValue={q} placeholder="Search by name or email" />
        <button className="h-11 rounded-xl border border-line px-4 text-sm font-semibold">Search</button>
      </form>
      {error ? <Notice tone="warning">Couldn't load accounts. Try again.</Notice> : rows.length === 0 ? <EmptyState title="No accounts found" /> : (
        <ul className="grid gap-3">
          {rows.map((u) => (
            <li key={u.user_id}><Card className="grid gap-3">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{u.full_name || "Name not set"}</p>
                  <p className="break-all text-sm text-muted">{u.email}</p>
                  <p className="mt-1 text-xs text-muted">Joined {formatDate(u.created_at)} · {u.last_sign_in_at ? `last sign-in ${formatDate(u.last_sign_in_at)}` : "never signed in"}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {u.suspended ? <StatusBadge status="suspended" /> : u.email_confirmed ? <Badge tone="success">Confirmed</Badge> : <Badge>Unconfirmed</Badge>}
                  {u.platform_roles.map((r) => <Badge key={r} tone="accent">{roleName(r)}</Badge>)}
                </div>
              </div>
              {u.communities.length > 0 && <p className="text-sm"><span className="text-muted">Classes: </span>{u.communities.map((c) => `${c.name} (${c.status})`).join(" · ")}</p>}
              {canSuspend && u.user_id !== me && (
                <ActionForm action={setAccountStatus} className="flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="id" value={u.user_id} />
                  <input type="hidden" name="suspend" value={String(!u.suspended)} />
                  {!u.suspended && <><label htmlFor={`r-${u.user_id}`} className="sr-only">Reason</label>
                    <Input id={`r-${u.user_id}`} name="reason" required minLength={3} maxLength={500} placeholder="Reason for suspension" className="h-9 text-sm" /></>}
                  <SubmitButton size="sm" variant={u.suspended ? "secondary" : "danger"}>{u.suspended ? "Reinstate account" : "Suspend account"}</SubmitButton>
                </ActionForm>
              )}
            </Card></li>
          ))}
        </ul>
      )}
    </>
  );
}
