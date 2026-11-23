import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/form";
import { NeedsCommunity } from "@/components/app/scope-note";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { resolveReport } from "@/lib/actions/admin";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Moderation" };

export default async function Moderation() {
  const ctx = await requireAdmin("moderation.resolve");
  if (ctx.current.scope_type !== "community") return <><PageHeader title="Moderation" /><NeedsCommunity next="/admin/moderation" /></>;
  const { data } = await (await createClient()).from("moderation_reports").select("id, target_type, target_id, reason, status, created_at, resolution_note")
    .eq("community_id", ctx.current.scope_id!).order("status").order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  return (
    <>
      <PageHeader eyebrow={ctx.current.label} title="Moderation" description="Reports from members. Hide media from the album page and suspend listings from Approvals; resolve the report here." />
      {rows.length === 0 ? <EmptyState title="No reports" /> : (
        <ul className="grid gap-4">
          {rows.map((r) => (
            <li key={r.id}><Card>
              <div className="flex flex-wrap items-center gap-2"><Badge>{r.target_type}</Badge><StatusBadge status={r.status} /><span className="text-sm text-muted">{formatDateTime(r.created_at)}</span></div>
              <p className="mt-3">{r.reason}</p>
              <p className="mt-1 text-xs text-muted">Target id: <code>{r.target_id}</code></p>
              {r.status === "open" ? (
                <ActionForm action={resolveReport} className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="id" value={r.id} />
                  <label className="sr-only" htmlFor={`rn-${r.id}`}>Resolution note</label>
                  <Input id={`rn-${r.id}`} name="note" placeholder="Resolution note" maxLength={1000} />
                  <SubmitButton name="status" value="actioned">Mark actioned</SubmitButton>
                  <SubmitButton name="status" value="dismissed" variant="secondary">Dismiss</SubmitButton>
                </ActionForm>
              ) : r.resolution_note && <p className="mt-3 text-sm text-muted">Resolution: {r.resolution_note}</p>}
            </Card></li>
          ))}
        </ul>
      )}
    </>
  );
}
