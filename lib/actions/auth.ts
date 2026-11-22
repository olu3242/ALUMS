"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { env, isBackendConfigured } from "@/lib/env";
import { emailSchema, fieldErrors, passwordSchema, registerSchema, signInSchema } from "@/lib/validation";
import { safeNext } from "@/lib/utils";
import type { ActionState } from "@/lib/errors";

const NOT_CONFIGURED: ActionState = { error: "Accounts are unavailable: the backend is not connected yet." };

export async function signIn(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  const parsed = signInSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  // Uniform message: don't reveal whether the email exists.
  if (error) return { error: error.code === "email_not_confirmed" ? "Please confirm your email first — check your inbox." : "Email or password is incorrect." };
  redirect(safeNext(parsed.data.next));
}

export async function signUp(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const next = safeNext(parsed.data.next, "/app/my-classes");
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { full_name: parsed.data.full_name }, emailRedirectTo: `${env.siteUrl}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error && error.code !== "user_already_exists") return { error: error.code === "weak_password" ? "Choose a stronger password." : "We couldn't create your account. Please try again." };
  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}

export async function signOut() {
  if (isBackendConfigured()) await (await createClient()).auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(_: ActionState, form: FormData): Promise<ActionState> {
  if (!isBackendConfigured()) return NOT_CONFIGURED;
  const parsed = emailSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  await (await createClient()).auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${env.siteUrl}/auth/confirm?next=/reset-password` });
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = passwordSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { error } = await (await createClient()).auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "Could not update password. The reset link may have expired." };
  return { ok: true, message: "Password updated." };
}
