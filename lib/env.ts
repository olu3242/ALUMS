type Env = Record<string, string | undefined>;

/**
 * Canonical public URL for links we hand out (invitations, join codes, auth emails).
 * Order: NEXT_PUBLIC_SITE_URL → Vercel's production domain → this deployment's URL → localhost (local dev only).
 * On Vercel a localhost value is never used, so a preview build can't mint links nobody can open.
 */
export function resolveSiteUrl(e: Env): string {
  const strip = (u: string) => u.replace(/\/$/, "");
  const https = (host?: string) => (host ? `https://${host.replace(/^https?:\/\//, "")}` : undefined);
  const explicit = e.NEXT_PUBLIC_SITE_URL?.trim();
  const onVercel = Boolean(e.VERCEL);
  if (explicit && !(onVercel && /localhost|127\.0\.0\.1/.test(explicit))) return strip(explicit);
  return strip(https(e.VERCEL_PROJECT_PRODUCTION_URL) ?? https(e.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL) ?? https(e.VERCEL_URL) ?? "http://localhost:3000");
}

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: resolveSiteUrl({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL, VERCEL: process.env.VERCEL,
    VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
    NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL,
    VERCEL_URL: process.env.VERCEL_URL,
  }),
};

/** The app renders honest "not connected" states instead of fake data when Supabase is absent. */
export const isBackendConfigured = () => Boolean(env.supabaseUrl && env.supabaseAnonKey);
