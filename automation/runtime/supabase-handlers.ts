import { Denied, Waiting, type Ctx, type Handler } from "./runtime";

/**
 * Supabase-backed handlers for EVERY step in workflow-os/definitions.ts (tests/workflow-parity.test.ts enforces coverage).
 * Each handler is idempotent "check-or-do": it performs the step when the actor may, verifies it when it already happened,
 * and throws Waiting/Denied when the step depends on someone else. It runs with the actor's own session client, so the
 * database re-authorizes every action; the same state changes also advance the durable run in Postgres (migration 0720).
 */
type Result<T = unknown> = PromiseLike<{ data: T; error: { code?: string; message?: string } | null }>;
// Minimal structural client so the runtime stays testable without the full Supabase types.
export type AutomationClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Result;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
  auth: {
    signUp: (a: { email: string; password: string; options?: Record<string, unknown> }) => Result<{ user: { id: string } | null }>;
    getUser: () => Result<{ user: { id: string; email_confirmed_at?: string | null } | null }>;
  };
};
/** @deprecated kept for older imports */
export type RpcClient = AutomationClient;

const need = <T>(ctx: Ctx, key: string): T => {
  const v = ctx.data[key];
  if (v === undefined || v === null) throw new Error(`missing input: ${key}`);
  return v as T;
};
const ok = <T>(r: { data: T; error: { message?: string; code?: string } | null }, what: string) => {
  if (r.error) throw Object.assign(new Error(r.error.message ?? what), { code: r.error.code });
  return r.data;
};
const call = async (c: AutomationClient, fn: string, args: Record<string, unknown>) => ok(await c.rpc(fn, args), fn);
const one = async <T>(q: PromiseLike<{ data: T; error: unknown }>, what: string) => ok((await q) as { data: T; error: null }, what);

