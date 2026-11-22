import { AuthShell } from "@/components/site/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";
import { updatePassword } from "@/lib/actions/auth";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Choose a new password" };
export default async function ResetPassword() {
  await requireUser();
  return (
    <AuthShell title="Choose a new password">
      <ActionForm action={updatePassword} className="grid gap-4">
        <Field label="New password" htmlFor="password" hint="At least 10 characters."><Input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} /></Field>
        <SubmitButton className="w-full">Update password</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
