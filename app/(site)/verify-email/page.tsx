import { AuthShell } from "@/components/site/auth-shell";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Verify your email" };
export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <AuthShell title="Check your inbox" subtitle="One more step before you can apply to your class.">
      <p>We sent a verification link{email ? <> to <strong className="break-all">{email}</strong></> : null}. Open it on this device to continue.</p>
      <p className="mt-3 text-sm text-muted">Didn't get it? Check spam, or sign up again with the same address to resend.</p>
      <ButtonLink href="/sign-in" variant="secondary" className="mt-6 w-full">Back to sign in</ButtonLink>
    </AuthShell>
  );
}
