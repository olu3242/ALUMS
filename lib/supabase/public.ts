import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/** Session-less anon client for public reference data (safe to cache; never carries a user's session). */
export const createPublicClient = () =>
  createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
