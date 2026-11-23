import { notFound } from "next/navigation";
import { requireFeature } from "@/lib/features";
import { ReportButton } from "@/components/app/report-button";
import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { communityPermissions } from "@/lib/queries/member";
import { setMediaStatus, uploadPhoto } from "@/lib/actions/content";
import { getActiveCommunity } from "@/lib/session";

export const metadata = { title: "Album" };

export default async function Album({ params }: { params: Promise<{ id: string }> }) {
  await requireFeature("gallery");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: album } = await supabase.from("albums").select("id, title, description, community_id").eq("id", id).maybeSingle();
  if (!album) notFound();
  const active = await getActiveCommunity();
  const manage = (await communityPermissions(album.community_id)).has("gallery.manage");
  const { data: media } = await supabase.from("media_assets").select("id, storage_path, caption, status").eq("album_id", id).order("created_at", { ascending: false });
  const items = media ?? [];
  // Private bucket: short-lived signed URLs, issued under the viewer's own session (storage RLS applies).
  const { data: signed } = items.length
    ? await supabase.storage.from("community-media").createSignedUrls(items.map((m) => m.storage_path), 3600)
    : { data: [] };
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <>
      <PageHeader eyebrow="Album" title={album.title} description={album.description ?? undefined} />
      {active?.id === album.community_id && (
        <Card className="mb-8">
          <h2 className="font-bold">Add a photo</h2>
          <ActionForm action={uploadPhoto} resetOnSuccess className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end" encType="multipart/form-data">
            <input type="hidden" name="album_id" value={id} />
            <Field label="Photo (JPEG, PNG, WebP or GIF, up to 5 MB)" htmlFor="file"><Input id="file" name="file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required className="py-2" /></Field>
            <Field label="Caption (optional)" htmlFor="caption"><Input id="caption" name="caption" maxLength={300} /></Field>
            <SubmitButton pendingLabel="Uploading…">Upload</SubmitButton>
          </ActionForm>
        </Card>
      )}
      {items.length === 0 ? <EmptyState title="No photos yet" /> : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => (
            <li key={m.id} className="overflow-hidden rounded-2xl border border-line bg-surface">
              {urls.get(m.storage_path) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls.get(m.storage_path)!} alt={m.caption ?? "Class photo"} loading="lazy" className="aspect-square w-full object-cover" />
              ) : <div className="aspect-square bg-surface-2" />}
              <div className="flex items-center gap-2 p-3 text-sm">
                <span className="line-clamp-1 flex-1">{m.caption}</span>
                {m.status !== "published" && <StatusBadge status={m.status} />}
                <ReportButton type="media" id={m.id} />
                {manage && <form action={setMediaStatus}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="status" value={m.status === "published" ? "hidden" : "published"} />
                  <Button size="sm" variant="ghost">{m.status === "published" ? "Hide" : "Restore"}</Button></form>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
