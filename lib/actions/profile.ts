"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/session";
import { fieldErrors, locationSchema, PROFILE_FIELDS, profileSchema } from "@/lib/validation";
import { friendlyError, type ActionState } from "@/lib/errors";

export async function updateProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const raw = Object.fromEntries(form);
  const visibility = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, String(raw[`vis_${f}`] ?? "private")]));
  const parsed = profileSchema.safeParse({ ...raw, visibility });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).from("profiles").update(parsed.data).eq("id", user.id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return { ok: true, message: "Profile saved." };
}

export async function updateLocation(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = locationSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const { error } = await (await createClient()).from("locations").update({
    share_level: d.share_level, country: d.country, city: d.share_level === "country" ? null : d.city,
    consent_at: d.share_level === "hidden" ? null : new Date().toISOString(),
  }).eq("user_id", user.id);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app/locations");
  return { ok: true, message: d.share_level === "hidden" ? "Your location is hidden." : "Location sharing updated." };
}

const uuid = z.string().uuid();

export async function requestConnection(form: FormData) {
  await requireUser();
  const id = uuid.parse(form.get("user_id"));
  await (await createClient()).from("connections").insert({ addressee_id: id });
  revalidatePath(`/app/alumni/${id}`);
}

export async function respondConnection(form: FormData) {
  await requireUser();
  const id = uuid.parse(form.get("id"));
  const status = z.enum(["accepted", "declined"]).parse(form.get("status"));
  await (await createClient()).from("connections").update({ status, responded_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/app", "layout");
}

export async function removeConnection(form: FormData) {
  await requireUser();
  await (await createClient()).from("connections").delete().eq("id", uuid.parse(form.get("id")));
  revalidatePath("/app", "layout");
}

export async function markNotificationsRead(form: FormData) {
  await requireUser();
  const id = form.get("id");
  const q = (await createClient()).from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  await (id ? q.eq("id", uuid.parse(id)) : q);
  revalidatePath("/app", "layout");
}
