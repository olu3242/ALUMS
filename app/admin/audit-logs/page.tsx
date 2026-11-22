import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Audit logs" };
type L = { id: number; occurred_at: string; actor_name: string | null; actor_id: string | null; action: string; scope_type: string; target_type: string | null; target_id: string | null; metadata: Record<string, unknown> };

export default async function AuditLogs({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const { before } = await searchParams;
  const ctx = await requireAdmin("audit.view");
  const { data } = await (await createClient()).rpc("admin_audit_logs", {
    p_scope_type: ctx.current.scope_type, p_scope_id: ctx.current.scope_id, p_limit: 100, p_before: /^\d+$/.test(before ?? "") ? Number(before) : null,
  });
  const rows = (data as L[] | null) ?? [];
  return (
    <>
      <PageHeader eyebrow={ctx.current.label} title="Audit logs" description="Append-only record of privileged actions in this scope." />
      {rows.length === 0 ? <EmptyState title="No audit events yet" /> : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[760px] text-left text-sm">
            <caption className="sr-only">Audit events</caption>
            <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wider text-muted">
              <tr><th className="p-3">When (UTC)</th><th className="p-3">Actor</th><th className="p-3">Action</th><th className="p-3">Target</th><th className="p-3">Details</th></tr>
            </thead>
            <tbody className="divide-y divide-line align-top">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap p-3 text-muted">{formatDateTime(r.occurred_at)}</td>
                  <td className="p-3">{r.actor_name || (r.actor_id ? r.actor_id.slice(0, 8) : "System")}</td>
                  <td className="p-3"><code className="text-xs font-semibold">{r.action}</code></td>
                  <td className="p-3 text-muted">{r.target_type ? `${r.target_type} ${r.target_id?.slice(0, 8) ?? ""}` : "—"}</td>
                  <td className="max-w-xs p-3"><code className="break-words text-xs text-muted">{Object.keys(r.metadata ?? {}).length ? JSON.stringify(r.metadata) : ""}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 100 && <Link href={`?before=${rows.at(-1)!.id}`} className="mt-4 inline-block font-semibold text-accent-text">Older events →</Link>}
    </>
  );
}
