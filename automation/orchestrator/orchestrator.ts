import { Workflow } from "../workflow-os/types";
import { Runtime, Ctx } from "../runtime/runtime";

export type RunState = "completed" | "waiting-approval" | "blocked" | "denied" | "failed";

export class Orchestrator {
  private approved = new Set<string>();
  constructor(private runtime: Runtime) {}

  approve(runId: string, stepId: string) { this.approved.add(`${runId}:${stepId}`); }

  async run(wf: Workflow, ctx: Ctx, from = 0): Promise<{ state: RunState; next?: number }> {
    for (let i = from; i < wf.steps.length; i++) {
      const s = wf.steps[i];
      if (s.approval && !this.approved.has(`${ctx.runId}:${s.id}`)) return { state: "waiting-approval", next: i };
      let out = "", tries = 0;
      do { out = await this.runtime.execute(s, ctx); tries++; } while (out === "error" && tries <= (s.retries ?? 0));
      if (out === "denied") return { state: "denied", next: i };
      if (out.startsWith("blocked")) return { state: "blocked", next: i };
      if (out === "error") return { state: "failed", next: i };
    }
    return { state: "completed" };
  }
}
