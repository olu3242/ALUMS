"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCommunity, requireUser } from "@/lib/session";
import { albumSchema, ALLOWED_IMAGE_TYPES, announcementSchema, businessSchema, eventSchema, fieldErrors, MAX_IMAGE_BYTES, reportSchema } from "@/lib/validation";
import { friendlyError, type ActionState } from "@/lib/errors";

const uuid = z.string().uuid();

// Businesses (Workflow C) --------------------------------------------------
export async function saveBusiness(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const community = await requireCommunity();
  const parsed = businessSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { id, ...data } = parsed.data;
  const row = { ...data, category_id: data.category_id ?? null };
  const supabase = await createClient();
  const res = id
    ? await supabase.from("businesses").update(row).eq("id", id).select("id").single()
    : await supabase.from("businesses").insert({ ...row, community_id: community.id }).select("id").single();
  if (res.error) return { error: friendlyError(res.error) };
  if (form.get("intent") === "submit") {
    const { error } = await supabase.rpc("submit_business", { p_business_id: res.data.id });
    if (error) return { error: friendlyError(error) };
  }
  revalidatePath("/app/businesses");
  redirect("/app/businesses?tab=mine");
}

export async function submitBusiness(form: FormData) {
  await requireUser();
  await (await createClient()).rpc("submit_business", { p_business_id: uuid.parse(form.get("id")) });
  revalidatePath("/app/businesses");
}

export async function deleteBusiness(form: FormData) {
  await requireUser();
  await (await createClient()).from("businesses").delete().eq("id", uuid.parse(form.get("id")));
  revalidatePath("/app/businesses");
}

// Events (Workflow D) -------------------------------------------------------
export async function saveEvent(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const community = await requireCommunity();
  const parsed = eventSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const id = form.get("id") ? uuid.parse(form.get("id")) : null;
  const supabase = await createClient();
  const res = id
    ? await supabase.from("events").update(parsed.data).eq("id", id).select("id").single()
    : await supabase.from("events").insert({ ...parsed.data, community_id: community.id }).select("id").single();
  if (res.error) return { error: friendlyError(res.error) };
  revalidatePath("/app/events");
  redirect(`/app/events/${res.data.id}`);
}

export async function setEventStatus(form: FormData) {
  await requireUser();
  const id = uuid.parse(form.get("id"));
  const status = z.enum(["published", "cancelled", "draft"]).parse(form.get("status"));
  await (await createClient()).from("events").update({ status }).eq("id", id);
  revalidatePath(`/app/events/${id}`);
}

export async function rsvp(form: FormData) {
  const user = await requireUser();
  const event_id = uuid.parse(form.get("event_id"));
  const status = z.enum(["going", "maybe", "declined", "clear"]).parse(form.get("status"));
  const supabase = await createClient();
  if (status === "clear") await supabase.from("event_rsvps").delete().eq("event_id", event_id).eq("user_id", user.id);
  else {
    const { data } = await supabase.from("event_rsvps").select("event_id").eq("event_id", event_id).eq("user_id", user.id).maybeSingle();
    const { error } = data
      ? await supabase.from("event_rsvps").update({ status }).eq("event_id", event_id).eq("user_id", user.id)
      : await supabase.from("event_rsvps").insert({ event_id, status });
    if (error) redirect(`/app/events/${event_id}?error=${encodeURIComponent(friendlyError(error))}`);
  }
  revalidatePath(`/app/events/${event_id}`);
}

export async function markAttendance(form: FormData) {
  await requireUser();
  const event_id = uuid.parse(form.get("event_id"));
  await (await createClient()).rpc("mark_attendance", {
    p_event_id: event_id, p_user_id: uuid.parse(form.get("user_id")), p_attended: form.get("attended") === "true",
  });
  revalidatePath(`/app/events/${event_id}`);
}

// Announcements -------------------------------------------------------------
export async function publishAnnouncement(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const community = await requireCommunity();
  const parsed = announcementSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).from("announcements").insert({ ...parsed.data, community_id: community.id });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app/announcements");
  return { ok: true, message: "Announcement published and members notified." };
}

export async function deleteAnnouncement(form: FormData) {
  await requireUser();
  await (await createClient()).from("announcements").delete().eq("id", uuid.parse(form.get("id")));
  revalidatePath("/app/announcements");
}

// Gallery ---------------------------------------------------------------------
export async function createAlbum(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const community = await requireCommunity();
  const parsed = albumSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { data, error } = await (await createClient()).from("albums").insert({ ...parsed.data, community_id: community.id }).select("id").single();
  if (error) return { error: friendlyError(error) };
  redirect(`/app/gallery/${data.id}`);
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export async function uploadPhoto(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const community = await requireCommunity();
  const album_id = uuid.safeParse(form.get("album_id"));
  const file = form.get("file");
  if (!album_id.success || !(file instanceof File) || file.size === 0) return { error: "Choose a photo to upload." };
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return { error: "Use a JPEG, PNG, WebP or GIF image." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Photos must be 5 MB or smaller." };
  const caption = z.string().trim().max(300).optional().parse(form.get("caption") || undefined) ?? null;
  const supabase = await createClient();
  const path = `${community.id}/${album_id.data}/${crypto.randomUUID()}.${EXT[file.type]}`;
  const up = await supabase.storage.from("community-media").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { error: "Upload failed. You may not have access to this album." };
  const { error } = await supabase.from("media_assets").insert({
    community_id: community.id, album_id: album_id.data, storage_path: path, mime_type: file.type, bytes: file.size, caption,
  });
  if (error) { await supabase.storage.from("community-media").remove([path]); return { error: friendlyError(error) }; }
  revalidatePath(`/app/gallery/${album_id.data}`);
  return { ok: true, message: "Photo added." };
}

export async function setMediaStatus(form: FormData) {
  await requireUser();
  const id = uuid.parse(form.get("id"));
  const status = z.enum(["published", "hidden"]).parse(form.get("status"));
  await (await createClient()).from("media_assets").update({ status }).eq("id", id);
  revalidatePath("/app/gallery", "layout");
}

// Moderation ------------------------------------------------------------------
export async function reportContent(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const community = await requireCommunity();
  const parsed = reportSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).from("moderation_reports").insert({ ...parsed.data, community_id: community.id });
  if (error) return { error: friendlyError(error) };
  return { ok: true, message: "Thanks — moderators have been notified." };
}
