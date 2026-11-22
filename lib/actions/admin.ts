"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_SCOPE_COOKIE, getAdminContext, requireAdmin } from "@/lib/session";
import { assignRoleSchema, createCommunitySchema, fieldErrors, institutionSchema } from "@/lib/validation";
import { friendlyError, type ActionState } from "@/lib/errors";
import { env } from "@/lib/env";

// Every action below is re-authorized inside Postgres; requireAdmin() only short-circuits obvious misses.
const uuid = z.string().uuid();
const note = (f: FormData) => z.string().trim().max(1000).optional().parse(f.get("note") || undefined) ?? null;
const done = (msg: string): ActionState => { revalidatePath("/admin", "layout"); return { ok: true, message: msg }; };

export async function setAdminScope(form: FormData) {
  const ctx = await getAdminContext();
  const v = z.string().regex(/^(platform:|institution:[0-9a-f-]{36}|community:[0-9a-f-]{36})$/).safeParse(form.get("scope"));
  if (ctx && v.success) (await cookies()).set(ADMIN_SCOPE_COOKIE, v.data, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/admin" });
  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/admin/") ? next : "/admin/dashboard");
}

export async function reviewMembership(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const { error } = await (await createClient()).rpc("review_membership_request", {
    p_request_id: uuid.parse(form.get("id")), p_approve: form.get("decision") === "approve", p_note: note(form),
  });
  return error ? { error: friendlyError(error) } : done(form.get("decision") === "approve" ? "Member verified and notified." : "Request declined.");
}

export async function setMemberStatus(form: FormData) {
  await requireAdmin("member.suspend");
  await (await createClient()).rpc("set_membership_status", {
    p_membership_id: uuid.parse(form.get("id")), p_status: z.enum(["active", "suspended"]).parse(form.get("status")), p_reason: note(form),
  });
  revalidatePath("/admin/members");
}

export async function inviteMember(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireAdmin("member.invite");
  if (ctx.current.scope_type !== "community") return { error: "Choose a community first." };
  const email = z.string().trim().toLowerCase().email().safeParse(form.get("email"));
  if (!email.success) return { error: "Enter a valid email address." };
  const { data, error } = await (await createClient()).rpc("create_invitation", { p_community_id: ctx.current.scope_id, p_email: email.data });
  if (error) return { error: friendlyError(error) };
  // Email delivery is not wired yet (needs an email provider); the link is shown once for the leader to share.
  return { ok: true, message: `Invitation created for ${email.data}. Share this one-time link (valid 14 days): ${env.siteUrl}/invite/${data}` };
}

export async function assignRole(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("role.assign");
  const parsed = assignRoleSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const { data, error } = await (await createClient()).rpc("assign_role", {
    p_user_id: d.user_id, p_role_key: d.role_key, p_scope_type: d.scope_type, p_scope_id: d.scope_id ?? null, p_reason: d.reason,
  });
  if (error) return { error: friendlyError(error) };
  const status = (data as { status: string }).status;
  revalidatePath("/admin/roles");
  return { ok: true, message: status === "active" ? "Role assigned. The member has been notified." : "Approval requested. An independent approver must confirm before the role takes effect." };
}

export async function revokeRole(form: FormData) {
  await requireAdmin();
  await (await createClient()).rpc("revoke_role", { p_assignment_id: uuid.parse(form.get("id")), p_reason: note(form) });
  revalidatePath("/admin/roles");
}

export async function decideApproval(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const { error } = await (await createClient()).rpc("decide_approval", {
    p_request_id: uuid.parse(form.get("id")), p_approve: form.get("decision") === "approve", p_note: note(form),
  });
  return error ? { error: friendlyError(error) } : done("Decision recorded.");
}

export async function reviewBusiness(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const { error } = await (await createClient()).rpc("review_business", {
    p_business_id: uuid.parse(form.get("id")), p_decision: z.enum(["approve", "reject", "suspend"]).parse(form.get("decision")),
    p_note: note(form), p_owner_verified: form.get("owner_verified") === "on",
  });
  return error ? { error: friendlyError(error) } : done("Listing updated and owner notified.");
}

export async function resolveReport(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("moderation.resolve");
  const { error } = await (await createClient()).rpc("resolve_report", {
    p_report_id: uuid.parse(form.get("id")), p_status: z.enum(["actioned", "dismissed"]).parse(form.get("status")), p_note: note(form),
  });
  return error ? { error: friendlyError(error) } : done("Report resolved.");
}

export async function createCommunity(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = createCommunitySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const { error } = await (await createClient()).rpc("create_community", {
    p_department_name: d.department_name, p_graduation_year: d.graduation_year, p_institution_id: d.institution_id ?? null,
    p_name: d.name, p_slug: null, p_description: d.description, p_activate: d.activate, p_request_id: d.request_id ?? null,
  });
  return error ? { error: friendlyError(error) } : done("Community created.");
}

export async function updateCommunity(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const status = z.enum(["pending_verification", "active", "archived", ""]).parse(form.get("status") ?? "");
  const description = z.string().trim().max(2000).optional().parse(form.get("description") || undefined) ?? null;
  const { error } = await (await createClient()).rpc("update_community", {
    p_community_id: uuid.parse(form.get("id")), p_description: description, p_status: status || null,
  });
  return error ? { error: friendlyError(error) } : done("Community updated.");
}

export async function resolveCommunityRequest(form: FormData) {
  await requireAdmin("community.create");
  await (await createClient()).rpc("resolve_community_request", { p_request_id: uuid.parse(form.get("id")), p_approve: false });
  revalidatePath("/admin/communities");
}

export async function createInstitution(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("institution.manage");
  const parsed = institutionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const { error } = await (await createClient()).rpc("create_institution", {
    p_name: d.name, p_country: d.country, p_city: d.city, p_website_url: d.website_url, p_verified: d.verified,
    p_directory_id: d.directory_id ?? null,
  });
  return error ? { error: friendlyError(error) } : done("Institution added.");
}

export async function setInstitutionStatus(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("institution.manage");
  const { error } = await (await createClient()).rpc("set_institution_status", {
    p_institution_id: uuid.parse(form.get("id")), p_status: z.enum(["unverified", "verified", "archived"]).parse(form.get("status")),
  });
  return error ? { error: friendlyError(error) } : done("Institution updated.");
}

export async function setPlatformSetting(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("platform.settings");
  const key = z.enum(["security.require_mfa_for_privileged"]).parse(form.get("key"));
  const { error } = await (await createClient()).rpc("set_platform_setting", { p_key: key, p_value: form.get("value") === "true" });
  return error ? { error: friendlyError(error) } : done("Setting saved.");
}
