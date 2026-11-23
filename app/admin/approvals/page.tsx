import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Input } from "@/components/ui/form";
import { NeedsCommunity } from "@/components/app/scope-note";
import { createClient } from "@/lib/supabase/server";
import { getViewer, requireAdmin } from "@/lib/session";
import { decideApproval, reviewBusiness, reviewMembership } from "@/lib/actions/admin";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Approvals" };

type Req = { id: string; account_name: string; name_at_graduation: string; student_identifier: string | null; note: string | null; created_at: string };
type Appr = { id: string; scope_type: string; payload: { role_name?: string; scope_label?: string; reason?: string }; target_name: string; requested_by_name: string; requested_by: string; target_user_id: string; created_at: string };

export default async function Approvals() {
  const ctx = await requireAdmin();
  const { user } = await getViewer();
  const supabase = await createClient();
  const isCommunity = ctx.current.scope_type === "community";
  const [reqs, biz, appr] = await Promise.all([
    isCommunity && ctx.permissions.has("membership.review") ? supabase.rpc("admin_membership_requests", { p_community_id: ctx.current.scope_id }) : Promise.resolve({ data: [] }),
    isCommunity && ctx.permissions.has("business.review")
      ? supabase.from("businesses").select("id, name, description, services, website_url, owner_id, submitted_at, business_categories(name)").eq("community_id", ctx.current.scope_id!).eq("status", "submitted").order("submitted_at")
      : Promise.resolve({ data: [] }),
    supabase.rpc("admin_pending_approvals"),
  ]);
  const requests = (reqs.data as Req[] | null) ?? [];
  const businesses = (biz.data as { id: string; name: string; description: string | null; services: string[]; website_url: string | null; owner_id: string; submitted_at: string; business_categories: { name: string } | null }[] | null) ?? [];
  const approvals = (appr.data as Appr[] | null) ?? [];
  const canApprove = ctx.permissions.has("membership.approve");

  return (
    <>
      <PageHeader eyebrow={ctx.current.label} title="Approvals" description="Membership verification, business listings and independently-approved role changes." />

      <section aria-labelledby="mreq" className="mb-12">
        <h2 id="mreq" className="mb-4 text-lg font-bold">Membership requests</h2>
        {!isCommunity ? <NeedsCommunity next="/admin/approvals" /> : requests.length === 0 ? <EmptyState title="No pending membership requests" /> : (
          <ul className="grid gap-4">
            {requests.map((r) => (
              <li key={r.id}><Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold">{r.name_at_graduation}</h3>
                    <p className="text-sm text-muted">Account name: {r.account_name || "—"} · {formatDateTime(r.created_at)}</p>
                  </div>
                  {r.student_identifier && <Badge>ID: {r.student_identifier}</Badge>}
                </div>
                {r.note && <p className="mt-3 text-[15px]">“{r.note}”</p>}
                {canApprove ? (
                  <ActionForm action={reviewMembership} className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <input type="hidden" name="id" value={r.id} />
                    <label className="sr-only" htmlFor={`n-${r.id}`}>Decision note</label>
                    <Input id={`n-${r.id}`} name="note" placeholder="Note to applicant (optional)" maxLength={1000} />
                    <SubmitButton name="decision" value="approve" size="md">Verify member</SubmitButton>
                    <SubmitButton name="decision" value="reject" variant="secondary">Decline</SubmitButton>
                  </ActionForm>
                ) : <p className="mt-3 text-sm text-muted">You can review, but a Class Admin must make the decision.</p>}
              </Card></li>
            ))}
          </ul>
        )}
      </section>

      <section id="businesses" aria-labelledby="breq" className="mb-12 scroll-mt-20">
        <h2 id="breq" className="mb-4 text-lg font-bold">Business listings</h2>
        {!isCommunity ? <NeedsCommunity next="/admin/approvals" /> : !ctx.permissions.has("business.review") ? <p className="text-sm text-muted">Not available for your role.</p>
          : businesses.length === 0 ? <EmptyState title="No listings awaiting review" /> : (
          <ul className="grid gap-4">
            {businesses.map((b) => (
              <li key={b.id}><Card>
                <h3 className="font-bold">{b.name}</h3>
                <p className="text-sm text-muted">{b.business_categories?.name ?? "Uncategorised"} · submitted {formatDateTime(b.submitted_at)}</p>
                {b.description && <p className="mt-3 text-[15px]">{b.description}</p>}
                {b.services.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{b.services.map((s) => <Badge key={s}>{s}</Badge>)}</div>}
                {b.website_url && <a className="mt-3 inline-block text-sm font-semibold text-accent-text" href={b.website_url} target="_blank" rel="noopener noreferrer nofollow">{b.website_url} ↗</a>}
                {b.owner_id === user.id ? <p className="mt-4 text-sm text-muted">This is your listing — another leader must review it.</p> : (
                  <ActionForm action={reviewBusiness} className="mt-4 grid gap-3">
                    <input type="hidden" name="id" value={b.id} />
                    <Checkbox name="owner_verified" label="I have verified that this classmate owns or runs this business" />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <label className="sr-only" htmlFor={`bn-${b.id}`}>Note to owner</label>
                      <Input id={`bn-${b.id}`} name="note" placeholder="Note to owner (optional)" maxLength={1000} />
                      <SubmitButton name="decision" value="approve">Approve</SubmitButton>
                      <SubmitButton name="decision" value="reject" variant="secondary">Reject</SubmitButton>
                    </div>
                  </ActionForm>
                )}
              </Card></li>
            ))}
          </ul>
        )}
      </section>

      <section id="roles" aria-labelledby="rreq" className="scroll-mt-20">
        <h2 id="rreq" className="mb-1 text-lg font-bold">Role approvals</h2>
        <p className="mb-4 text-sm text-muted">Critical and financial roles need an independent approver who outranks the role. Requesters and nominees can't approve their own.</p>
        {approvals.length === 0 ? <EmptyState title="No role changes awaiting approval" /> : (
          <ul className="grid gap-4">
            {approvals.map((a) => {
              const conflicted = a.requested_by === user.id || a.target_user_id === user.id;
              return (
                <li key={a.id}><Card>
                  <h3 className="font-bold">{a.payload.role_name} for {a.target_name || "member"}</h3>
                  <p className="text-sm text-muted">{a.payload.scope_label} · requested by {a.requested_by_name || "—"} · {formatDateTime(a.created_at)}</p>
                  {a.payload.reason && <p className="mt-2 text-[15px]">Reason: {a.payload.reason}</p>}
                  {conflicted ? <p className="mt-4 text-sm text-warning">You requested or are named in this change, so you can't decide it.</p> : (
                    <ActionForm action={decideApproval} className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <input type="hidden" name="id" value={a.id} />
                      <label className="sr-only" htmlFor={`an-${a.id}`}>Decision note</label>
                      <Input id={`an-${a.id}`} name="note" placeholder="Decision note (optional)" maxLength={1000} />
                      <SubmitButton name="decision" value="approve">Approve</SubmitButton>
                      <SubmitButton name="decision" value="reject" variant="secondary">Reject</SubmitButton>
                    </ActionForm>
                  )}
                </Card></li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
