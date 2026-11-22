import { redirect } from "next/navigation";
import { AuthShell } from "@/components/site/auth-shell";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { acceptInvitation } from "@/lib/actions/membership";
import { getUser } from "@/lib/session";

export const metadata = { title: "Accept invitation", robots: { index: false } };
export default async function Invite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await getUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
  return (
    <AuthShell title="You're invited" subtitle="A class leader invited you to join their ALUMS community.">
      <p className="text-sm text-muted">Invitations are tied to the email address they were sent to. You're signed in as <strong className="break-all text-ink">{user.email}</strong>.</p>
      <ActionForm action={acceptInvitation} className="mt-6">
        <input type="hidden" name="token" value={token} />
        <SubmitButton className="w-full" pendingLabel="Joining…">Accept and join</SubmitButton>
      </ActionForm>
    </AuthShell>
  );
}
