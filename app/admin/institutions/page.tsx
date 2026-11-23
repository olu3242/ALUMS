import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { createInstitution, deleteInstitution, setInstitutionStatus, updateInstitution } from "@/lib/actions/admin";
import { DeleteForm } from "@/components/app/delete-form";
import { InstitutionLookup } from "@/components/site/institution-lookup";
import { getDirectoryCountries } from "@/lib/queries/public";

export const metadata = { title: "Institutions" };

export default async function Institutions() {
  await requireAdmin("institution.manage");
  const countries = await getDirectoryCountries();
  const { data } = await (await createClient()).from("institutions").select("id, name, country, city, website_url, status").order("name");
  const rows = data ?? [];
  return (
    <>
      <PageHeader title="Institutions" description="Only verified institutions are shown publicly. Unverified ones stay hidden from alumni." />
      {rows.length === 0 ? <EmptyState title="No institutions yet" /> : (
        <ul className="mb-10 grid gap-3">
          {rows.map((i) => (
            <li key={i.id}><Card className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1"><p className="font-semibold">{i.name}</p><p className="text-sm text-muted">{[i.city, i.country].filter(Boolean).join(", ") || "Location not set"}</p></div>
              <StatusBadge status={i.status} />
              <ActionForm action={setInstitutionStatus} className="flex gap-2">
                <input type="hidden" name="id" value={i.id} />
                <label className="sr-only" htmlFor={`is-${i.id}`}>Status</label>
                <Select id={`is-${i.id}`} name="status" defaultValue={i.status} className="h-9 text-sm"><option value="unverified">Unverified</option><option value="verified">Verified</option><option value="archived">Archived</option></Select>
                <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
              </ActionForm>
              <details className="w-full">
                <summary className="cursor-pointer text-sm font-semibold text-accent-text">Edit or delete</summary>
                <ActionForm action={updateInstitution} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={i.id} />
                  <Field label="Name" htmlFor={`in-${i.id}`} className="sm:col-span-2" hint="Renaming unlinks the worldwide-directory entry."><Input id={`in-${i.id}`} name="name" required minLength={2} maxLength={200} defaultValue={i.name} /></Field>
                  <Field label="Country" htmlFor={`ic-${i.id}`}><Input id={`ic-${i.id}`} name="country" maxLength={80} defaultValue={i.country ?? ""} /></Field>
                  <Field label="City" htmlFor={`iy-${i.id}`}><Input id={`iy-${i.id}`} name="city" maxLength={80} defaultValue={i.city ?? ""} /></Field>
                  <Field label="Website" htmlFor={`iw-${i.id}`} className="sm:col-span-2"><Input id={`iw-${i.id}`} name="website_url" type="url" placeholder="https://" defaultValue={i.website_url ?? ""} /></Field>
                  <div><SubmitButton size="sm">Save details</SubmitButton></div>
                </ActionForm>
                <div className="mt-4"><DeleteForm action={deleteInstitution} id={i.id} label="Delete institution"
                  hint="Only possible when no classes, affiliations, posts or admins use it. Otherwise set it to Archived." /></div>
              </details>
            </Card></li>
          ))}
        </ul>
      )}
      <Card>
        <h2 className="text-lg font-bold">Add an institution</h2>
        <ActionForm action={createInstitution} resetOnSuccess className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <InstitutionLookup label="Name" name="name" idName="directory_id" countryName="lookup_country" countries={countries} required
              placeholder="Search the worldwide directory, or type a new name" />
            <p className="mt-1.5 text-xs text-muted">Picking a directory entry uses its official name and country, and keeps a link to it.</p>
          </div>
          <Field label="Country" htmlFor="country"><Input id="country" name="country" maxLength={80} /></Field>
          <Field label="City" htmlFor="city"><Input id="city" name="city" maxLength={80} /></Field>
          <Field label="Website" htmlFor="website_url" className="sm:col-span-2"><Input id="website_url" name="website_url" type="url" placeholder="https://" /></Field>
          <div className="sm:col-span-2"><Checkbox name="verified" label="Identity verified (official records checked)" /></div>
          <div><SubmitButton>Add institution</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
