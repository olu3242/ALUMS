import Link from "next/link";
import { requireFeature } from "@/lib/features";
import { ReportButton } from "@/components/app/report-button";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Button, ButtonLink } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/server";
import { getViewer, requireCommunity } from "@/lib/session";
import { deleteBusiness, saveBusiness, submitBusiness } from "@/lib/actions/content";
import { cn } from "@/lib/utils";
import { WorkflowSteps } from "@/components/app/workflow-steps";
import { listRuns } from "@/lib/workflows";

export const metadata = { title: "Business directory" };

type Biz = { id: string; owner_id: string; name: string; description: string | null; services: string[]; website_url: string | null;
  contact_email: string | null; phone: string | null; country: string | null; city: string | null; status: string; owner_verified: boolean;
  review_note: string | null; category_id: string | null; business_categories: { name: string; slug: string } | null };

export default async function Businesses({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireFeature("businesses");
  const sp = await searchParams;
  const community = await requireCommunity();
  const { user } = await getViewer();
  const supabase = await createClient();
  const tab = sp.tab === "mine" ? "mine" : sp.tab === "new" || sp.edit ? "form" : "directory";
  const { data: categories } = await supabase.from("business_categories").select("id, name, slug").order("name");

  let q = supabase.from("businesses").select("*, business_categories(name, slug)").eq("community_id", community.id).order("name");
  if (tab === "mine") q = q.eq("owner_id", user.id);
  else q = q.eq("status", "approved");
  const search = (sp.q ?? "").trim().slice(0, 80).replace(/[%_,()]/g, " ");
  if (search && tab === "directory") q = q.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  const cat = categories?.find((c) => c.slug === sp.category);
  if (cat && tab === "directory") q = q.eq("category_id", cat.id);
  const { data } = tab === "form" ? { data: [] } : await q.returns<Biz[]>();
  const progress = tab === "mine" ? new Map((await listRuns({ workflowId: "C-business", subjectIds: (data ?? []).map((b) => b.id) })).map((r) => [r.subject_id, r])) : new Map();
  const editing = sp.edit ? (await supabase.from("businesses").select("*").eq("id", sp.edit).eq("owner_id", user.id).maybeSingle<Biz>()).data : null;

  const tabs = [["directory", "Directory", "/app/businesses"], ["mine", "My listings", "/app/businesses?tab=mine"], ["form", "Add a business", "/app/businesses?tab=new"]] as const;
  return (
    <>
      <PageHeader eyebrow="Workflow C" title="Business directory" description="Businesses owned by verified classmates. Every listing is reviewed by class leaders before it appears." />
      <nav aria-label="Business sections" className="mb-6 flex gap-1 rounded-xl border border-line bg-surface p-1 text-sm font-semibold sm:w-max">
        {tabs.map(([k, l, h]) => <Link key={k} href={h} aria-current={tab === k ? "page" : undefined} className={cn("rounded-lg px-4 py-2", tab === k ? "bg-navy text-white" : "text-muted hover:text-ink")}>{l}</Link>)}
      </nav>

      {tab === "directory" && (
        <form method="get" role="search" className="mb-6 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="bq">Search businesses</label>
          <Input id="bq" name="q" defaultValue={sp.q} placeholder="Search businesses or services" />
          <label className="sr-only" htmlFor="bc">Category</label>
          <Select id="bc" name="category" defaultValue={sp.category ?? ""} className="sm:w-64"><option value="">All categories</option>{categories?.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</Select>
          <Button>Search</Button>
        </form>
      )}

      {tab === "form" ? (
        <Card className="max-w-3xl">
          <h2 className="text-lg font-bold">{editing ? "Edit listing" : "Add your business"}</h2>
          {editing?.status === "approved" && <p className="mt-1 text-sm text-warning">Saving changes sends this listing back for review.</p>}
          <ActionForm action={saveBusiness} className="mt-5 grid gap-4 sm:grid-cols-2">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Business name" htmlFor="name" className="sm:col-span-2"><Input id="name" name="name" defaultValue={editing?.name} required maxLength={120} /></Field>
            <Field label="Category" htmlFor="category_id"><Select id="category_id" name="category_id" defaultValue={editing?.category_id ?? ""}><option value="">Choose…</option>{categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Website" htmlFor="website_url"><Input id="website_url" name="website_url" type="url" defaultValue={editing?.website_url ?? ""} placeholder="https://" /></Field>
            <Field label="Description" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" defaultValue={editing?.description ?? ""} maxLength={2000} /></Field>
            <Field label="Services" htmlFor="services" hint="One per line or comma-separated (max 20)." className="sm:col-span-2"><Textarea id="services" name="services" defaultValue={editing?.services?.join("\n")} /></Field>
            <Field label="Contact email" htmlFor="contact_email"><Input id="contact_email" name="contact_email" type="email" defaultValue={editing?.contact_email ?? ""} /></Field>
            <Field label="Phone" htmlFor="phone"><Input id="phone" name="phone" type="tel" defaultValue={editing?.phone ?? ""} /></Field>
            <Field label="Country" htmlFor="country"><Input id="country" name="country" defaultValue={editing?.country ?? ""} /></Field>
            <Field label="City" htmlFor="city"><Input id="city" name="city" defaultValue={editing?.city ?? ""} /></Field>
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <SubmitButton name="intent" value="submit">Save and submit for review</SubmitButton>
              <SubmitButton name="intent" value="draft" variant="secondary">Save draft</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : (data ?? []).length === 0 ? (
        <EmptyState title={tab === "mine" ? "You haven't listed a business" : "No approved businesses yet"}
          action={<ButtonLink href="/app/businesses?tab=new">Add a business</ButtonLink>}>
          {tab === "mine" ? "List your business so classmates can hire and partner with you." : "Be the first classmate to list a business."}
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {data!.map((b) => (
            <li key={b.id}>
              <Card className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">{b.name}</h2>
                    <p className="text-sm text-muted">{[b.business_categories?.name, [b.city, b.country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</p>
                  </div>
                  {tab === "mine" ? <StatusBadge status={b.status} /> : b.owner_verified ? <Badge tone="success">Owner verified</Badge> : null}
                </div>
                {b.description && <p className="mt-3 line-clamp-3 text-[15px]">{b.description}</p>}
                {b.services.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{b.services.map((s) => <Badge key={s}>{s}</Badge>)}</div>}
                {tab === "mine" && b.review_note && <p className="mt-3 text-sm text-muted">Reviewer note: {b.review_note}</p>}
                {tab === "mine" && progress.get(b.id) && <div className="mt-4 rounded-xl bg-surface-2 p-3"><WorkflowSteps steps={progress.get(b.id)!.steps} compact /></div>}
                <div className="mt-auto flex flex-wrap items-center gap-3 pt-5 text-sm font-semibold">
                  {tab === "directory" && <span className="ml-auto order-last"><ReportButton type="business" id={b.id} /></span>}
                  {tab === "directory" && <Link href={`/app/alumni/${b.owner_id}`} className="text-accent-text hover:underline">Owner profile</Link>}
                  {b.website_url && <a href={b.website_url} target="_blank" rel="noopener noreferrer nofollow" className="text-accent-text hover:underline">Website ↗</a>}
                  {b.contact_email && <a href={`mailto:${b.contact_email}`} className="text-accent-text hover:underline">Email</a>}
                  {tab === "mine" && (
                    <>
                      {b.status !== "suspended" && <Link href={`/app/businesses?edit=${b.id}`} className="text-accent-text hover:underline">Edit</Link>}
                      {["draft", "rejected"].includes(b.status) && <form action={submitBusiness}><input type="hidden" name="id" value={b.id} /><Button size="sm">Submit for review</Button></form>}
                      {["draft", "rejected"].includes(b.status) && <form action={deleteBusiness}><input type="hidden" name="id" value={b.id} /><Button size="sm" variant="ghost">Delete</Button></form>}
                    </>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
