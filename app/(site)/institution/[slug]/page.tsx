import { notFound } from "next/navigation";
import Link from "next/link";
import { BrandHero, InstitutionLogo } from "@/components/site/brand-hero";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Reveal } from "@/components/site/reveal";
import { createClient } from "@/lib/supabase/server";
import { isBackendConfigured } from "@/lib/env";
import { formatDate } from "@/lib/utils";

type Inst = { id: string; name: string; slug: string; country: string | null; city: string | null; website_url: string | null;
  status: string; logo_path: string | null; logo_format: string; brand_primary: string | null; brand_accent: string | null;
  tagline: string | null; about: string | null; public_page: boolean };
type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  if (!isBackendConfigured() || !/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data: inst } = await supabase.from("institutions")
    .select("id, name, slug, country, city, website_url, status, logo_path, logo_format, brand_primary, brand_accent, tagline, about, public_page")
    .eq("slug", slug).eq("status", "verified").maybeSingle<Inst>();
  if (!inst || !inst.public_page) return null;
  const [{ data: classes }, { data: posts }, { data: links }] = await Promise.all([
    supabase.from("class_communities").select("slug, name, graduation_year, department_name").eq("institution_id", inst.id).eq("status", "active").order("graduation_year", { ascending: false }),
    supabase.from("institution_posts").select("id, kind, audience, title, body, link_url, published_at").eq("institution_id", inst.id).eq("status", "published").order("published_at", { ascending: false }).limit(12),
    supabase.from("institution_links").select("id, kind, name, url, description").eq("institution_id", inst.id).order("sort_order"),
  ]);
  return { inst, classes: classes ?? [], posts: posts ?? [], links: links ?? [] };
}

export async function generateMetadata({ params }: Params) {
  const d = await load((await params).slug);
  return { title: d ? `${d.inst.name} alumni` : "Institution", description: d?.inst.tagline ?? undefined };
}

const KIND: Record<string, string> = { news: "News", opportunity: "Opportunity", event: "Event", spotlight: "Alumni spotlight",
  partner: "Partner", association: "Alumni association", chapter: "Chapter", social: "Official channel", other: "Link" };

export default async function InstitutionPage({ params }: Params) {
  const d = await load((await params).slug);
  if (!d) notFound();
  const { inst, classes, posts, links } = d;
  return (
    <>
      <BrandHero branding={inst} className="py-16 sm:py-20">
        <div className="container flex flex-col gap-6 sm:flex-row sm:items-center">
          <InstitutionLogo b={inst} />
          <div>
            <p className="text-sm font-semibold opacity-80">Alumni network · {[inst.city, inst.country].filter(Boolean).join(", ")}</p>
            <h1 className="mt-1 font-serif text-4xl font-normal sm:text-5xl">{inst.name}</h1>
            {inst.tagline && <p className="mt-2 text-lg opacity-90">{inst.tagline}</p>}
          </div>
        </div>
      </BrandHero>
      <div className="container grid gap-10 py-14 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-10">
          {inst.about && <Reveal><h2 className="text-xl font-bold">About</h2><p className="mt-3 max-w-prose whitespace-pre-line text-muted">{inst.about}</p></Reveal>}
          <section aria-labelledby="news">
            <h2 id="news" className="text-xl font-bold">News & opportunities</h2>
            {posts.length === 0 ? <div className="mt-4"><EmptyState title="No public updates yet" /></div> : (
              <ul className="mt-4 grid gap-4">
                {posts.map((p, i) => (
                  <Reveal as="li" key={p.id} delay={i * 60} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
                    <div className="flex items-center gap-2"><Badge tone="accent">{KIND[p.kind]}</Badge><span className="text-xs text-muted">{formatDate(p.published_at)}</span></div>
                    <h3 className="mt-2 font-bold">{p.title}</h3>
                    <p className="mt-1 whitespace-pre-line text-[15px] text-muted">{p.body}</p>
                    {p.link_url && <a href={p.link_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline">Learn more ↗</a>}
                  </Reveal>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm text-muted">Verified alumni see additional alumni-only updates after signing in.</p>
          </section>
        </div>
        <aside className="grid content-start gap-6">
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
            <h2 className="font-bold">Class communities</h2>
            {classes.length === 0 ? <p className="mt-2 text-sm text-muted">No active classes yet.</p> : (
              <ul className="mt-3 grid gap-1.5 text-sm">{classes.map((c) => <li key={c.slug}><Link href={`/community/${c.slug}`} className="font-semibold hover:text-accent-text">{c.name}</Link></li>)}</ul>
            )}
            <ButtonLink href={`/discover?institution=${encodeURIComponent(inst.name)}#request`} variant="secondary" size="sm" className="mt-4">Request your class</ButtonLink>
          </div>
          {links.length > 0 && (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-card">
              <h2 className="font-bold">Linkages</h2>
              <ul className="mt-3 grid gap-3 text-sm">
                {links.map((l) => (
                  <li key={l.id}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">{KIND[l.kind]}</p>
                    {l.url ? <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-accent-text hover:underline">{l.name} ↗</a> : <p className="font-semibold">{l.name}</p>}
                    {l.description && <p className="text-muted">{l.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {inst.website_url && <a href={inst.website_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-accent-text hover:underline">Official website ↗</a>}
        </aside>
      </div>
    </>
  );
}
