"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/session";
import { communityHeaderSchema, fieldErrors, LOGO_TYPES, MAX_COVER_BYTES } from "@/lib/validation";
import { friendlyError, type ActionState } from "@/lib/errors";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** Class dashboard header. Authorization (community.manage) is enforced by update_community_header and storage RLS. */
export async function saveCommunityHeader(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = communityHeaderSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from("class_communities").select("header_cover_path").eq("id", d.community_id).single();
  let coverPath: string | null = null;
  const file = form.get("cover");
  if (!d.remove_cover && file instanceof File && file.size > 0) {
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return { error: "Cover must be PNG, JPEG or WebP." };
    if (file.size > MAX_COVER_BYTES) return { error: "Cover must be 3 MB or smaller." };
    coverPath = `${d.community_id}/header/cover-${Date.now()}.${EXT[file.type]}`;
    const up = await supabase.storage.from("community-media").upload(coverPath, file, { contentType: file.type, upsert: false });
    if (up.error) return { error: "Cover upload failed. You must be a verified member of this class." };
  }
  const { error } = await supabase.rpc("update_community_header", {
    p_community_id: d.community_id, p_tagline: d.tagline ?? null, p_cover_path: coverPath, p_remove_cover: d.remove_cover,
  });
  if (error) {
    if (coverPath) await supabase.storage.from("community-media").remove([coverPath]);
    return { error: friendlyError(error) };
  }
  // Best effort: drop the replaced cover (storage RLS decides whether this user may delete it).
  const old = before?.header_cover_path;
  if (old && (coverPath || d.remove_cover)) await supabase.storage.from("community-media").remove([old]);
  revalidatePath("/app", "layout");
  return { ok: true, message: "Header updated." };
}
