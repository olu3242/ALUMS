import { Card } from "@/components/ui/card";
import { requireFeature } from "@/lib/features";
import { ReportButton } from "@/components/app/report-button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireCommunity } from "@/lib/session";
import { communityPermissions } from "@/lib/queries/member";
import { deleteAnnouncement, publishAnnouncement } from "@/lib/actions/content";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Announcements" };

export default async function Announcements() {
  await requireFeature("announcements");
  const community = await requireCommunity();
  const canPublish = (await communityPermissions(community.id)).has("announcement.publish");
  const { data } = await (await createClient()).from("announcements").select("id, title, body, is_pinned, published_at")
    .eq("community_id", community.id).order("is_pinned", { ascending: false }).order("published_at", { ascending: false }).limit(50);
  const items = data ?? [];
  return (
    <>
      <PageHeader eyebrow={community.name} title="Announcements" description="Updates from your class leaders." />
      {canPublish && (
        <Card className="mb-8">
          <h2 className="font-bold">Publish an announcement</h2>
          <p className="text-sm text-muted">Every verified member is notified.</p>
          <ActionForm action={publishAnnouncement} resetOnSuccess className="mt-4 grid gap-4">
            <Field label="Title" htmlFor="title"><Input id="title" name="title" required maxLength={160} /></Field>
            <Field label="Message" htmlFor="body"><Textarea id="body" name="body" required maxLength={10000} /></Field>
            <Checkbox name="is_pinned" label="Pin to the top of the feed" />
            <div><SubmitButton pendingLabel="Publishing…">Publish</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
      {items.length === 0 ? <EmptyState title="No announcements yet" /> : (
        <ol className="grid gap-4">
          {items.map((a) => (
            <li key={a.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {a.is_pinned && <p className="eyebrow">Pinned</p>}
                    <h2 className="text-lg font-bold">{a.title}</h2>
                    <p className="text-sm text-muted"><time dateTime={a.published_at}>{formatDateTime(a.published_at)}</time></p>
                  </div>
                  {canPublish && <form action={deleteAnnouncement}><input type="hidden" name="id" value={a.id} /><Button size="sm" variant="ghost">Delete</Button></form>}
                </div>
                <p className="mt-4 whitespace-pre-line">{a.body}</p>
                <div className="mt-4"><ReportButton type="announcement" id={a.id} /></div>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
