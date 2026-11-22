export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  siteUrl: (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, ""),
};

/** The app renders honest "not connected" states instead of fake data when Supabase is absent. */
export const isBackendConfigured = () => Boolean(env.supabaseUrl && env.supabaseAnonKey);
