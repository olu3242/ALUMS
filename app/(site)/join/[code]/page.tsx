import Link from "next/link";
import { AuthShell } from "@/components/site/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Notice } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { redeemInviteCode } from "@/lib/actions/network";
import { getUser } from "@/lib/session";

export const metadata = { title: "Join with an invitation code", robots: { index: false } };

// The community is revealed only after redemption by a signed-in, verified user (prevents code enumeration).
export default async function Join({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).toUpperCase().slice(0, 20);
  const valid = /^[A-Z0-9]{2,6}-[A-Z2-9]{6}$/.test(code);
  const user = await getUser();
  return (
    <AuthShell title="You've been invited" subtitle={<>Invitation code <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono font-bold">{code}</code></>}>
      {!valid ? <Notice tone="warning">That doesn't look like an ALUMS invitation code. Check the link you were sent.</Notice>
        : !user ? (
          <>
            <p>Create an account (or sign in) and verify your email, then use this code to join your class.</p>
            <div className="mt-6 grid gap-2">
              <ButtonLink href={`/register?next=${encodeURIComponent(`/join/${code}`)}`}>Create account</ButtonLink>
              <ButtonLink href={`/sign-in?next=${encodeURIComponent(`/join/${code}`)}`} variant="secondary">I already have an account</ButtonLink>
            </div>
            <p className="mt-4 text-xs text-muted">After verifying your email you can also enter the code under My classes.</p>
          </>
        ) : (
          <ActionForm action={redeemInviteCode} className="grid gap-3">
            <input type="hidden" name="code" value={code} />
            <p className="text-sm text-muted">Signed in as <strong className="break-all text-ink">{user.email}</strong>.</p>
            <SubmitButton className="w-full" pendingLabel="Joining…">Use this code</SubmitButton>
            <Link href="/app/my-classes" className="text-center text-sm text-muted hover:text-ink">Not now</Link>
          </ActionForm>
        )}
    </AuthShell>
  );
}
