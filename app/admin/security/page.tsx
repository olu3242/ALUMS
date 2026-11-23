import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { MfaPanel } from "@/components/app/mfa-panel";
import { requireAdmin } from "@/lib/session";
import { safeNext } from "@/lib/utils";

export const metadata = { title: "Security" };

const CONTROLS = [
  ["Multi-factor authentication", "Role assignment, approvals, community/institution changes and platform settings require an AAL2 (MFA-verified) session."],
  ["Independent approval", "Critical and financial roles are activated only by a different approver who outranks the role — never by the requester or nominee."],
  ["Separation of duties", "Class Treasurer cannot be held together with Class Admin in the same community."],
  ["Scoped authority", "Leaders act only within their own community or institution; authorization is checked live in the database on every request."],
  ["Append-only audit log", "Privileged actions are recorded with the real actor and cannot be edited or deleted, even by database owners."],
] as const;

export default async function Security({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  await requireAdmin();
  const { next } = await searchParams;
  return (
    <>
      <PageHeader title="Security" description="Protect your admin account and review the controls that guard every privileged action." />
      <Card className="mb-8">
        <h2 className="mb-4 text-lg font-bold">Your multi-factor authentication</h2>
        <p className="mb-4 text-sm text-muted">Edits, deletes, approvals and role changes need a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…).
          Set it up once; after each sign-in, enter a fresh code here to unlock admin actions for that session.</p>
        <MfaPanel next={next ? safeNext(next, "/admin/dashboard") : undefined} />
      </Card>
      <h2 className="mb-4 text-lg font-bold">Platform controls</h2>
      <ul className="grid gap-4 md:grid-cols-2">
        {CONTROLS.map(([t, d]) => <li key={t}><Card><h3 className="font-bold">{t}</h3><p className="mt-1 text-sm text-muted">{d}</p></Card></li>)}
      </ul>
    </>
  );
}
