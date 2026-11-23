import { Card } from "@/components/ui/card";
import { requireFeature } from "@/lib/features";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/server";
import { getViewer, requireCommunity } from "@/lib/session";
import { submitDuesPayment } from "@/lib/actions/dues";
import { formatMoney, METHOD_LABEL, PERIOD_LABEL } from "@/lib/money";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Dues" };
type Plan = { id: string; name: string; description: string | null; amount_minor: number; currency: string; period: string;
  due_date: string | null; payment_instructions: string | null; payment_url: string | null };
type Pay = { id: string; plan_id: string; amount_minor: number; currency: string; method: string; reference: string | null;
  period_label: string | null; status: string; created_at: string; decision_note: string | null };

export default async function Dues() {
  await requireFeature("dues");
  const community = await requireCommunity();
  const { user } = await getViewer();
  const supabase = await createClient();
  const [{ data: plans }, { data: pays }] = await Promise.all([
    supabase.from("dues_plans").select("id, name, description, amount_minor, currency, period, due_date, payment_instructions, payment_url")
      .eq("community_id", community.id).eq("status", "active").order("created_at", { ascending: false }).returns<Plan[]>(),
    supabase.from("dues_payments").select("id, plan_id, amount_minor, currency, method, reference, period_label, status, created_at, decision_note")
      .eq("community_id", community.id).eq("user_id", user.id).order("created_at", { ascending: false }).returns<Pay[]>(),
  ]);
  const payments = pays ?? [];
  return (
    <>
      <PageHeader eyebrow={community.name} title="Membership dues"
        description="Dues are set and confirmed by your Class Treasurer. Pay using the instructions below, then tell the treasurer so it can be confirmed." />
      {(plans ?? []).length === 0 ? <EmptyState title="No dues are active for your class">Your treasurer will publish dues here when they're set.</EmptyState> : (
        <div className="grid gap-6">
          {plans!.map((p) => {
            const mine = payments.filter((x) => x.plan_id === p.id);
            const paid = mine.filter((x) => x.status === "confirmed").reduce((a, x) => a + Number(x.amount_minor), 0);
            const pending = mine.some((x) => x.status === "pending");
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{p.name}</h2>
                    <p className="text-sm text-muted">{PERIOD_LABEL[p.period]}{p.due_date ? ` · due ${formatDate(p.due_date)}` : ""}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-heading text-2xl font-extrabold tabular-nums">{formatMoney(p.amount_minor, p.currency)}</p>
                    {paid >= p.amount_minor ? <Badge tone="success">Paid</Badge> : pending ? <Badge tone="warning">Awaiting confirmation</Badge>
                      : paid > 0 ? <Badge tone="warning">Part-paid {formatMoney(paid, p.currency)}</Badge> : <Badge>Outstanding</Badge>}
                  </div>
                </div>
                {p.description && <p className="mt-3 text-[15px]">{p.description}</p>}
                {p.payment_instructions && (
                  <div className="mt-4 rounded-xl bg-surface-2 p-4 text-sm"><p className="font-semibold">How to pay</p><p className="mt-1 whitespace-pre-line">{p.payment_instructions}</p></div>
                )}
                {p.payment_url && <a href={p.payment_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline">Pay online ↗</a>}
                <details className="mt-5 rounded-xl border border-line p-4">
                  <summary className="cursor-pointer font-semibold">I've paid — notify the treasurer</summary>
                  <ActionForm action={submitDuesPayment} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input type="hidden" name="plan_id" value={p.id} />
                    <Field label={`Amount (${p.currency})`} htmlFor={`a-${p.id}`}><Input id={`a-${p.id}`} name="amount" inputMode="decimal" required defaultValue={(p.amount_minor / 100).toFixed(2)} /></Field>
                    <Field label="Method" htmlFor={`m-${p.id}`}>
                      <Select id={`m-${p.id}`} name="method" defaultValue="bank_transfer">{Object.entries(METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
                    </Field>
                    <Field label="Payment reference" htmlFor={`r-${p.id}`} hint="Transfer reference or receipt number."><Input id={`r-${p.id}`} name="reference" maxLength={120} /></Field>
                    <Field label="Period (optional)" htmlFor={`pl-${p.id}`}><Input id={`pl-${p.id}`} name="period_label" maxLength={40} placeholder="e.g. 2027" /></Field>
                    <Field label="Note (optional)" htmlFor={`n-${p.id}`} className="sm:col-span-2"><Textarea id={`n-${p.id}`} name="note" maxLength={500} className="min-h-16" /></Field>
                    <div><SubmitButton pendingLabel="Sending…">Send payment notice</SubmitButton></div>
                  </ActionForm>
                </details>
              </Card>
            );
          })}
        </div>
      )}
      <h2 className="mb-3 mt-10 text-lg font-bold">My payment history</h2>
      {payments.length === 0 ? <Notice>No payments yet.</Notice> : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {payments.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
              <span className="font-heading font-bold tabular-nums">{formatMoney(x.amount_minor, x.currency)}</span>
              <span className="text-muted">{METHOD_LABEL[x.method]}{x.reference ? ` · ${x.reference}` : ""}{x.period_label ? ` · ${x.period_label}` : ""} · {formatDate(x.created_at)}</span>
              <span className="ml-auto"><StatusBadge status={x.status} /></span>
              {x.decision_note && <p className="w-full text-muted">Treasurer: {x.decision_note}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
