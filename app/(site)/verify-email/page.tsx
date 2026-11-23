import { AuthShell } from "@/components/site/auth-shell";
import { ButtonLink } from "@/components/ui/button";
import { ResendConfirmation } from "@/components/site/resend-confirmation";

export const metadata = { title: "Verify your email" };
export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthShell title="Check your inbox" subtitle="One more step before you can apply to your class.">
      <p>We sent a verification link{email ? <> to <strong className="break-all">{email}</strong></> : null}. Open it on this device to continue.</p>
      <div className="mt-5"><ResendConfirmation email={email} /></div>
      <ButtonLink href="/sign-in" variant="secondary" className="mt-6 w-full">Back to sign in</ButtonLink>
    </AuthShell>
  );
}
