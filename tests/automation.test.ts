import { describe, expect, it } from "vitest";
import { Runtime, type Ctx, type Handler } from "@/automation/runtime/runtime";
import { Orchestrator } from "@/automation/orchestrator/orchestrator";
import { workflows } from "@/automation/workflow-os/definitions";
import { createSupabaseHandlers, dbApprovalGate, type AutomationClient } from "@/automation/runtime/supabase-handlers";
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
  type Row = Record<string, unknown>;
  // Tiny fake of the Supabase client: rpc results, table rows and auth state are scripted per test.
  const fake = (opts: { rpc?: Record<string, { data?: unknown; error?: { code: string; message: string } }>; tables?: Record<string, Row[]>; user?: Row | null } = {}) => {
    const calls: [string, unknown][] = [];
    const builder = (table: string) => {
      let rows = opts.tables?.[table] ?? [];
      const q = {
        select: () => q, eq: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return q; },
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }), single: async () => ({ data: rows[0] ?? { id: "new" }, error: null }),
        insert: () => q, update: () => q, upsert: () => q,
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
      };
      return q;
    };
    const client: AutomationClient = {
      rpc: async (fn, args) => { calls.push([fn, args]); const r = opts.rpc?.[fn]; return { data: r?.data ?? null, error: r?.error ?? null }; },
      from: builder,
      auth: {
        signUp: async () => ({ data: { user: { id: "new-user" } }, error: null }),
        getUser: async () => ({ data: { user: (opts.user ?? null) as never }, error: null }),
      },
    };
    return { client, calls };
  };
  it("implements a handler for every step in every workflow", () => {
    const h = createSupabaseHandlers(fake().client);
    for (const w of workflows) for (const s of w.steps) expect(h[s.handler], `${w.id}/${s.id}`).toBeTypeOf("function");
  });
  it("routes membership.apply to the RPC with the workflow scope", async () => {
    const { client, calls } = fake({ rpc: { apply_for_membership: { data: "req-1" } } });
    const c = ctx([], { nameAtGraduation: "Ada" });
    await createSupabaseHandlers(client)["membership.apply"]!(c);
    expect(calls[0]).toEqual(["apply_for_membership", { p_community_id: "c1", p_name_at_graduation: "Ada", p_student_identifier: null, p_note: null }]);
    expect(c.data.requestId).toBe("req-1");
  });
  it("waits for email confirmation, then proceeds", async () => {
    const rt = (u: Row | null) => new Runtime(createSupabaseHandlers(fake({ user: u }).client));
    expect(await rt(null).execute({ id: "verify-email", handler: "auth.verifyEmail" }, ctx())).toBe("waiting:sign in after confirming your email");
    expect(await rt({ id: "u", email_confirmed_at: null }).execute({ id: "verify-email", handler: "auth.verifyEmail" }, ctx())).toMatch(/^waiting:/);
    expect(await rt({ id: "u", email_confirmed_at: "2026-01-01" }).execute({ id: "verify-email", handler: "auth.verifyEmail" }, ctx())).toBe("ok");
  });
  it("review gate reflects the real request state", async () => {
    const run = (status: string) => new Runtime(createSupabaseHandlers(fake({ tables: { membership_requests: [{ id: "r", status }] } }).client))
      .execute({ id: "review", handler: "membership.review" }, ctx([], { requestId: "r" }));
    expect(await run("pending")).toBe("waiting:awaiting class leader review");
    expect(await run("approved")).toBe("ok");
    expect(await run("rejected")).toBe("denied");
  });
  it("orchestrator pauses on waiting steps and resumes", async () => {
    const wf = workflows.find((w) => w.id === "A-membership")!;
    let confirmed = false;
    const client = fake().client;
    client.auth.getUser = async () => ({ data: { user: { id: "u", email_confirmed_at: confirmed ? "now" : null } }, error: null });
    const o = new Orchestrator(new Runtime(createSupabaseHandlers(client)));
    const c = ctx([], {});
    const first = await o.run(wf, c);
    expect(first).toMatchObject({ state: "waiting", next: 1 });
    confirmed = true;
    expect((await o.run(wf, c, first.next)).next).toBe(3); // proceeds past verify-email & find-class, fails apply (no name)
  });
  it("durable approval gate reads completed steps from the database", async () => {
    const client = fake({ tables: { workflow_runs: [{ id: "run1", workflow_id: "C-business", subject_id: "b1" }],
      workflow_run_steps: [{ run_id: "run1", step_id: "review", outcome: "completed" }] } }).client;
    const gate = dbApprovalGate(client, "C-business", "b1");
    expect(await gate("x", "review")).toBe(true);
    expect(await gate("x", "list")).toBe(false);
  });
  it("surfaces database authorization errors as step errors", async () => {
    const { client } = fake({ rpc: { review_membership_request: { error: { code: "42501", message: "not authorized" } } } });
    const rt = new Runtime(createSupabaseHandlers(client));
    expect(await rt.execute({ id: "approve", handler: "membership.approve" }, ctx([], { requestId: "r" }))).toBe("error");
  });
});
