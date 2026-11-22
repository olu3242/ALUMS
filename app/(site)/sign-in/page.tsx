import Link from "next/link";
import { AuthShell } from "@/components/site/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";
import { BackendNotice, Notice } from "@/components/ui/misc";
import { signIn } from "@/lib/actions/auth";
import { isBackendConfigured } from "@/lib/env";

export const metadata = { title: "Sign in" };

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; notice?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Welcome back" subtitle={<>New to ALUMS? <Link className="font-semibold text-accent-text underline-offset-4 hover:underline" href={`/register${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ""}`}>Create an account</Link></>}>
      {!isBackendConfigured() && <div className="mb-5"><BackendNotice /></div>}
      {sp.notice === "link-expired" && <div className="mb-5"><Notice tone="warning">That link has expired or was already used. Sign in or request a new one.</Notice></div>}
      <ActionForm action={signIn} className="grid gap-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Password" htmlFor="password"><Input id="password" name="password" type="password" autoComplete="current-password" required /></Field>
        <SubmitButton className="mt-2 w-full" pendingLabel="Signing in…">Sign in</SubmitButton>
        <Link href="/forgot-password" className="text-center text-sm text-muted hover:text-ink">Forgot your password?</Link>
      </ActionForm>
    </AuthShell>
  );
}
