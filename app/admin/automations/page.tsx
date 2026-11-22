import { Card, Stat } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { WorkflowSteps } from "@/components/app/workflow-steps";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { listRuns } from "@/lib/workflows";
import { runAutomationsNow } from "@/lib/actions/admin";
import { workflows } from "@/automation/workflow-os/definitions";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Automations" };
const SUBJECT: Record<string, string> = { membership_request: "Membership request", membership: "Membership", profile: "Profile", business: "Business", event: "Event", community: "Community" };

export default async function Automations() {
  const ctx = await requireAdmin("audit.view");
  const platform = ctx.current.scope_type === "platform";
  const communityId = ctx.current.scope_type === "community" ? ctx.current.scope_id! : undefined;
  const supabase = await createClient();
  const [runs, { data: jobs }, { data: history }] = await Promise.all([
    listRuns({ communityId, limit: 60 }),
    platform ? supabase.from("automation_jobs").select("key, name, description, schedule, enabled").order("name") : Promise.resolve({ data: [] }),
    platform ? supabase.from("automation_runs").select("id, job_key, started_at, finished_at, status, processed, error").order("id", { ascending: false }).limit(200) : Promise.resolve({ data: [] }),
  ]);
  const last = new Map<string, { started_at: string; status: string; processed: number; error: string | null }>();
  for (const h of history ?? []) if (!last.has(h.job_key)) last.set(h.job_key, h);
  const count = (wf: string, st: string) => runs.filter((r) => r.workflow_id === wf && r.state === st).length;
  const canRun = ctx.permissions.has("platform.settings") || ctx.permissions.has("security.manage");

  return (
    <>
      <PageHeader eyebrow={ctx.current.label} title="Automations"
        description="Workflows A–E advance automatically from real activity; scheduled jobs send reminders and escalations. Everything here is live data." />

      <section aria-labelledby="wf" className="mb-10">
        <h2 id="wf" className="mb-4 text-lg font-bold">Workflows</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {workflows.map((w) => (
            <Card key={w.id} className="p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">{w.id.split("-")[0]}</p>
              <p className="font-bold">{w.name}</p>
              <p className="mt-2 text-sm"><span className="tabular-nums font-semibold">{count(w.id, "completed")}</span> completed</p>
              <p className="text-sm"><span className="tabular-nums font-semibold">{count(w.id, "waiting")}</span> waiting on people · <span className="tabular-nums">{count(w.id, "running")}</span> in progress</p>
            </Card>
          ))}
        </div>
        <h3 className="mb-3 mt-8 font-bold">Recent runs</h3>
        {runs.length === 0 ? <EmptyState title="No workflow runs in this scope yet" /> : (
          <ul className="grid gap-3">
            {runs.slice(0, 30).map((r) => (
              <li key={r.id}><Card className="p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{r.name}</span><span className="text-muted">· {SUBJECT[r.subject_type] ?? r.subject_type}</span>
                  <StatusBadge status={r.state === "waiting" ? "pending" : r.state === "running" ? "active" : r.state === "completed" ? "approved" : r.state} />
                  <span className="ml-auto text-xs text-muted">{formatDateTime(r.updated_at)}</span>
                </div>
                <WorkflowSteps steps={r.steps} compact />
              </Card></li>
            ))}
          </ul>
        )}
      </section>

      {platform && (
        <section aria-labelledby="jobs">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div><h2 id="jobs" className="text-lg font-bold">Scheduled jobs</h2><p className="text-sm text-muted">Run every 15 minutes by pg_cron. Each job is idempotent: reminders are sent once.</p></div>
            {canRun && <ActionForm action={runAutomationsNow}><SubmitButton pendingLabel="Running…">Run all now</SubmitButton></ActionForm>}
          </div>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Stat label="Runs (last 200)" value={(history ?? []).length} />
            <Stat label="Failed" value={(history ?? []).filter((h) => h.status === "failed").length} />
            <Stat label="Items processed" value={(history ?? []).reduce((a, h) => a + h.processed, 0)} />
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {(jobs ?? []).map((j) => {
              const l = last.get(j.key);
              return (
                <li key={j.key}><Card className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-bold">{j.name}</p><p className="text-sm text-muted">{j.description}</p></div>
                    <StatusBadge status={!j.enabled ? "archived" : l?.status === "failed" ? "rejected" : "active"} />
                  </div>
                  <p className="mt-3 text-xs text-muted">{j.schedule} · last run {l ? `${formatDateTime(l.started_at)} — ${l.status}, ${l.processed} sent` : "never"}</p>
                  {l?.error && <p className="mt-1 text-xs text-danger">{l.error}</p>}
                  {canRun && <ActionForm action={runAutomationsNow} className="mt-3"><input type="hidden" name="job" value={j.key} /><SubmitButton size="sm" variant="secondary">Run now</SubmitButton></ActionForm>}
                </Card></li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
