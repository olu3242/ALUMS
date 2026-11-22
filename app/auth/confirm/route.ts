import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/utils";

// Handles email confirmation, magic link and recovery links (token_hash flow) and PKCE code exchange.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"), "/app/my-classes");
  const supabase = await createClient();
  const { error } = token_hash && type
    ? await supabase.auth.verifyOtp({ token_hash, type })
    : code ? await supabase.auth.exchangeCodeForSession(code) : { error: new Error("missing token") };
  return NextResponse.redirect(new URL(error ? "/sign-in?notice=link-expired" : next, url.origin));
}
