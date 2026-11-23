import { Card } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { StatusBadge } from "@/components/ui/badge";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { NeedsCommunity } from "@/components/app/scope-note";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { moderateContent } from "@/lib/actions/admin";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Content" };
type Op = { op: string; label: string; danger?: boolean };

function Ops({ id, ops }: { id: string; ops: Op[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ops.map((o) => (
        <ActionForm key={o.op} action={moderateContent}>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={o.op} />
          <SubmitButton size="sm" variant={o.danger ? "danger" : "secondary"}>{o.label}</SubmitButton>
        </ActionForm>
      ))}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: { id: string; label: string; meta: string; status?: string; ops: Op[] }[] }) {
  return (
    <section className="mb-8" aria-label={title}>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted">Nothing here yet.</p> : (
        <ul className="grid gap-2">
          {rows.map((r) => (
            <li key={r.id}><Card className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="font-semibold">{r.label}</p><p className="text-xs text-muted">{r.meta}</p></div>
              {r.status && <StatusBadge status={r.status} />}
              <Ops id={r.id} ops={r.ops} />
            </Card></li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function Content() {
  const ctx = await requireAdmin();
  if (ctx.current.scope_type !== "community") return <><PageHeader title="Content" /><NeedsCommunity next="/admin/content" /></>;
  const cid = ctx.current.scope_id!;
  const has = (p: string) => ctx.permissions.has(p);
  const supabase = await createClient();
  const [ev, an, bz, md] = await Promise.all([
    has("event.manage") ? supabase.from("events").select("id, title, status, starts_at").eq("community_id", cid).order("starts_at", { ascending: false }).limit(50) : { data: [] },
    has("announcement.publish") ? supabase.from("announcements").select("id, title, created_at").eq("community_id", cid).order("created_at", { ascending: false }).limit(50) : { data: [] },
    has("business.review") ? supabase.from("businesses").select("id, name, status, created_at").eq("community_id", cid).neq("status", "draft").order("created_at", { ascending: false }).limit(50) : { data: [] },
    has("gallery.manage") ? supabase.from("media_assets").select("id, caption, status, created_at").eq("community_id", cid).order("created_at", { ascending: false }).limit(50) : { data: [] },
  ]);
  const none = !["event.manage", "announcement.publish", "business.review", "gallery.manage"].some(has);
  return (
    <>
      <PageHeader eyebrow={ctx.current.label} title="Content" description="Edit, hide or remove class content. Published events are cancelled rather than deleted so attendees keep a record; drafts can be deleted. Every change is audited." />
      {none ? <EmptyState title="No content permissions in this scope" /> : <>
        {has("event.manage") && <Section title="Events" rows={(ev.data ?? []).map((e) => ({ id: e.id, label: e.title, meta: formatDate(e.starts_at), status: e.status,
          ops: e.status === "draft" ? [{ op: "event.publish", label: "Publish" }, { op: "event.delete", label: "Delete draft", danger: true }]
            : e.status === "published" ? [{ op: "event.cancel", label: "Cancel event", danger: true }] : [{ op: "event.publish", label: "Re-publish" }] }))} />}
        {has("announcement.publish") && <Section title="Announcements" rows={(an.data ?? []).map((a) => ({ id: a.id, label: a.title, meta: formatDate(a.created_at),
          ops: [{ op: "announcement.delete", label: "Delete", danger: true }] }))} />}
        {has("business.review") && <Section title="Business listings" rows={(bz.data ?? []).map((b) => ({ id: b.id, label: b.name, meta: formatDate(b.created_at), status: b.status,
          ops: b.status === "submitted" ? [{ op: "business.approve", label: "Approve" }, { op: "business.reject", label: "Reject", danger: true }]
            : b.status === "approved" ? [{ op: "business.suspend", label: "Suspend", danger: true }] : [] }))} />}
        {has("gallery.manage") && <Section title="Gallery photos" rows={(md.data ?? []).map((m) => ({ id: m.id, label: m.caption || "Untitled photo", meta: formatDate(m.created_at), status: m.status,
          ops: m.status === "published" ? [{ op: "media.hide", label: "Hide", danger: true }] : [{ op: "media.show", label: "Restore" }] }))} />}
      </>}
    </>
  );
}
