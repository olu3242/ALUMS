import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/** GET form → /discover. Works without JavaScript. */
export function ClassFinder({ defaults, className }: { defaults?: { institution?: string; department?: string; year?: string | number }; className?: string }) {
  return (
    <form action="/discover" method="get" role="search" aria-label="Find my class"
      className={cn("grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-lift sm:p-5 md:grid-cols-[1.3fr_1fr_.7fr_auto] md:items-end", className)}>
      <label className="grid gap-1.5 font-heading text-sm font-semibold">Institution
        <Input name="institution" defaultValue={defaults?.institution} placeholder="Search your institution" autoComplete="organization" />
      </label>
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
