import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";
import { InstitutionLookup } from "@/components/site/institution-lookup";
import { editCommunity } from "@/lib/actions/admin";
import type { DirectoryCountry } from "@/lib/queries/public";

/** Class identity editor in the same order members search: institution → department → graduation year → name. */
export function ClassDetailsForm({ c, institutionName, canChangeInstitution, countries, idPrefix = "cd" }: {
  c: { id: string; name: string; department_name: string; graduation_year: number };
  institutionName: string | null; canChangeInstitution: boolean; countries: DirectoryCountry[]; idPrefix?: string;
}) {
  const id = (k: string) => `${idPrefix}-${k}-${c.id}`;
  return (
    <ActionForm action={editCommunity} className="grid gap-4 sm:grid-cols-2">
      <input type="hidden" name="id" value={c.id} />
      <div className="sm:col-span-2">
        {canChangeInstitution ? (<>
          <input type="hidden" name="institution_lookup" value="1" />
          <InstitutionLookup label="1. Institution" name="institution_name" idName="directory_id" countries={countries}
            defaultValue={institutionName ?? ""} placeholder="Search institutions worldwide, or type a name" />
          <p className="mt-1.5 text-xs text-muted">Pick from the worldwide directory to use the official name. A new institution is added as unverified
            (shown as “pending confirmation”) until you verify it under Institutions. Clear the field to detach.</p>
        </>) : (
          <p className="text-sm"><span className="font-semibold">1. Institution: </span>{institutionName ?? "Pending confirmation"}
            <span className="block text-xs text-muted">Only platform admins can move a class to another institution.</span></p>
        )}
      </div>
      <Field label="2. Department" htmlFor={id("dept")}>
        <Input id={id("dept")} name="department_name" required minLength={2} maxLength={120} defaultValue={c.department_name} />
      </Field>
      <Field label="3. Graduation year" htmlFor={id("year")}>
        <Input id={id("year")} name="graduation_year" type="number" inputMode="numeric" required min={1900} max={2100} defaultValue={c.graduation_year} />
      </Field>
      <Field label="4. Class name (optional)" htmlFor={id("name")} className="sm:col-span-2" hint="Leave empty to use “Department — Class of Year”.">
        <Input id={id("name")} name="name" maxLength={160} defaultValue={c.name} />
      </Field>
      <p className="text-xs text-muted sm:col-span-2">Saving needs a verified authenticator code and is audited. The class's web address stays the same.</p>
      <div><SubmitButton>Save class details</SubmitButton></div>
    </ActionForm>
  );
}
