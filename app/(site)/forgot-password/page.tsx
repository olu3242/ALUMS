import { AuthShell } from "@/components/site/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";
import { requestPasswordReset } from "@/lib/actions/auth";

export const metadata = { title: "Reset password" };
export default function ForgotPassword() {
  return (
    <AuthShell title="Reset your password">
      <ActionForm action={requestPasswordReset} className="grid gap-4">
        <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" autoComplete="email" required /></Field>
        <SubmitButton className="w-full" pendingLabel="Sending…">Send reset link</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
