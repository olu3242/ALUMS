import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { createCommunity, deleteCommunity, resolveCommunityRequest, updateCommunity } from "@/lib/actions/admin";
import { ClassDetailsForm } from "@/components/app/class-details-form";
import { getDirectoryCountries } from "@/lib/queries/public";
import { DeleteForm } from "@/components/app/delete-form";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Communities" };

export default async function Communities({ searchParams }: { searchParams: Promise<{ dept?: string; year?: string; req?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireAdmin("community.view_admin");
  const supabase = await createClient();
  const canCreate = ctx.permissions.has("community.create");
  const isPlatform = ctx.current.scope_type === "platform";
  const countries = canCreate ? await getDirectoryCountries() : [];
  const [{ data: institutions }, { data: requests }] = await Promise.all([
    canCreate ? supabase.from("institutions").select("id, name, status").neq("status", "archived").order("name") : Promise.resolve({ data: [] }),
    canCreate && ctx.current.scope_type === "platform"
      ? supabase.from("community_requests").select("id, institution_name, department_name, graduation_year, note, created_at").eq("status", "pending").order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  const instOptions = ctx.current.scope_type === "institution" ? (institutions ?? []).filter((i) => i.id === ctx.current.scope_id) : institutions ?? [];

  return (
    <>
      <PageHeader eyebrow={ctx.current.label} title="Communities" description="New class communities are configuration, not code: create one here and it is live once verified." />
      {(requests ?? []).length > 0 && (
        <section className="mb-10" aria-labelledby="creq">
          <h2 id="creq" className="mb-4 text-lg font-bold">Requests from alumni</h2>
          <ul className="grid gap-3">
            {requests!.map((r) => (
              <li key={r.id}><Card className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1"><p className="font-semibold">{r.department_name} — Class of {r.graduation_year}</p><p className="text-sm text-muted">{r.institution_name} · {formatDate(r.created_at)}{r.note ? ` · “${r.note}”` : ""}</p></div>
                <Link href={`?dept=${encodeURIComponent(r.department_name)}&year=${r.graduation_year}&req=${r.id}#create`} className="text-sm font-semibold text-accent-text hover:underline">Create from request</Link>
                <form action={resolveCommunityRequest}><input type="hidden" name="id" value={r.id} /><Button size="sm" variant="ghost">Decline</Button></form>
              </Card></li>
            ))}
          </ul>
        </section>
      )}

      {ctx.communities.length === 0 ? <EmptyState title="No communities in this scope" /> : (
        <ul className="mb-10 grid gap-4 md:grid-cols-2">
          {ctx.communities.map((c) => (
            <li key={c.id}><Card>
              <div className="flex items-start justify-between gap-3">
                <div><h2 className="font-bold">{c.name}</h2><p className="text-sm text-muted">{c.institution_name ?? "Institution pending confirmation"} · {c.active_members} verified members</p></div>
                <div className="flex flex-col items-end gap-1"><StatusBadge status={c.status} />{c.is_founding && <Badge tone="accent">Founding</Badge>}</div>
              </div>
              {canCreate && (
                <ActionForm action={updateCommunity} className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="id" value={c.id} />
                  <label className="sr-only" htmlFor={`s-${c.id}`}>Status</label>
                  <Select id={`s-${c.id}`} name="status" defaultValue={c.status}><option value="pending_verification">Pending verification</option><option value="active">Active</option><option value="archived">Archived</option></Select>
                  <SubmitButton variant="secondary" size="md">Update status</SubmitButton>
                </ActionForm>
              )}
              {canCreate && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold text-accent-text">Edit details{isPlatform ? " or delete" : ""}</summary>
                  <div className="mt-3"><ClassDetailsForm c={c} institutionName={c.institution_name} canChangeInstitution={isPlatform}
                    countries={countries} idPrefix="ac" /></div>
                  {isPlatform && <div className="mt-4"><DeleteForm action={deleteCommunity} id={c.id} label="Delete community"
                    hint="Only possible for an empty class with no members, requests, payments or content. Otherwise archive it." /></div>}
                </details>
              )}
            </Card></li>
          ))}
        </ul>
      )}

      {canCreate && <CreateForm institutions={instOptions} defaults={sp} />}
    </>
  );
}

type Defaults = { dept?: string; year?: string; req?: string };
async function CreateForm({ institutions, defaults }: { institutions: { id: string; name: string; status: string }[]; defaults: Defaults }) {
  return (
    <Card id="create" className="scroll-mt-20">
      <h2 className="text-lg font-bold">Create a class community</h2>
      <p className="text-sm text-muted">Leave the institution empty when it hasn't been confirmed — it will show as “pending confirmation”. Never guess it.</p>
      <ActionForm action={createCommunity} className="mt-5 grid gap-4 sm:grid-cols-2">
        {defaults.req && /^[0-9a-f-]{36}$/.test(defaults.req) && <input type="hidden" name="request_id" value={defaults.req} />}
        <CreateFields institutions={institutions} defaults={defaults} />
        <div className="sm:col-span-2"><SubmitButton>Create community</SubmitButton></div>
      </ActionForm>
    </Card>
  );
}

function CreateFields({ institutions, defaults }: { institutions: { id: string; name: string; status: string }[]; defaults: Defaults }) {
  return (
    <>
      <Field label="Department / course" htmlFor="department_name"><Input id="department_name" name="department_name" required maxLength={120} defaultValue={defaults.dept} /></Field>
      <Field label="Graduation year" htmlFor="graduation_year"><Input id="graduation_year" name="graduation_year" required inputMode="numeric" pattern="[0-9]{4}" defaultValue={defaults.year} /></Field>
      <Field label="Institution" htmlFor="institution_id"><Select id="institution_id" name="institution_id" defaultValue=""><option value="">Pending confirmation</option>{institutions.map((i) => <option key={i.id} value={i.id}>{i.name}{i.status !== "verified" ? " (unverified)" : ""}</option>)}</Select></Field>
      <Field label="Display name (optional)" htmlFor="name" hint="Defaults to “Department — Class of Year”."><Input id="name" name="name" maxLength={160} /></Field>
      <Field label="Description (optional)" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" maxLength={2000} /></Field>
      <div className="sm:col-span-2"><Checkbox name="activate" label="Activate now (community identity has been verified)" /></div>
    </>
  );
}
