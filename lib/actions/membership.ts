"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ACTIVE_COMMUNITY_COOKIE, getViewer, requireUser } from "@/lib/session";
import { applySchema, communityRequestSchema, fieldErrors } from "@/lib/validation";
import { friendlyError, type ActionState } from "@/lib/errors";
import { z } from "zod";

export async function applyForMembership(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = applySchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).rpc("apply_for_membership", {
    p_community_id: parsed.data.community_id, p_name_at_graduation: parsed.data.name_at_graduation,
    p_student_identifier: parsed.data.student_identifier, p_note: parsed.data.note,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app/my-classes");
  return { ok: true, message: "Request sent. Class leaders will review it and you'll be notified." };
}

export async function withdrawRequest(form: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(form.get("id"));
  await (await createClient()).rpc("withdraw_membership_request", { p_request_id: id });
  revalidatePath("/app/my-classes");
}

export async function switchCommunity(form: FormData) {
  const { activeMemberships } = await getViewer();
  const id = z.string().uuid().parse(form.get("community_id"));
  if (!activeMemberships.some((m) => m.community_id === id)) redirect("/app/my-classes");
  (await cookies()).set(ACTIVE_COMMUNITY_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect(String(form.get("next") ?? "/app/dashboard").startsWith("/app") ? String(form.get("next")) : "/app/dashboard");
}

export async function leaveCommunity(form: FormData) {
  await requireUser();
  const id = z.string().uuid().parse(form.get("community_id"));
  await (await createClient()).rpc("leave_community", { p_community_id: id });
  revalidatePath("/app", "layout");
  redirect("/app/my-classes");
}

export async function requestCommunity(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = communityRequestSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).rpc("request_community", {
    p_institution_name: parsed.data.institution_name, p_department_name: parsed.data.department_name,
    p_graduation_year: parsed.data.graduation_year, p_note: parsed.data.note,
  });
  if (error) return { error: friendlyError(error) };
  return { ok: true, message: "Thanks — the ALUMS team will review your request and invite a class leader to verify it." };
}

export async function acceptInvitation(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const token = z.string().regex(/^[a-f0-9]{48}$/).safeParse(form.get("token"));
  if (!token.success) return { error: "This invitation link is malformed." };
  const { data, error } = await (await createClient()).rpc("accept_invitation", { p_token: token.data });
  if (error) return { error: friendlyError(error) };
  (await cookies()).set(ACTIVE_COMMUNITY_COOKIE, data as string, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  redirect("/app/dashboard");
}
