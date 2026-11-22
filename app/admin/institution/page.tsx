import { Card } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { BrandHero, InstitutionLogo } from "@/components/site/brand-hero";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { addInstitutionLink, deleteInstitutionLink, publishInstitutionPost, saveBranding, setPostStatus } from "@/lib/actions/institution";
import { contrast, isUsableBackground, readableOn } from "@/lib/brand";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Institution brand & network" };

export default async function InstitutionAdmin() {
  const ctx = await requireAdmin("institution.brand");
  if (ctx.current.scope_type !== "institution") {
    return <><PageHeader title="Institution brand & network" /><Notice>Choose an institution in the <strong>Admin scope</strong> selector.</Notice></>;
  }
  const id = ctx.current.scope_id!;
  const supabase = await createClient();
  const [{ data: inst }, { data: posts }, { data: links }] = await Promise.all([
    supabase.from("institutions").select("id, name, slug, status, logo_path, logo_format, brand_primary, brand_accent, tagline, about, public_page").eq("id", id).single(),
    supabase.from("institution_posts").select("id, kind, audience, title, status, published_at").eq("institution_id", id).order("published_at", { ascending: false }).limit(50),
    supabase.from("institution_links").select("id, kind, name, url").eq("institution_id", id).order("sort_order"),
  ]);
  if (!inst) return <Notice tone="warning">Institution not found.</Notice>;
  const canNetwork = ctx.permissions.has("institution.network");
  const primaryOk = !inst.brand_primary || isUsableBackground(inst.brand_primary);

  return (
    <>
      <PageHeader eyebrow={inst.name} title="Institution brand & network"
        description={<>Customise how your institution appears to alumni and the public, and run its alumni network. {inst.status === "verified" && inst.public_page && <a className="font-semibold text-accent-text underline" href={`/institution/${inst.slug}`} target="_blank" rel="noreferrer">View public page ↗</a>}</>} />
      {inst.status !== "verified" && <div className="mb-6"><Notice tone="warning">This institution isn't verified yet, so its public page and branding stay hidden from alumni.</Notice></div>}

      <section className="mb-10 grid gap-6 lg:grid-cols-[1fr_380px]" aria-labelledby="brand">
        <Card>
          <h2 id="brand" className="text-lg font-bold">Branding</h2>
          <ActionForm action={saveBranding} className="mt-5 grid gap-4 sm:grid-cols-2" encType="multipart/form-data">
            <input type="hidden" name="institution_id" value={inst.id} />
            <Field label="Logo (PNG, JPEG or WebP, up to 1 MB)" htmlFor="logo" className="sm:col-span-2"><Input id="logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" className="py-2" /></Field>
            <Field label="Logo format" htmlFor="logo_format" hint="Mark = square emblem. Wordmark = wide logo with the name.">
              <Select id="logo_format" name="logo_format" defaultValue={inst.logo_format}><option value="mark">Square mark</option><option value="wordmark">Wide wordmark</option></Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Primary colour" htmlFor="brand_primary"><Input id="brand_primary" name="brand_primary" type="color" defaultValue={inst.brand_primary ?? "#10243A"} className="h-11 p-1" /></Field>
              <Field label="Accent colour" htmlFor="brand_accent"><Input id="brand_accent" name="brand_accent" type="color" defaultValue={inst.brand_accent ?? "#D8AD58"} className="h-11 p-1" /></Field>
            </div>
            <Field label="Tagline" htmlFor="tagline" className="sm:col-span-2"><Input id="tagline" name="tagline" maxLength={160} defaultValue={inst.tagline ?? ""} /></Field>
            <Field label="About (public)" htmlFor="about" className="sm:col-span-2"><Textarea id="about" name="about" maxLength={2000} defaultValue={inst.about ?? ""} /></Field>
            <div className="sm:col-span-2"><Checkbox name="public_page" defaultChecked={inst.public_page} label="Publish a public institution page" hint="Shows branding, public news, linkages and class communities. Member data is never public." /></div>
            <div><SubmitButton pendingLabel="Saving…">Save branding</SubmitButton></div>
          </ActionForm>
        </Card>
        <div className="grid content-start gap-3">
          <p className="text-sm font-semibold">Preview</p>
          <BrandHero branding={inst} className="rounded-3xl p-6">
            <div className="flex items-center gap-4">
              <InstitutionLogo b={inst} />
              <div><p className="text-xs font-semibold opacity-80">Alumni network</p><p className="font-serif text-2xl">{inst.name}</p>{inst.tagline && <p className="text-sm opacity-90">{inst.tagline}</p>}</div>
            </div>
          </BrandHero>
          {inst.brand_primary && (
            primaryOk
              ? <p className="text-xs text-muted">Text on your primary colour: {contrast(inst.brand_primary, readableOn(inst.brand_primary)).toFixed(1)}:1 (meets WCAG AA).</p>
              : <Notice tone="warning">Your primary colour can't carry readable text (below 4.5:1 with white or navy), so ALUMS navy is used instead. Choose a darker or lighter shade.</Notice>
          )}
        </div>
      </section>

      {canNetwork && (
        <section className="grid gap-6 lg:grid-cols-2" aria-label="Alumni network">
          <Card>
            <h2 className="text-lg font-bold">News & opportunities</h2>
            <p className="text-sm text-muted">Public posts appear on the institution page (PR). Alumni-only posts reach verified members of its classes.</p>
            <ActionForm action={publishInstitutionPost} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="institution_id" value={inst.id} />
              <Field label="Type" htmlFor="kind"><Select id="kind" name="kind" defaultValue="news"><option value="news">News</option><option value="opportunity">Opportunity (jobs, scholarships)</option><option value="event">Event</option><option value="spotlight">Alumni spotlight</option></Select></Field>
              <Field label="Audience" htmlFor="audience"><Select id="audience" name="audience" defaultValue="alumni"><option value="alumni">Alumni only</option><option value="public">Public</option></Select></Field>
              <Field label="Title" htmlFor="ptitle" className="sm:col-span-2"><Input id="ptitle" name="title" required maxLength={160} /></Field>
              <Field label="Message" htmlFor="pbody" className="sm:col-span-2"><Textarea id="pbody" name="body" required maxLength={5000} /></Field>
              <Field label="Link (optional)" htmlFor="plink" className="sm:col-span-2"><Input id="plink" name="link_url" type="url" placeholder="https://" /></Field>
              <div><SubmitButton>Publish</SubmitButton></div>
            </ActionForm>
            {(posts ?? []).length === 0 ? <div className="mt-6"><EmptyState title="Nothing published yet" /></div> : (
              <ul className="mt-6 divide-y divide-line">
                {posts!.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 font-semibold">{p.title}</span>
                    <Badge>{p.audience}</Badge><StatusBadge status={p.status} /><span className="text-xs text-muted">{formatDate(p.published_at)}</span>
                    <form action={setPostStatus}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="status" value={p.status === "published" ? "hidden" : "published"} />
                      <Button size="sm" variant="ghost">{p.status === "published" ? "Hide" : "Publish"}</Button></form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <h2 className="text-lg font-bold">Linkages</h2>
            <p className="text-sm text-muted">Partners, alumni associations, chapters and official channels — shown publicly and to alumni.</p>
            <ActionForm action={addInstitutionLink} resetOnSuccess className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="institution_id" value={inst.id} />
              <Field label="Type" htmlFor="lkind"><Select id="lkind" name="kind" defaultValue="association"><option value="association">Alumni association</option><option value="chapter">Chapter</option><option value="partner">Partner organisation</option><option value="social">Official channel</option><option value="other">Other</option></Select></Field>
              <Field label="Name" htmlFor="lname"><Input id="lname" name="name" required maxLength={120} /></Field>
              <Field label="Link" htmlFor="lurl" className="sm:col-span-2"><Input id="lurl" name="url" type="url" placeholder="https://" /></Field>
              <Field label="Description (optional)" htmlFor="ldesc" className="sm:col-span-2"><Input id="ldesc" name="description" maxLength={500} /></Field>
              <div><SubmitButton>Add linkage</SubmitButton></div>
            </ActionForm>
            {(links ?? []).length > 0 && (
              <ul className="mt-6 divide-y divide-line text-sm">
                {links!.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 py-2.5">
                    <span className="min-w-0 flex-1"><span className="font-semibold">{l.name}</span> <span className="text-muted">· {l.kind}</span></span>
                    <form action={deleteInstitutionLink}><input type="hidden" name="id" value={l.id} /><Button size="sm" variant="ghost">Remove</Button></form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}
    </>
  );
}
