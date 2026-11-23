import { Card, Stat } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { NeedsCommunity } from "@/components/app/scope-note";
import { createClient } from "@/lib/supabase/server";
import { getViewer, requireAdmin } from "@/lib/session";
import { createDuesPlan, decideDuesPayment, recordDuesPayment, setPlanStatus, voidDuesPayment } from "@/lib/actions/dues";
import { CURRENCIES, formatMoney, METHOD_LABEL, PERIOD_LABEL } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Dues" };
type Summary = { plan_id: string; name: string; amount_minor: number; currency: string; period: string; due_date: string | null; status: string;
  confirmed_total: number; paid_members: number; pending_count: number; active_members: number };
type Pay = { id: string; plan_name: string; payer_id: string; payer_name: string | null; amount_minor: number; currency: string; period_label: string | null;
  method: string; reference: string | null; note: string | null; status: string; created_at: string; decision_note: string | null };

export default async function DuesAdmin() {
  const ctx = await requireAdmin("finance.view");
  if (ctx.current.scope_type !== "community") return <><PageHeader title="Dues" /><NeedsCommunity next="/admin/dues" /></>;
  const cid = ctx.current.scope_id!;
  const manage = ctx.permissions.has("finance.manage");
  const { user } = await getViewer();
  const supabase = await createClient();
  const [{ data: s }, { data: p }, { data: members }] = await Promise.all([
    supabase.rpc("dues_summary", { p_community_id: cid }),
    supabase.rpc("dues_payments_admin", { p_community_id: cid }),
    manage ? supabase.rpc("admin_members", { p_community_id: cid, p_status: "active" }) : Promise.resolve({ data: [] }),
  ]);
  const plans = (s as Summary[] | null) ?? [];
  const pays = (p as Pay[] | null) ?? [];
  const pending = pays.filter((x) => x.status === "pending");
  const active = plans.filter((x) => x.status === "active");
  const roster = ((members as { user_id: string; full_name: string }[] | null) ?? []).filter((m) => m.user_id !== user.id);

  return (
    <>
      <PageHeader eyebrow={ctx.current.label} title="Membership dues"
        description={manage ? "You manage dues for this class. Confirmations and plan changes require MFA and are audited; you can't confirm your own payment."
          : "Read-only: dues are managed by the Class Treasurer (separation of financial duties)."} />

      {plans.length > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {active.slice(0, 2).map((x) => <Stat key={x.plan_id} label={`${x.name} — collected`} value={formatMoney(x.confirmed_total, x.currency)} hint={`${x.paid_members} of ${x.active_members} members paid`} />)}
          <Stat label="Awaiting confirmation" value={pending.length} />
          <Stat label="Active plans" value={active.length} />
        </div>
      )}

      {manage && pending.length > 0 && (
        <section className="mb-10" aria-labelledby="queue">
          <h2 id="queue" className="mb-4 text-lg font-bold">Payments to confirm</h2>
          <ul className="grid gap-3">
            {pending.map((x) => (
              <li key={x.id}><Card>
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-heading text-xl font-extrabold tabular-nums">{formatMoney(x.amount_minor, x.currency)}</span>
                  <span className="font-semibold">{x.payer_name || "Member"}</span>
                  <span className="text-sm text-muted">{x.plan_name} · {METHOD_LABEL[x.method]}{x.reference ? ` · ref ${x.reference}` : ""}{x.period_label ? ` · ${x.period_label}` : ""} · {formatDate(x.created_at)}</span>
                </div>
                {x.note && <p className="mt-2 text-sm">“{x.note}”</p>}
                {x.payer_id === user.id ? <p className="mt-3 text-sm text-warning">This is your own payment — another finance officer must confirm it.</p> : (
                  <ActionForm action={decideDuesPayment} className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="id" value={x.id} />
                    <label className="sr-only" htmlFor={`dn-${x.id}`}>Note to member</label>
                    <Input id={`dn-${x.id}`} name="note" placeholder="Note (optional)" maxLength={500} />
                    <SubmitButton name="decision" value="confirm">Confirm received</SubmitButton>
                    <SubmitButton name="decision" value="reject" variant="secondary">Not received</SubmitButton>
                  </ActionForm>
                )}
              </Card></li>
            ))}
          </ul>
        </section>
      )}

      <section className="mb-10" aria-labelledby="plans">
        <h2 id="plans" className="mb-4 text-lg font-bold">Plans</h2>
        {plans.length === 0 ? <EmptyState title="No dues plans yet">{manage ? "Create the first plan below." : "The treasurer hasn't set any dues."}</EmptyState> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {plans.map((x) => (
              <li key={x.plan_id}><Card>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="font-bold">{x.name}</p><p className="text-sm text-muted">{formatMoney(x.amount_minor, x.currency)} · {PERIOD_LABEL[x.period]}{x.due_date ? ` · due ${formatDate(x.due_date)}` : ""}</p></div>
                  <StatusBadge status={x.status} />
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label={`${x.name} members paid`}
                  aria-valuenow={x.paid_members} aria-valuemin={0} aria-valuemax={Math.max(1, x.active_members)}>
                  <div className="h-full rounded-full bg-success" style={{ width: `${x.active_members ? (x.paid_members / x.active_members) * 100 : 0}%` }} />
                </div>
                <p className="mt-2 text-sm text-muted">{x.paid_members}/{x.active_members} paid · {formatMoney(x.confirmed_total, x.currency)} confirmed · {x.pending_count} pending</p>
                {manage && <form action={setPlanStatus} className="mt-3"><input type="hidden" name="id" value={x.plan_id} /><input type="hidden" name="status" value={x.status === "active" ? "archived" : "active"} />
                  <Button size="sm" variant="ghost">{x.status === "active" ? "Archive" : "Reactivate"}</Button></form>}
              </Card></li>
            ))}
          </ul>
        )}
      </section>

      {manage && (
        <div className="mb-10 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="text-lg font-bold">New dues plan</h2>
            <ActionForm action={createDuesPlan} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Name" htmlFor="dname" className="sm:col-span-2"><Input id="dname" name="name" required maxLength={120} placeholder="Annual dues 2027" /></Field>
              <Field label="Amount" htmlFor="damount"><Input id="damount" name="amount" inputMode="decimal" required placeholder="25,000" /></Field>
              <Field label="Currency" htmlFor="dcur"><Select id="dcur" name="currency" defaultValue="NGN">{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
              <Field label="Period" htmlFor="dperiod"><Select id="dperiod" name="period" defaultValue="annual">{Object.entries(PERIOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label="Due date (optional)" htmlFor="ddue"><Input id="ddue" name="due_date" type="date" /></Field>
              <Field label="Description" htmlFor="ddesc" className="sm:col-span-2"><Textarea id="ddesc" name="description" maxLength={1000} className="min-h-16" /></Field>
              <Field label="Payment instructions" htmlFor="dinstr" className="sm:col-span-2" hint="e.g. bank name, account name and number. Visible to verified members only.">
                <Textarea id="dinstr" name="payment_instructions" maxLength={2000} className="min-h-16" /></Field>
              <Field label="Online payment link (optional)" htmlFor="durl" className="sm:col-span-2" hint="e.g. a Paystack or Flutterwave payment page."><Input id="durl" name="payment_url" type="url" placeholder="https://" /></Field>
              <div><SubmitButton>Create plan</SubmitButton></div>
            </ActionForm>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">Record a payment received</h2>
            <p className="text-sm text-muted">For cash or transfers you've verified directly. It is confirmed immediately in your name.</p>
            {active.length === 0 || roster.length === 0 ? <p className="mt-4 text-sm text-muted">Needs an active plan and at least one other member.</p> : (
              <ActionForm action={recordDuesPayment} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Plan" htmlFor="rplan"><Select id="rplan" name="plan_id">{active.map((x) => <option key={x.plan_id} value={x.plan_id}>{x.name}</option>)}</Select></Field>
                <Field label="Member" htmlFor="ruser"><Select id="ruser" name="user_id">{roster.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || "Member"}</option>)}</Select></Field>
                <Field label="Amount" htmlFor="ramount"><Input id="ramount" name="amount" inputMode="decimal" required /></Field>
                <Field label="Method" htmlFor="rmethod"><Select id="rmethod" name="method" defaultValue="cash">{Object.entries(METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
                <Field label="Reference" htmlFor="rref"><Input id="rref" name="reference" maxLength={120} /></Field>
                <Field label="Period" htmlFor="rper"><Input id="rper" name="period_label" maxLength={40} placeholder="2027" /></Field>
                <div className="sm:col-span-2"><SubmitButton>Record payment</SubmitButton></div>
              </ActionForm>
            )}
          </Card>
        </div>
      )}

      <section aria-labelledby="ledger">
        <h2 id="ledger" className="mb-4 text-lg font-bold">Ledger</h2>
        {pays.length === 0 ? <EmptyState title="No payments yet" /> : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Dues payments</caption>
              <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wider text-muted">
                <tr><th className="p-3">Date</th><th className="p-3">Member</th><th className="p-3">Plan</th><th className="p-3">Amount</th><th className="p-3">Method / ref</th><th className="p-3">Status</th><th className="p-3"><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody className="divide-y divide-line align-top">
                {pays.map((x) => (
                  <tr key={x.id}>
                    <td className="whitespace-nowrap p-3 text-muted">{formatDate(x.created_at)}</td>
                    <td className="p-3 font-semibold">{x.payer_name || "Member"}</td>
                    <td className="p-3">{x.plan_name}{x.period_label ? ` · ${x.period_label}` : ""}</td>
                    <td className="p-3 tabular-nums">{formatMoney(x.amount_minor, x.currency)}</td>
                    <td className="p-3 text-muted">{METHOD_LABEL[x.method]}{x.reference ? ` · ${x.reference}` : ""}</td>
                    <td className="p-3"><StatusBadge status={x.status} />{x.decision_note && <p className="mt-1 text-xs text-muted">{x.decision_note}</p>}</td>
                    <td className="p-3">
                      {manage && x.status === "confirmed" && x.payer_id !== user.id && (
                        <details><summary className="cursor-pointer text-xs text-muted">Void</summary>
                          <ActionForm action={voidDuesPayment} className="mt-2 grid w-56 gap-2">
                            <input type="hidden" name="id" value={x.id} />
                            <label className="sr-only" htmlFor={`v-${x.id}`}>Reason</label>
                            <Input id={`v-${x.id}`} name="reason" required minLength={3} placeholder="Reason" />
                            <SubmitButton size="sm" variant="danger">Void payment</SubmitButton>
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
      </section>
    </>
  );
}
