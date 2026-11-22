"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_COMMUNITY_COOKIE, requireAdmin, requireUser } from "@/lib/session";
import { affiliationRequestSchema, fieldErrors, inviteCodeSchema, redeemCodeSchema } from "@/lib/validation";
import { friendlyError, type ActionState } from "@/lib/errors";
import { env } from "@/lib/env";

const uuid = z.string().uuid();
const note = (f: FormData, k = "note") => z.string().trim().max(1000).optional().parse(f.get(k) || undefined) ?? null;

// Affiliations ---------------------------------------------------------------
export async function requestAffiliation(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("community.manage");
  const parsed = affiliationRequestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).rpc("request_affiliation", {
    p_community_id: parsed.data.community_id, p_institution_id: parsed.data.institution_id, p_message: parsed.data.message,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Request sent. The institution's admins will review it." };
}

export async function decideAffiliation(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const { error } = await (await createClient()).rpc("decide_affiliation", {
    p_affiliation_id: uuid.parse(form.get("id")), p_approve: form.get("decision") === "approve", p_note: note(form),
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: form.get("decision") === "approve" ? "Affiliation approved — the class is now part of your network." : "Request declined." };
}

export async function revokeAffiliation(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const reason = z.string().trim().min(3).max(1000).safeParse(form.get("reason"));
  if (!reason.success) return { error: "Give a reason (at least 3 characters)." };
  const { error } = await (await createClient()).rpc("revoke_affiliation", { p_affiliation_id: uuid.parse(form.get("id")), p_reason: reason.data });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Affiliation ended." };
}

// Invitation codes -------------------------------------------------------------
export async function createInviteCode(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireAdmin("member.invite");
  if (ctx.current.scope_type !== "community") return { error: "Choose a community first." };
  const parsed = inviteCodeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const { data, error } = await (await createClient()).rpc("create_invite_code", {
    p_community_id: ctx.current.scope_id, p_label: d.label, p_auto_approve: d.auto_approve, p_max_uses: d.max_uses, p_expires_in_days: d.expires_in_days,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/admin/members");
  return { ok: true, message: `Code ${data} created. Share it, or the link ${env.siteUrl}/join/${data}` };
}

export async function revokeInviteCode(form: FormData) {
  await requireAdmin("member.invite");
  await (await createClient()).rpc("revoke_invite_code", { p_code_id: uuid.parse(form.get("id")) });
  revalidatePath("/admin/members");
}

type Redeem = { status: "joined" | "requested" | "already_member" | "already_redeemed" | "invalid"; slug?: string; community?: string; community_id?: string };

export async function redeemInviteCode(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = redeemCodeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { data, error } = await (await createClient()).rpc("redeem_invite_code", { p_code: parsed.data.code });
  if (error) return { error: friendlyError(error) };
  const r = data as Redeem;
  if (r.status === "invalid") return { error: "That code is invalid, expired or fully used. Check with the person who shared it." };
  revalidatePath("/app", "layout");
  if (r.status === "joined" || r.status === "already_member") {
    (await cookies()).set(ACTIVE_COMMUNITY_COOKIE, r.community_id!, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
    redirect("/app/dashboard");
  }
  return { ok: true, message: r.status === "requested"
    ? `Request sent to ${r.community}. Class leaders will verify you shortly.`
    : `You've already used this code for ${r.community}.` };
}
