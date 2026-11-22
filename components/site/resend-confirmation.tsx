import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/form";
import { resendConfirmation } from "@/lib/actions/auth";

export function ResendConfirmation({ email }: { email?: string }) {
  return (
    <details className="rounded-xl border border-line p-4 text-sm" open={Boolean(email)}>
      <summary className="cursor-pointer font-semibold">Didn't get the confirmation email?</summary>
      <ActionForm action={resendConfirmation} className="mt-3 grid gap-2">
        <label htmlFor="resend-email" className="text-muted">We'll send a fresh link. Check your spam folder too.</label>
        <Input id="resend-email" name="email" type="email" autoComplete="email" required defaultValue={email} />
        <SubmitButton variant="secondary" pendingLabel="Sending…">Resend confirmation email</SubmitButton>
      </ActionForm>
    </details>
  );
}
