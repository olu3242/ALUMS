import Link from "next/link";
import { requireFeature } from "@/lib/features";
import { BrandHero, InstitutionLogo } from "@/components/site/brand-hero";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { createClient } from "@/lib/supabase/server";
import { requireCommunity } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Alumni network" };
const KIND: Record<string, string> = { news: "News", opportunity: "Opportunity", event: "Event", spotlight: "Alumni spotlight",
  partner: "Partner", association: "Alumni association", chapter: "Chapter", social: "Official channel", other: "Link" };

export default async function Network() {
  await requireFeature("network");
  const community = await requireCommunity();
  const inst = community.institutions?.status === "verified" ? community.institutions : null;
  if (!inst || !community.institution_id) {
    return (
      <>
        <PageHeader eyebrow={community.name} title="Alumni network" />
        <Notice>Your class's institution hasn't been verified yet. Once it is, its alumni news, opportunities and linkages appear here.</Notice>
      </>
    );
  }
  const supabase = await createClient();
  const [{ data: posts }, { data: links }, { data: classes }] = await Promise.all([
    supabase.from("institution_posts").select("id, kind, audience, title, body, link_url, published_at").eq("institution_id", community.institution_id)
      .eq("status", "published").order("published_at", { ascending: false }).limit(30),
    supabase.from("institution_links").select("id, kind, name, url, description").eq("institution_id", community.institution_id).order("sort_order"),
    supabase.from("class_communities").select("slug, name").eq("institution_id", community.institution_id).eq("status", "active").order("graduation_year", { ascending: false }),
  ]);
  return (
    <>
      <BrandHero branding={inst} className="mb-8 rounded-3xl p-7 sm:p-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <InstitutionLogo b={{ name: inst.name, logo_path: inst.logo_path ?? null, logo_format: inst.logo_format ?? "mark" }} />
          <div>
            <p className="text-sm font-semibold opacity-80">Alumni network</p>
            <h1 className="mt-1 font-serif text-3xl sm:text-4xl">{inst.name}</h1>
            {inst.tagline && <p className="mt-1 opacity-90">{inst.tagline}</p>}
          </div>
        </div>
      </BrandHero>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section aria-labelledby="feed">
          <h2 id="feed" className="mb-4 text-lg font-bold">News & opportunities</h2>
          {(posts ?? []).length === 0 ? <EmptyState title="No updates from the institution yet" /> : (
            <ul className="grid gap-4">
              {posts!.map((p) => (
                <li key={p.id} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <div className="flex flex-wrap items-center gap-2"><Badge tone="accent">{KIND[p.kind]}</Badge>{p.audience === "alumni" && <Badge>Alumni only</Badge>}<span className="text-xs text-muted">{formatDate(p.published_at)}</span></div>
                  <h3 className="mt-2 font-bold">{p.title}</h3>
                  <p className="mt-1 whitespace-pre-line text-[15px] text-muted">{p.body}</p>
                  {p.link_url && <a href={p.link_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline">Learn more ↗</a>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <aside className="grid content-start gap-6">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="font-bold">Linkages</h2>
            {(links ?? []).length === 0 ? <p className="mt-2 text-sm text-muted">None yet.</p> : (
              <ul className="mt-3 grid gap-3 text-sm">{links!.map((l) => (
                <li key={l.id}><p className="text-xs font-semibold uppercase tracking-wider text-muted">{KIND[l.kind]}</p>
                  {l.url ? <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-accent-text hover:underline">{l.name} ↗</a> : <p className="font-semibold">{l.name}</p>}
                  {l.description && <p className="text-muted">{l.description}</p>}</li>
              ))}</ul>
            )}
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="font-bold">Other classes</h2>
            <ul className="mt-3 grid gap-1.5 text-sm">{(classes ?? []).map((c) => <li key={c.slug}><Link className="font-semibold hover:text-accent-text" href={`/community/${c.slug}`}>{c.name}</Link></li>)}</ul>
            {inst.slug && <Link href={`/institution/${inst.slug}`} className="mt-4 inline-block text-sm font-semibold text-accent-text hover:underline">Public institution page →</Link>}
          </div>
        </aside>
      </div>
    </>
  );
}
