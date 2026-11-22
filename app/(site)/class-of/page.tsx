import { CommunityCard } from "@/components/site/community-card";
import { BackendNotice, EmptyState } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { searchCommunities } from "@/lib/queries/public";

export const metadata = { title: "Class Of — browse by graduation year" };

export default async function ClassOf() {
  const { hits, error } = await searchCommunities({}, 50);
  const byYear = new Map<number, typeof hits>();
  hits.forEach((h) => byYear.set(h.graduation_year, [...(byYear.get(h.graduation_year) ?? []), h]));
  const years = [...byYear.keys()].sort((a, b) => b - a);
  return (
    <div className="container py-14">
      <p className="eyebrow">Class Of</p>
      <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">Browse by graduation year</h1>
      {error === "not-configured" ? <div className="mt-8"><BackendNotice /></div> : years.length === 0 ? (
        <div className="mt-8"><EmptyState title="No active communities yet" action={<ButtonLink href="/discover#request">Request your class</ButtonLink>} /></div>
      ) : (
        <>
          <nav aria-label="Years" className="mt-6 flex flex-wrap gap-2">
            {years.map((y) => <a key={y} href={`#y${y}`} className="rounded-full border border-line bg-surface px-3 py-1 font-heading text-sm font-semibold hover:border-accent">{y}</a>)}
          </nav>
          {years.map((y) => (
            <section key={y} id={`y${y}`} className="mt-12 scroll-mt-24" aria-labelledby={`h${y}`}>
              <h2 id={`h${y}`} className="font-serif text-4xl">Class of {y}</h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{byYear.get(y)!.map((c) => <CommunityCard key={c.id} c={c} />)}</div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
