import Link from "next/link";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Icon } from "@/components/ui/icons";
import { createClient } from "@/lib/supabase/server";
import { requireCommunity } from "@/lib/session";
import { communityPermissions } from "@/lib/queries/member";
import { createAlbum } from "@/lib/actions/content";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Gallery" };

export default async function Gallery() {
  const community = await requireCommunity();
  const perms = await communityPermissions(community.id);
  const { data } = await (await createClient()).from("albums").select("id, title, description, created_at, media_assets(count)")
    .eq("community_id", community.id).order("created_at", { ascending: false });
  const albums = (data ?? []) as { id: string; title: string; description: string | null; created_at: string; media_assets: { count: number }[] }[];
  return (
    <>
      <PageHeader eyebrow={community.name} title="Class memories" description="Photographs and milestones, visible only to verified members of this class." />
      {perms.has("gallery.manage") && (
        <Card className="mb-8">
          <h2 className="font-bold">New album</h2>
          <ActionForm action={createAlbum} className="mt-4 grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <Field label="Title" htmlFor="title"><Input id="title" name="title" required maxLength={120} /></Field>
            <Field label="Description" htmlFor="description"><Textarea id="description" name="description" className="min-h-11" maxLength={1000} /></Field>
            <SubmitButton>Create album</SubmitButton>
          </ActionForm>
        </Card>
      )}
      {albums.length === 0 ? <EmptyState title="No albums yet">Class leaders create albums; members can add photos to them.</EmptyState> : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {albums.map((a) => (
            <li key={a.id}>
              <Link href={`/app/gallery/${a.id}`}>
                <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-lift">
                  <span className="grid aspect-[4/3] place-items-center rounded-xl bg-champagne/60 text-navy"><Icon name="image" className="h-10 w-10" /></span>
                  <h2 className="mt-4 font-bold">{a.title}</h2>
                  <p className="text-sm text-muted">{a.media_assets?.[0]?.count ?? 0} photos · {formatDate(a.created_at)}</p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
