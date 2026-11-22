import Link from "next/link";
import { Avatar, EmptyState, PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { getViewer, requireCommunity } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Alumni directory" };

type Row = { user_id: string; full_name: string | null; headline: string | null; profession: string | null; industry: string | null;
  employer: string | null; job_title: string | null; country: string | null; city: string | null; is_business_owner: boolean;
  open_to_mentoring: boolean; community_ids: string[]; total_count: number };

const PAGE = 24;
const str = (v: unknown, max = 100) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export default async function Alumni({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const community = await requireCommunity();
  const { activeMemberships } = await getViewer();
  const scope = sp.scope === "all" ? "all" : "class";
  const view = sp.view === "list" ? "list" : "grid";
  const page = Math.max(1, Number(sp.page) || 1);
  const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : null;
  const owner = sp.owner === "yes" ? true : null;

  const { data, error } = await (await createClient()).rpc("community_directory", {
    p_community_id: scope === "all" ? null : community.id,
    p_search: str(sp.q) || null, p_graduation_year: scope === "all" ? year : null, p_department: scope === "all" ? str(sp.department) || null : null,
    p_institution_id: scope === "all" && /^[0-9a-f-]{36}$/.test(sp.institution ?? "") ? sp.institution : null,
    p_profession: str(sp.profession) || null, p_industry: str(sp.industry) || null, p_country: str(sp.country) || null,
    p_city: str(sp.city) || null, p_business_owner: owner, p_limit: PAGE, p_offset: (page - 1) * PAGE,
  });
  const rows = (data as Row[] | null) ?? [];
  const total = rows[0]?.total_count ?? 0;
  const names = new Map(activeMemberships.map((m) => [m.community_id, m.class_communities.name]));
  const qs = (patch: Record<string, string | undefined>) => "?" + new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]).toString();
  const years = [...new Set(activeMemberships.map((m) => m.class_communities.graduation_year))].sort();
  const departments = [...new Set(activeMemberships.map((m) => m.class_communities.department_name))].sort();
  const institutions = [...new Map(activeMemberships.filter((m) => m.class_communities.institution_id && m.class_communities.institutions?.status === "verified")
    .map((m) => [m.class_communities.institution_id!, m.class_communities.institutions!.name])).entries()];

  return (
    <>
      <PageHeader eyebrow={scope === "all" ? "All my classes" : community.name} title="Alumni directory"
        description="Only verified members appear, and each person's visibility settings are respected. Filters only match what you're allowed to see." />
      <form method="get" className="mb-6 grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:grid-cols-2 lg:grid-cols-4" role="search" aria-label="Filter directory">
        <input type="hidden" name="view" value={view} />
        <label className="grid gap-1 text-sm font-semibold lg:col-span-2">Name, headline or employer<Input name="q" defaultValue={sp.q} /></label>
        <label className="grid gap-1 text-sm font-semibold">Profession<Input name="profession" defaultValue={sp.profession} /></label>
        <label className="grid gap-1 text-sm font-semibold">Industry<Input name="industry" defaultValue={sp.industry} /></label>
        <label className="grid gap-1 text-sm font-semibold">Country<Input name="country" defaultValue={sp.country} /></label>
        <label className="grid gap-1 text-sm font-semibold">City<Input name="city" defaultValue={sp.city} /></label>
        <label className="grid gap-1 text-sm font-semibold">Search in
          <Select name="scope" defaultValue={scope}><option value="class">This class</option><option value="all">All my classes</option></Select>
        </label>
        <label className="grid gap-1 text-sm font-semibold">Business owners
          <Select name="owner" defaultValue={sp.owner ?? ""}><option value="">Everyone</option><option value="yes">Business owners only</option></Select>
        </label>
        {scope === "all" && (
          <>
            <label className="grid gap-1 text-sm font-semibold">Institution
              <Select name="institution" defaultValue={sp.institution ?? ""}><option value="">Any</option>{institutions.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</Select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">Graduation year
              <Select name="year" defaultValue={sp.year ?? ""}><option value="">Any</option>{years.map((y) => <option key={y}>{y}</option>)}</Select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">Department
              <Select name="department" defaultValue={sp.department ?? ""}><option value="">Any</option>{departments.map((d) => <option key={d}>{d}</option>)}</Select>
            </label>
          </>
        )}
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button className="h-11 rounded-xl bg-primary px-5 font-heading font-semibold text-primary-fg">Apply filters</button>
          <Link href="/app/alumni" className="h-11 px-3 py-2.5 text-sm font-semibold text-muted hover:text-ink">Reset</Link>
          <div className="ml-auto flex rounded-xl border border-line p-1" role="group" aria-label="Layout">
            <Link href={qs({ view: "grid" })} aria-current={view === "grid" ? "true" : undefined} className={cn("rounded-lg p-2", view === "grid" && "bg-surface-2")}><Icon name="grid" label="Grid view" /></Link>
            <Link href={qs({ view: "list" })} aria-current={view === "list" ? "true" : undefined} className={cn("rounded-lg p-2", view === "list" && "bg-surface-2")}><Icon name="list" label="List view" /></Link>
          </div>
        </div>
      </form>

      <p className="mb-4 text-sm text-muted" aria-live="polite">{error ? "The directory couldn't be loaded." : `${total} ${total === 1 ? "member" : "members"}`}</p>
      {rows.length === 0 ? <EmptyState title="No classmates match">Try fewer filters. Members who hide a field won't match filters on it.</EmptyState> : (
        <ul className={cn(view === "grid" ? "grid gap-4 sm:grid-cols-2 xl:grid-cols-3" : "divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface")}>
          {rows.map((r) => (
            <li key={r.user_id}>
              <Link href={`/app/alumni/${r.user_id}`} className={cn("flex gap-4 transition", view === "grid"
                ? "h-full rounded-2xl border border-line bg-surface p-5 shadow-card hover:-translate-y-0.5 hover:shadow-lift" : "items-center p-4 hover:bg-surface-2")}>
                <Avatar name={r.full_name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{r.full_name ?? "Classmate (name hidden)"}</p>
                  <p className="truncate text-sm text-muted">{r.headline ?? ([r.job_title, r.employer].filter(Boolean).join(" · ") || r.profession || "—")}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(r.city || r.country) && <Badge>{[r.city, r.country].filter(Boolean).join(", ")}</Badge>}
                    {r.industry && <Badge>{r.industry}</Badge>}
                    {r.is_business_owner && <Badge tone="accent">Business owner</Badge>}
                    {r.open_to_mentoring && <Badge tone="success">Mentor</Badge>}
                    {scope === "all" && r.community_ids.slice(0, 2).map((c) => <Badge key={c}>{names.get(c)}</Badge>)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > PAGE && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
          {page > 1 ? <Link href={qs({ page: String(page - 1) })} className="font-semibold text-accent-text">← Previous</Link> : <span />}
          <span className="text-muted">Page {page} of {Math.ceil(total / PAGE)}</span>
          {page * PAGE < total ? <Link href={qs({ page: String(page + 1) })} className="font-semibold text-accent-text">Next →</Link> : <span />}
        </nav>
      )}
    </>
  );
}
