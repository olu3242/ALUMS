import { z } from "zod";

const thisYear = new Date().getUTCFullYear();
const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : null));
const optionalUrl = z.string().trim().max(300).optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https:\/\/[^\s]+$/.test(v), "Must start with https://");
const optionalEmail = z.string().trim().max(254).optional()
  .transform((v) => (v ? v.toLowerCase() : null))
  .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email");

export const visibilityLevel = z.enum(["everyone", "members", "connections", "private"]);
export const PROFILE_FIELDS = ["full_name", "name_at_graduation", "headline", "about", "profession", "industry", "employer",
  "job_title", "contact_email", "phone", "linkedin_url", "website_url"] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export const SENSITIVE_FIELDS: ProfileField[] = ["contact_email", "phone"];

export const graduationYear = z.coerce.number().int().min(1900).max(thisYear + 6);

export const finderSchema = z.object({
  institution: z.string().trim().max(200).optional().default(""),
  department: z.string().trim().max(120).optional().default(""),
  year: z.union([graduationYear, z.literal("").transform(() => undefined)]).optional(),
});

export const registerSchema = z.object({
  full_name: trimmed(2, 120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(10, "Use at least 10 characters").max(72),
  next: z.string().optional(),
});
export const signInSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72), next: z.string().optional() });
export const emailSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
export const passwordSchema = z.object({ password: z.string().min(10, "Use at least 10 characters").max(72) });

export const applySchema = z.object({
  community_id: z.string().uuid(),
  name_at_graduation: trimmed(2, 160),
  student_identifier: optionalText(64),
  note: optionalText(1000),
});

export const communityRequestSchema = z.object({
  institution_name: trimmed(2, 200),
  department_name: trimmed(2, 120),
  graduation_year: graduationYear,
  note: optionalText(1000),
});

export const profileSchema = z.object({
  full_name: trimmed(2, 120),
  name_at_graduation: optionalText(160),
  headline: optionalText(160),
  about: optionalText(2000),
  profession: optionalText(100),
  industry: optionalText(100),
  employer: optionalText(120),
  job_title: optionalText(120),
  contact_email: optionalEmail,
  phone: optionalText(40),
  linkedin_url: optionalUrl,
  website_url: optionalUrl,
  open_to_mentoring: z.coerce.boolean().default(false),
  directory_listed: z.coerce.boolean().default(false),
  visibility: z.record(z.enum(PROFILE_FIELDS), visibilityLevel),
});

export const locationSchema = z.discriminatedUnion("share_level", [
  z.object({ share_level: z.literal("hidden"), country: optionalText(80), city: optionalText(80), consent: z.any().optional() }),
  z.object({ share_level: z.literal("country"), country: trimmed(2, 80), city: optionalText(80), consent: z.literal("on", { errorMap: () => ({ message: "Consent is required to share your location" }) }) }),
  z.object({ share_level: z.literal("city"), country: trimmed(2, 80), city: trimmed(2, 80), consent: z.literal("on", { errorMap: () => ({ message: "Consent is required to share your location" }) }) }),
]);

export const businessSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  name: trimmed(2, 120),
  category_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  description: optionalText(2000),
  services: z.string().max(2000).optional().transform((v) =>
    (v ?? "").split(/[\n,]/).map((s) => s.trim()).filter(Boolean).slice(0, 20)).pipe(z.array(z.string().max(80))),
  website_url: optionalUrl,
  contact_email: optionalEmail,
  phone: optionalText(40),
  country: optionalText(80),
  city: optionalText(80),
});

export const eventSchema = z.object({
  title: trimmed(2, 160),
  description: optionalText(5000),
  starts_at: z.string().min(1, "Start time is required").transform((v, ctx) => {
    const d = new Date(v.endsWith("Z") ? v : v + "Z");
    if (Number.isNaN(d.getTime())) { ctx.addIssue({ code: "custom", message: "Invalid date" }); return z.NEVER; }
    return d.toISOString();
  }),
  ends_at: z.string().optional().transform((v) => (v ? new Date(v.endsWith("Z") ? v : v + "Z").toISOString() : null)),
  venue: optionalText(200),
  is_virtual: z.coerce.boolean().default(false),
  meeting_url: optionalUrl,
  capacity: z.union([z.coerce.number().int().positive().max(100000), z.literal("").transform(() => null)]).optional().transform((v) => v ?? null),
  status: z.enum(["draft", "published"]),
}).refine((v) => !v.ends_at || v.ends_at >= v.starts_at, { message: "End must be after start", path: ["ends_at"] });

export const announcementSchema = z.object({ title: trimmed(2, 160), body: trimmed(1, 10000), is_pinned: z.coerce.boolean().default(false) });
export const albumSchema = z.object({ title: trimmed(2, 120), description: optionalText(1000) });
export const reportSchema = z.object({
  target_type: z.enum(["business", "event", "announcement", "media", "profile"]),
  target_id: z.string().uuid(),
  reason: trimmed(3, 1000),
});

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const assignRoleSchema = z.object({
  user_id: z.string().uuid(),
  role_key: z.string().regex(/^[a-z_]+$/),
  scope_type: z.enum(["platform", "institution", "community"]),
  scope_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  reason: optionalText(500),
  confirm: z.literal("on", { errorMap: () => ({ message: "Confirm you have reviewed the permissions" }) }),
});

export const createCommunitySchema = z.object({
  department_name: trimmed(2, 120),
  graduation_year: graduationYear,
  institution_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
  name: optionalText(160),
  description: optionalText(2000),
  activate: z.coerce.boolean().default(false),
  request_id: z.string().uuid().optional().or(z.literal("").transform(() => undefined)),
});

export const institutionSchema = z.object({
  name: trimmed(2, 200),
  country: optionalText(80),
  city: optionalText(80),
  website_url: optionalUrl,
  verified: z.coerce.boolean().default(false),
});

/** Flatten Zod issues for ActionState. */
export const fieldErrors = (e: z.ZodError) => e.flatten().fieldErrors as Record<string, string[]>;
