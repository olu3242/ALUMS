import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ButtonLink, Button } from "@/components/ui/button";
import { getActiveCommunity, getViewer } from "@/lib/session";
import { leaveCommunity, switchCommunity, withdrawRequest } from "@/lib/actions/membership";
import { redeemInviteCode } from "@/lib/actions/network";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Input } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "My classes" };

export default async function MyClasses() {
  const { memberships, requests } = await getViewer();
  const active = await getActiveCommunity();
  const openRequests = requests.filter((r) => r.status !== "approved");
  return (
    <>
      <PageHeader eyebrow="Communities" title="My classes" description="One account, every class you belong to. Each community keeps its own members, leaders and content."
        actions={<ButtonLink href="/discover">Find another class</ButtonLink>} />
      <Card className="mb-8">
        <h2 className="font-bold">Have an invitation code?</h2>
        <ActionForm action={redeemInviteCode} resetOnSuccess className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label htmlFor="code" className="sr-only">Invitation code</label>
          <Input id="code" name="code" required placeholder="e.g. ACCO-7KQ2MX" autoCapitalize="characters" autoComplete="off" className="font-mono uppercase sm:max-w-xs" />
          <SubmitButton pendingLabel="Checking…">Join class</SubmitButton>
        </ActionForm>
      </Card>
      {memberships.length === 0 && openRequests.length === 0 && (
        <EmptyState title="You haven't joined a class yet" action={<ButtonLink href="/discover">Find my class</ButtonLink>}>
          Search for your graduating class and apply. Class leaders verify every member.
        </EmptyState>
      )}
      {memberships.length > 0 && (
        <section aria-labelledby="mem" className="mb-10">
          <h2 id="mem" className="mb-4 text-lg font-bold">Memberships</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {memberships.map((m) => (
              <Card key={m.id} className="flex flex-col gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{m.class_communities.name}</h3>
                    <p className="text-sm text-muted">Verified {formatDate(m.verified_at)}{active?.id === m.community_id ? " · Currently selected" : ""}</p>
                  </div>
                  <StatusBadge status={m.status} />
                </div>
                {m.status === "active" && (
                  <div className="flex flex-wrap gap-2">
                    <form action={switchCommunity}><input type="hidden" name="community_id" value={m.community_id} /><Button size="sm">Open</Button></form>
                    <Link href={`/community/${m.class_communities.slug}`} className="inline-flex h-9 items-center px-2 text-sm font-semibold text-accent-text hover:underline">Public page</Link>
                    <form action={leaveCommunity} className="ml-auto"><input type="hidden" name="community_id" value={m.community_id} /><Button size="sm" variant="ghost" className="text-muted">Leave</Button></form>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      )}
      {openRequests.length > 0 && (
        <section aria-labelledby="req">
          <h2 id="req" className="mb-4 text-lg font-bold">Membership requests</h2>
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {openRequests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{r.class_communities?.name ?? "Community"}</p>
                  <p className="text-sm text-muted">Sent {formatDate(r.created_at)}{r.decision_note ? ` · Note: ${r.decision_note}` : ""}</p>
                </div>
                <StatusBadge status={r.status} />
                {r.status === "pending" && <form action={withdrawRequest}><input type="hidden" name="id" value={r.id} /><Button size="sm" variant="ghost">Withdraw</Button></form>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
