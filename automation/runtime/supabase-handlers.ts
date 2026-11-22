import type { Ctx, Handler } from "./runtime";

/**
 * Supabase-backed handlers (Stage 6). Each maps a workflow step to the same SECURITY DEFINER RPC or RLS-guarded
 * table write the app uses, executed with the *actor's own* session client — so the database re-authorizes every step.
 * UI-only steps (auth.register, auth.verifyEmail, member.openDashboard) are intentionally absent → runtime reports BLOCKED.
 */
export type RpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => { select: (cols: string) => { single: () => PromiseLike<{ data: unknown; error: unknown }> } };
    update: (row: Record<string, unknown>) => { eq: (col: string, v: unknown) => PromiseLike<{ error: unknown }> };
  };
};

const need = <T>(ctx: Ctx, key: string): T => {
  const v = ctx.data[key];
  if (v === undefined || v === null) throw new Error(`missing input: ${key}`);
  return v as T;
};
const call = async (client: RpcClient, fn: string, args: Record<string, unknown>) => {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw Object.assign(new Error(error.message ?? fn), { code: error.code });
  return data;
};

export function createSupabaseHandlers(client: RpcClient): Record<string, Handler> {
  return {
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
    // Review is the human gate (orchestrator approval); approve performs the decision.
    "membership.review": async (ctx) => { need<string>(ctx, "requestId"); },
    "membership.approve": async (ctx) => {
      await call(client, "review_membership_request", { p_request_id: need(ctx, "requestId"), p_approve: ctx.data.approve !== false, p_note: ctx.data.note ?? null });
    },
    "profile.create": async (ctx) => { need<string>(ctx, "userId"); }, // created by the auth trigger
    "profile.addAcademic": async (ctx) => updateProfile(client, ctx, ["name_at_graduation"]),
    "profile.addCareer": async (ctx) => updateProfile(client, ctx, ["profession", "industry", "employer", "job_title", "headline"]),
    "profile.setPrivacy": async (ctx) => updateProfile(client, ctx, ["visibility", "directory_listed"]),
    "profile.publish": async (ctx) => updateProfile(client, ctx, ["directory_listed"], { directory_listed: true }),
    "business.create": async (ctx) => {
      const { data, error } = await client.from("businesses").insert({ community_id: ctx.scopeId, name: need(ctx, "businessName") }).select("id").single();
      if (error) throw error;
      ctx.data.businessId = (data as { id: string }).id;
    },
    "business.addServices": async (ctx) => {
      const { error } = await client.from("businesses").update({ services: ctx.data.services ?? [] }).eq("id", need(ctx, "businessId"));
      if (error) throw error;
    },
    "business.submit": async (ctx) => { await call(client, "submit_business", { p_business_id: need(ctx, "businessId") }); },
    "business.review": async (ctx) => {
      await call(client, "review_business", { p_business_id: need(ctx, "businessId"), p_decision: ctx.data.decision ?? "approve", p_note: ctx.data.note ?? null, p_owner_verified: Boolean(ctx.data.ownerVerified) });
    },
    "business.list": async () => {},
    "event.create": async (ctx) => {
      const { data, error } = await client.from("events").insert({
        community_id: ctx.scopeId, title: need(ctx, "title"), starts_at: need(ctx, "startsAt"), status: "draft",
      }).select("id").single();
      if (error) throw error;
      ctx.data.eventId = (data as { id: string }).id;
    },
    "event.publish": async (ctx) => {
      const { error } = await client.from("events").update({ status: "published" }).eq("id", need(ctx, "eventId"));
      if (error) throw error;
    },
    "event.trackAttendance": async (ctx) => {
      await call(client, "mark_attendance", { p_event_id: need(ctx, "eventId"), p_user_id: need(ctx, "userId"), p_attended: true });
    },
    "community.verify": async (ctx) => { await call(client, "update_community", { p_community_id: ctx.scopeId, p_status: "active" }); },
    "role.assign": async (ctx) => {
      ctx.data.assignment = await call(client, "assign_role", {
        p_user_id: need(ctx, "userId"), p_role_key: need(ctx, "roleKey"), p_scope_type: "community", p_scope_id: ctx.scopeId, p_reason: ctx.data.reason ?? null,
      });
    },
  };
}

async function updateProfile(client: RpcClient, ctx: Ctx, fields: string[], fixed: Record<string, unknown> = {}) {
  const row = Object.fromEntries(fields.filter((f) => f in ctx.data).map((f) => [f, ctx.data[f]]));
  const { error } = await client.from("profiles").update({ ...row, ...fixed }).eq("id", need(ctx, "userId"));
  if (error) throw error;
}

/** Load the actor's live permissions for the runtime's pre-check (the DB still re-checks). */
export async function loadPermissions(client: RpcClient, scopeType: "platform" | "institution" | "community", scopeId: string | null) {
  const data = await call(client, "my_permissions", { p_scope_type: scopeType, p_scope_id: scopeId });
  return new Set<string>((data as string[] | null) ?? []);
}
