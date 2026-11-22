"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { brandingSchema, fieldErrors, institutionLinkSchema, institutionPostSchema, LOGO_TYPES, MAX_LOGO_BYTES } from "@/lib/validation";
import { friendlyError, type ActionState } from "@/lib/errors";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const uuid = z.string().uuid();

export async function saveBranding(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("institution.brand");
  const parsed = brandingSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const supabase = await createClient();
  let logoPath: string | null = null;
  const file = form.get("logo");
  if (file instanceof File && file.size > 0) {
    if (!(LOGO_TYPES as readonly string[]).includes(file.type)) return { error: "Logo must be PNG, JPEG or WebP." };
    if (file.size > MAX_LOGO_BYTES) return { error: "Logo must be 1 MB or smaller." };
    logoPath = `${d.institution_id}/logo-${Date.now()}.${EXT[file.type]}`;
    // Storage RLS re-checks institution.brand for this institution's folder.
    const up = await supabase.storage.from("institution-assets").upload(logoPath, file, { contentType: file.type, upsert: false });
    if (up.error) return { error: "Logo upload failed. You may not have permission for this institution." };
  }
  const { error } = await supabase.rpc("update_institution_branding", {
    p_institution_id: d.institution_id, p_tagline: d.tagline, p_about: d.about, p_brand_primary: d.brand_primary ?? null,
    p_brand_accent: d.brand_accent ?? null, p_logo_format: d.logo_format, p_logo_path: logoPath, p_public_page: d.public_page,
  });
  if (error) {
    if (logoPath) await supabase.storage.from("institution-assets").remove([logoPath]);
    return { error: friendlyError(error) };
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Branding saved." };
}

export async function publishInstitutionPost(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("institution.network");
  const parsed = institutionPostSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).from("institution_posts").insert(parsed.data);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: parsed.data.audience === "public" ? "Published on the public institution page." : "Published to alumni." };
}

export async function setPostStatus(form: FormData) {
  await requireAdmin("institution.network");
  await (await createClient()).from("institution_posts")
    .update({ status: z.enum(["published", "hidden"]).parse(form.get("status")) }).eq("id", uuid.parse(form.get("id")));
  revalidatePath("/", "layout");
}

export async function addInstitutionLink(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("institution.network");
  const parsed = institutionLinkSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).from("institution_links").insert(parsed.data);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Linkage added." };
}

export async function deleteInstitutionLink(form: FormData) {
  await requireAdmin("institution.network");
  await (await createClient()).from("institution_links").delete().eq("id", uuid.parse(form.get("id")));
  revalidatePath("/", "layout");
}
