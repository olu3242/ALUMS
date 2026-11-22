import Link from "next/link";
import { AuthShell } from "@/components/site/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";
import { BackendNotice } from "@/components/ui/misc";
import { signUp } from "@/lib/actions/auth";
import { isBackendConfigured } from "@/lib/env";

export const metadata = { title: "Join ALUMS" };

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthShell title="Join ALUMS" subtitle={<>Already have an account? <Link className="font-semibold text-accent-text hover:underline" href="/sign-in">Sign in</Link></>}
      aside={<p className="mt-6 font-serif text-4xl leading-tight">One account. Every class you belong to.</p>}>
      {!isBackendConfigured() && <div className="mb-5"><BackendNotice /></div>}
      <ActionForm action={signUp} className="grid gap-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <Field label="Full name" htmlFor="full_name" hint="As you'd like classmates to see it. You control who sees it."><Input id="full_name" name="full_name" autoComplete="name" required minLength={2} maxLength={120} /></Field>
        <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Password" htmlFor="password" hint="At least 10 characters."><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
        <SubmitButton className="mt-2 w-full" pendingLabel="Creating account…">Create account</SubmitButton>
        <p className="text-xs text-muted">We'll email you a link to verify your address. You'll then find your class and apply for membership.</p>
      </ActionForm>
    </AuthShell>
  );
}
