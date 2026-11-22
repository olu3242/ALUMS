import { describe, expect, it } from "vitest";
import { Runtime, type Ctx, type Handler } from "@/automation/runtime/runtime";
import { Orchestrator } from "@/automation/orchestrator/orchestrator";
import { workflows } from "@/automation/workflow-os/definitions";
import { createSupabaseHandlers, type RpcClient } from "@/automation/runtime/supabase-handlers";
import type { Workflow } from "@/automation/workflow-os/types";

const ctx = (perms: string[] = [], data: Record<string, unknown> = {}): Ctx =>
  ({ runId: "r1", actor: { id: "u1", permissions: new Set(perms) }, scopeId: "c1", data, audit: [] });

describe("Workflow OS definitions", () => {
  it("defines workflows A–E with unique step ids", () => {
    expect(workflows.map((w) => w.id)).toEqual(["A-membership", "B-profile", "C-business", "D-events", "E-administration"]);
    for (const w of workflows) expect(new Set(w.steps.map((s) => s.id)).size).toBe(w.steps.length);
  });
  it("gates every review/approval step behind a permission", () => {
    for (const w of workflows) for (const s of w.steps) if (s.approval) expect(s.permission).toBeTruthy();
  });
});

describe("Runtime", () => {
  it("denies when the actor lacks the step permission, and audits it", async () => {
    const rt = new Runtime({ x: async () => {} });
    const c = ctx();
    expect(await rt.execute({ id: "s", handler: "x", permission: "membership.approve" }, c)).toBe("denied");
    expect(c.audit[0]).toMatchObject({ step: "s", outcome: "denied", actor: "u1" });
  });
  it("reports BLOCKED (never success) for a missing handler", async () => {
    expect(await new Runtime({}).execute({ id: "s", handler: "nope" }, ctx())).toBe("blocked:no-handler");
  });
  it("captures handler errors", async () => {
    const boom: Handler = async () => { throw new Error("x"); };
    expect(await new Runtime({ boom }).execute({ id: "s", handler: "boom" }, ctx())).toBe("error");
  });
});

describe("Orchestrator", () => {
  const wf: Workflow = { id: "t", name: "t", scope: "community", steps: [
    { id: "a", handler: "ok" }, { id: "gate", handler: "ok", permission: "p", approval: { role: "class_admin" } }, { id: "c", handler: "flaky", retries: 2 },
  ] };
  it("pauses at approval gates and resumes after approval", async () => {
    let n = 0;
    const o = new Orchestrator(new Runtime({ ok: async () => {}, flaky: async () => { if (++n < 3) throw new Error("transient"); } }));
    const c = ctx(["p"]);
    expect(await o.run(wf, c)).toEqual({ state: "waiting-approval", next: 1 });
    o.approve("r1", "gate");
    expect(await o.run(wf, c, 1)).toEqual({ state: "completed" });
    expect(n).toBe(3); // retried twice
  });
  it("fails after retries are exhausted", async () => {
    const o = new Orchestrator(new Runtime({ ok: async () => {}, flaky: async () => { throw new Error("down"); } }));
    o.approve("r1", "gate");
    expect(await o.run(wf, ctx(["p"]))).toEqual({ state: "failed", next: 2 });
  });
});

describe("Supabase handlers", () => {
  const fake = (errors: Record<string, { code: string; message: string }> = {}) => {
    const calls: [string, unknown][] = [];
    const client: RpcClient = {
      rpc: async (fn, args) => { calls.push([fn, args]); return { data: fn === "apply_for_membership" ? "req-1" : null, error: errors[fn] ?? null }; },
      from: () => ({ insert: () => ({ select: () => ({ single: async () => ({ data: { id: "new" }, error: null }) }) }), update: () => ({ eq: async () => ({ error: null }) }) }),
    };
    return { client, calls };
  };
  it("routes membership.apply to the RPC with the workflow scope", async () => {
    const { client, calls } = fake();
    const c = ctx([], { nameAtGraduation: "Ada" });
    await createSupabaseHandlers(client)["membership.apply"]!(c);
    expect(calls[0]).toEqual(["apply_for_membership", { p_community_id: "c1", p_name_at_graduation: "Ada", p_student_identifier: null, p_note: null }]);
    expect(c.data.requestId).toBe("req-1");
  });
  it("surfaces database authorization errors as step errors", async () => {
    const { client } = fake({ review_membership_request: { code: "42501", message: "not authorized" } });
    const rt = new Runtime(createSupabaseHandlers(client));
    expect(await rt.execute({ id: "approve", handler: "membership.approve" }, ctx([], { requestId: "r" }))).toBe("error");
  });
  it("leaves UI-only steps unhandled so they report BLOCKED", () => {
    const h = createSupabaseHandlers(fake().client);
    expect(h["auth.register"]).toBeUndefined();
    expect(h["member.openDashboard"]).toBeUndefined();
  });
});