export function createSupabaseHandlers(client: AutomationClient): Record<string, Handler> {
  const updateProfile = async (ctx: Ctx, fields: string[], fixed: Record<string, unknown> = {}) => {
    const row = Object.fromEntries(fields.filter((f) => f in ctx.data).map((f) => [f, ctx.data[f]]));
    await one(client.from("profiles").update({ ...row, ...fixed }).eq("id", need(ctx, "userId")), "profiles.update");
  };

  return {
    // A · Membership --------------------------------------------------------------
    "auth.register": async (ctx) => {
      const { data } = await client.auth.getUser();
      if (data?.user) { ctx.data.userId = data.user.id; return; }           // already signed in
      const r = ok(await client.auth.signUp({ email: need(ctx, "email"), password: need(ctx, "password"),
        options: { data: { full_name: ctx.data.fullName ?? "" }, emailRedirectTo: ctx.data.redirectTo } }), "auth.signUp");
      ctx.data.userId = r.user?.id;
    },
    "auth.verifyEmail": async (ctx) => {
      const { data } = await client.auth.getUser();
      if (!data?.user) throw new Waiting("sign in after confirming your email");
      if (!data.user.email_confirmed_at) throw new Waiting("email confirmation link not yet clicked");
      ctx.data.userId = data.user.id;
    },
    "community.find": async (ctx) => {
      ctx.data.communities = await call(client, "search_communities", {
        p_institution: ctx.data.institution ?? null, p_department: ctx.data.department ?? null, p_year: ctx.data.year ?? null,
      });
    },
    "membership.apply": async (ctx) => {
      ctx.data.requestId = await call(client, "apply_for_membership", {
        p_community_id: ctx.scopeId, p_name_at_graduation: need(ctx, "nameAtGraduation"),
        p_student_identifier: ctx.data.studentIdentifier ?? null, p_note: ctx.data.note ?? null,
      });
    },
    // Review is the human gate: it waits until a leader decides (or decides now if the actor is a reviewer with a decision).
    "membership.review": async (ctx) => {
      const req = await one<{ status: string } | null>(client.from("membership_requests").select("status").eq("id", need(ctx, "requestId")).maybeSingle(), "membership_requests");
      if (req?.status === "pending") {
        if (ctx.data.approve !== undefined && ctx.actor.permissions.has("membership.approve")) return;  // decided in the next step
        throw new Waiting("awaiting class leader review");
      }
      if (req?.status === "rejected") throw new Denied("membership request was not approved");
      if (req?.status === "withdrawn") throw new Denied("request withdrawn");
    },
    "membership.approve": async (ctx) => {
      const req = await one<{ status: string } | null>(client.from("membership_requests").select("status").eq("id", need(ctx, "requestId")).maybeSingle(), "membership_requests");
      if (req?.status === "approved") return;
      await call(client, "review_membership_request", { p_request_id: need(ctx, "requestId"), p_approve: ctx.data.approve !== false, p_note: ctx.data.note ?? null });
      if (ctx.data.approve === false) throw new Denied("rejected by reviewer");
    },
    "member.openDashboard": async (ctx) => { await call(client, "workflow_touch_dashboard", { p_community_id: ctx.scopeId }); },

    // B · Profile -------------------------------------------------------------------
    "profile.create": async (ctx) => {
      const p = await one<{ id: string } | null>(client.from("profiles").select("id").eq("id", need(ctx, "userId")).maybeSingle(), "profiles");
      if (!p) throw new Waiting("profile is created when the account is confirmed");
    },
    "profile.addAcademic": async (ctx) => updateProfile(ctx, ["name_at_graduation"]),
    "profile.addCareer": async (ctx) => updateProfile(ctx, ["profession", "industry", "employer", "job_title", "headline"]),
    "profile.setPrivacy": async (ctx) => {
      await updateProfile(ctx, ["visibility", "directory_listed"]);
      await call(client, "workflow_mark_privacy_reviewed", {});
    },
    "profile.publish": async (ctx) => updateProfile(ctx, ["directory_listed"], { directory_listed: true }),

    // C · Business --------------------------------------------------------------------
    "business.create": async (ctx) => {
      const r = await one<{ id: string }>(client.from("businesses").insert({ community_id: ctx.scopeId, name: need(ctx, "businessName") }).select("id").single(), "businesses.insert");
      ctx.data.businessId = r.id;
    },
    "business.addServices": async (ctx) => {
      await one(client.from("businesses").update({ services: ctx.data.services ?? [] }).eq("id", need(ctx, "businessId")), "businesses.update");
    },
    "business.submit": async (ctx) => { await call(client, "submit_business", { p_business_id: need(ctx, "businessId") }); },
    "business.review": async (ctx) => {
      if (ctx.data.decision && ctx.actor.permissions.has("business.review")) {
        await call(client, "review_business", { p_business_id: need(ctx, "businessId"), p_decision: ctx.data.decision, p_note: ctx.data.note ?? null, p_owner_verified: Boolean(ctx.data.ownerVerified) });
      }
      const b = await one<{ status: string } | null>(client.from("businesses").select("status").eq("id", need(ctx, "businessId")).maybeSingle(), "businesses");
      if (b?.status === "submitted") throw new Waiting("awaiting business review");
      if (b?.status === "rejected" || b?.status === "suspended") throw new Denied(`listing ${b.status}`);
    },
    "business.list": async (ctx) => {
      const b = await one<{ status: string } | null>(client.from("businesses").select("status").eq("id", need(ctx, "businessId")).maybeSingle(), "businesses");
      if (b?.status !== "approved") throw new Waiting("listing not yet approved");
    },

    // D · Events ------------------------------------------------------------------------
    "event.create": async (ctx) => {
      const r = await one<{ id: string }>(client.from("events").insert({ community_id: ctx.scopeId, title: need(ctx, "title"), starts_at: need(ctx, "startsAt"), status: "draft" }).select("id").single(), "events.insert");
      ctx.data.eventId = r.id;
    },
    "event.publish": async (ctx) => {
      await one(client.from("events").update({ status: "published" }).eq("id", need(ctx, "eventId")), "events.update");
    },
    "event.rsvp": async (ctx) => {
      await one(client.from("event_rsvps").upsert({ event_id: need(ctx, "eventId"), status: ctx.data.rsvp ?? "going" }, { onConflict: "event_id,user_id" }), "event_rsvps.upsert");
    },
    "event.trackAttendance": async (ctx) => {
      await call(client, "mark_attendance", { p_event_id: need(ctx, "eventId"), p_user_id: need(ctx, "userId"), p_attended: true });
    },

    // E · Administration --------------------------------------------------------------------
    "community.verify": async (ctx) => { await call(client, "update_community", { p_community_id: ctx.scopeId, p_status: "active" }); },
    "role.assign": async (ctx) => {
      ctx.data.assignment = await call(client, "assign_role", {
        p_user_id: need(ctx, "userId"), p_role_key: ctx.data.roleKey ?? "class_admin", p_scope_type: "community", p_scope_id: ctx.scopeId, p_reason: ctx.data.reason ?? null,
      });
      const status = (ctx.data.assignment as { status?: string } | undefined)?.status;
      if (status === "pending_approval") throw new Waiting("awaiting independent approval");
    },
    // Handover completes when the class admin performs a first leadership action (recorded by the DB workflow engine).
    "community.handover": async (ctx) => {
      const runs = await one<{ id: string }[]>(client.from("workflow_runs").select("id").eq("workflow_id", "E-administration").eq("subject_id", ctx.scopeId), "workflow_runs");
      const runId = runs?.[0]?.id;
      if (!runId) throw new Waiting("community not yet verified");
      const steps = await one<{ step_id: string; outcome: string }[]>(client.from("workflow_run_steps").select("step_id, outcome").eq("run_id", runId), "workflow_run_steps");
      if (!steps.some((s) => s.step_id === "manage" && s.outcome === "completed")) throw new Waiting("class admin has not taken a first leadership action yet");
    },
  };
}

/** DB-backed approval gate for the orchestrator: a gate step counts as approved once Postgres recorded it completed. */
export function dbApprovalGate(client: AutomationClient, workflowId: string, subjectId: string) {
  return async (_runId: string, stepId: string) => {
    const runs = await one<{ id: string }[]>(client.from("workflow_runs").select("id").eq("workflow_id", workflowId).eq("subject_id", subjectId), "workflow_runs");
    if (!runs?.[0]) return false;
    const steps = await one<{ step_id: string; outcome: string }[]>(client.from("workflow_run_steps").select("step_id, outcome").eq("run_id", runs[0].id), "workflow_run_steps");
    return steps.some((s) => s.step_id === stepId && s.outcome === "completed");
  };
}

/** Load the actor's live permissions for the runtime's pre-check (the DB still re-checks). */
export async function loadPermissions(client: AutomationClient, scopeType: "platform" | "institution" | "community", scopeId: string | null) {
  const data = await call(client, "my_permissions", { p_scope_type: scopeType, p_scope_id: scopeId });
  return new Set<string>((data as string[] | null) ?? []);
}
