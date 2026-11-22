import { Input } from "@/components/ui/form";
import { InstitutionLookup } from "@/components/site/institution-lookup";
import { getDirectoryCountries } from "@/lib/queries/public";
import { cn } from "@/lib/utils";

/** GET form → /discover. Institution is a worldwide typeahead; works as plain text without JavaScript. */
export async function ClassFinder({ defaults, className }: { defaults?: { institution?: string; department?: string; year?: string | number; country?: string }; className?: string }) {
  const countries = await getDirectoryCountries();
  return (
    <form action="/discover" method="get" role="search" aria-label="Find my class"
      className={cn("grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-lift sm:p-5 lg:grid-cols-[2.2fr_1fr_.7fr_auto] lg:items-end", className)}>
      <InstitutionLookup name="institution" countryName="country" countries={countries} defaultValue={defaults?.institution} defaultCountry={defaults?.country} />
      <label className="grid gap-1.5 font-heading text-sm font-semibold">Department / course
        <Input name="department" defaultValue={defaults?.department} placeholder="e.g. Accounting" />
      </label>
      <label className="grid gap-1.5 font-heading text-sm font-semibold">Graduation year
        <Input name="year" defaultValue={defaults?.year} inputMode="numeric" pattern="[0-9]{4}" placeholder="e.g. 2007" />
      </label>
      <button type="submit" className="h-11 rounded-xl bg-primary px-6 font-heading font-semibold text-primary-fg transition hover:brightness-110">Find my class</button>
    </form>
  );
}
