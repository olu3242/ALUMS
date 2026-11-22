import { Step } from "../workflow-os/types";

export type Ctx = {
  runId: string;
  actor: { id: string; permissions: Set<string> };
  scopeId: string;                       // community / institution id; never cross scopes
  data: Record<string, unknown>;
  audit: { at: string; step: string; actor: string; outcome: string }[];
};
export type Handler = (ctx: Ctx) => Promise<void>;

/** Thrown by a handler when the step depends on something that hasn't happened yet (a human decision, an email click). */
export class Waiting extends Error { constructor(reason: string) { super(reason); this.name = "Waiting"; } }
/** Thrown when the step was decided negatively (e.g. a reviewer rejected the request). Terminal. */
export class Denied extends Error { constructor(reason: string) { super(reason); this.name = "Denied"; } }

export type Outcome = "ok" | "denied" | `blocked:${string}` | `waiting:${string}` | "error";

export class Runtime {
  constructor(private handlers: Record<string, Handler>) {}

  async execute(step: Step, ctx: Ctx): Promise<Outcome> {
    if (step.permission && !ctx.actor.permissions.has(step.permission)) return this.log(ctx, step, "denied");
    const h = this.handlers[step.handler];
    if (!h) return this.log(ctx, step, "blocked:no-handler");   // never fake success
    try { await h(ctx); return this.log(ctx, step, "ok"); }
    catch (e) {
      if (e instanceof Waiting) return this.log(ctx, step, `waiting:${e.message}`);
      if (e instanceof Denied) return this.log(ctx, step, "denied");
      return this.log(ctx, step, "error");
    }
  }
  private log<T extends Outcome>(ctx: Ctx, step: Step, outcome: T): T {
    ctx.audit.push({ at: new Date().toISOString(), step: step.id, actor: ctx.actor.id, outcome });
    return outcome;
  }
}
