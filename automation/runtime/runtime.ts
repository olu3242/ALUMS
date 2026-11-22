import { Step } from "../workflow-os/types";

export type Ctx = {
  runId: string;
  actor: { id: string; permissions: Set<string> };
  scopeId: string;                       // community / institution id; never cross scopes
  data: Record<string, unknown>;
  audit: { at: string; step: string; actor: string; outcome: string }[];
};
export type Handler = (ctx: Ctx) => Promise<void>;

export class Runtime {
  constructor(private handlers: Record<string, Handler>) {}

  async execute(step: Step, ctx: Ctx): Promise<string> {
    if (step.permission && !ctx.actor.permissions.has(step.permission)) return this.log(ctx, step, "denied");
    const h = this.handlers[step.handler];
    if (!h) return this.log(ctx, step, "blocked:no-handler");   // never fake success
    try { await h(ctx); return this.log(ctx, step, "ok"); }
    catch { return this.log(ctx, step, "error"); }
  }
  private log(ctx: Ctx, step: Step, outcome: string) {
    ctx.audit.push({ at: new Date().toISOString(), step: step.id, actor: ctx.actor.id, outcome });
    return outcome;
  }
}
