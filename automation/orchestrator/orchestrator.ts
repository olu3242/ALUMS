import { Workflow } from "../workflow-os/types";
import { Runtime, Ctx } from "../runtime/runtime";

export type RunState = "completed" | "waiting-approval" | "waiting" | "blocked" | "denied" | "failed";
export type RunResult = { state: RunState; next?: number; reason?: string };

/** Approval source: in-memory by default (CLI/dev); production passes a DB-backed check (workflow_run_steps). */
export type ApprovalGate = (runId: string, stepId: string) => Promise<boolean> | boolean;

export class Orchestrator {
  private approved = new Set<string>();
  constructor(private runtime: Runtime, private gate?: ApprovalGate) {}

  approve(runId: string, stepId: string) { this.approved.add(`${runId}:${stepId}`); }

  private async isApproved(runId: string, stepId: string) {
    return this.approved.has(`${runId}:${stepId}`) || (this.gate ? await this.gate(runId, stepId) : false);
  }

  /** Runs from `from`; resumable — call again with the returned `next` once the blocker is resolved. */
  async run(wf: Workflow, ctx: Ctx, from = 0): Promise<RunResult> {
    for (let i = from; i < wf.steps.length; i++) {
      const s = wf.steps[i]!;
      if (s.approval && !(await this.isApproved(ctx.runId, s.id))) return { state: "waiting-approval", next: i };
      let out = "", tries = 0;
      do { out = await this.runtime.execute(s, ctx); tries++; } while (out === "error" && tries <= (s.retries ?? 0));
      if (out === "denied") return { state: "denied", next: i };
      if (out.startsWith("waiting:")) return { state: "waiting", next: i, reason: out.slice(8) };
      if (out.startsWith("blocked")) return { state: "blocked", next: i };
      if (out === "error") return { state: "failed", next: i };
    }
    return { state: "completed" };
  }
}
