import "server-only";
import { workflows } from "@/automation/workflow-os/definitions";
import { createClient } from "@/lib/supabase/server";

export type StepView = { id: string; label: string; outcome: "completed" | "waiting" | "denied" | "skipped" | "pending"; at?: string };
export type RunView = { id: string; workflow_id: string; name: string; state: string; current_step: string | null; subject_type: string;
  subject_id: string; community_id: string | null; user_id: string | null; updated_at: string; steps: StepView[] };

// Human labels for workflow steps (ids come from workflow-os/definitions.ts).
export const STEP_LABEL: Record<string, string> = {
  register: "Create account", "verify-email": "Verify email", "find-class": "Find your class", apply: "Apply",
  review: "Leader review", approve: "Approved", dashboard: "Open your class dashboard",
  create: "Create", academic: "Add academic details", career: "Add career details", privacy: "Review privacy settings", publish: "Appear in the directory",
  services: "Add services", submit: "Submit for review", list: "Listed for classmates",
  discover: "Published to members", rsvp: "First RSVP", attendance: "Attendance recorded",
  "verify-community": "Community verified", "assign-admin": "Class admin assigned", manage: "Leaders running the class",
};

type DbRun = Omit<RunView, "name" | "steps"> & { workflow_run_steps: { step_id: string; outcome: StepView["outcome"]; occurred_at: string }[] };

export function toView(r: DbRun): RunView {
  const def = workflows.find((w) => w.id === r.workflow_id);
  const recorded = new Map(r.workflow_run_steps.map((s) => [s.step_id, s]));
  return {
    ...r, name: def?.name ?? r.workflow_id,
    steps: (def?.steps ?? []).map((s) => {
      const rec = recorded.get(s.id);
      return { id: s.id, label: STEP_LABEL[s.id] ?? s.id, outcome: rec?.outcome ?? "pending", at: rec?.occurred_at };
    }),
  };
}

const COLS = "id, workflow_id, state, current_step, subject_type, subject_id, community_id, user_id, updated_at, workflow_run_steps(step_id, outcome, occurred_at)";

/** Runs visible to the current user (RLS: own runs, or community runs for leaders with audit.view). */
export async function listRuns(filter: { userId?: string; communityId?: string; workflowId?: string; subjectIds?: string[]; limit?: number }) {
  let q = (await createClient()).from("workflow_runs").select(COLS).order("updated_at", { ascending: false }).limit(filter.limit ?? 100);
  if (filter.userId) q = q.eq("user_id", filter.userId);
  if (filter.communityId) q = q.eq("community_id", filter.communityId);
  if (filter.workflowId) q = q.eq("workflow_id", filter.workflowId);
  if (filter.subjectIds) q = q.in("subject_id", filter.subjectIds.length ? filter.subjectIds : ["00000000-0000-0000-0000-000000000000"]);
  const { data } = await q;
  return ((data ?? []) as unknown as DbRun[]).map(toView);
}
