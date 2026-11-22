import { notFound } from "next/navigation";
import { ReportButton } from "@/components/app/report-button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Notice, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { EventForm } from "@/components/app/event-form";
import { createClient } from "@/lib/supabase/server";
import { getViewer } from "@/lib/session";
import { communityPermissions } from "@/lib/queries/member";
import { markAttendance, rsvp, setEventStatus } from "@/lib/actions/content";
import { cn, formatDateTime } from "@/lib/utils";

export const metadata = { title: "Event" };

export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { user } = await getViewer();
  const supabase = await createClient();
  const { data: e } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
  if (!e) notFound();
  const perms = await communityPermissions(e.community_id);
  const manage = perms.has("event.manage");
  const [{ data: summary }, { data: mine }, attendees] = await Promise.all([
    supabase.rpc("event_rsvp_summary", { p_event_id: id }),
    supabase.from("event_rsvps").select("status, attended").eq("event_id", id).eq("user_id", user.id).maybeSingle(),
    manage ? supabase.rpc("event_attendees", { p_event_id: id }) : Promise.resolve({ data: null }),
  ]);
  const s = (summary as Record<string, number> | null) ?? {};
  const open = e.status === "published" && new Date(e.ends_at ?? e.starts_at) > new Date();
  const rows = (attendees.data as { user_id: string; full_name: string; status: string; attended: boolean }[] | null) ?? [];

  return (
    <>
      <PageHeader eyebrow="Event" title={e.title} description={`${formatDateTime(e.starts_at)}${e.ends_at ? ` – ${formatDateTime(e.ends_at)}` : ""}`}
        actions={<StatusBadge status={e.status} />} />
      {sp.error && <div className="mb-6"><Notice tone="warning">{sp.error}</Notice></div>}
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-sm text-muted">Where</dt><dd className="font-semibold">{e.is_virtual ? "Online" : e.venue ?? "Venue to be confirmed"}</dd></div>
            <div><dt className="text-sm text-muted">Capacity</dt><dd className="font-semibold">{e.capacity ? `${s.going ?? 0} / ${e.capacity} going` : "No limit"}</dd></div>
          </dl>
          {e.description && <p className="mt-6 whitespace-pre-line">{e.description}</p>}
          <div className="mt-6"><ReportButton type="event" id={e.id} /></div>
          {e.is_virtual && e.meeting_url && mine?.status === "going" && <a href={e.meeting_url} target="_blank" rel="noopener noreferrer" className="mt-6 inline-block font-semibold text-accent-text hover:underline">Join online ↗</a>}
        </Card>
        <Card>
          <h2 className="font-bold">Your RSVP</h2>
          <p className="mt-1 text-sm text-muted">{s.going ?? 0} going · {s.maybe ?? 0} maybe</p>
          {open ? (
            <div className="mt-4 grid grid-cols-3 gap-2" role="group" aria-label="RSVP">
              {(["going", "maybe", "declined"] as const).map((st) => (
                <form key={st} action={rsvp}><input type="hidden" name="event_id" value={id} /><input type="hidden" name="status" value={st} />
                  <Button size="sm" variant={mine?.status === st ? "primary" : "secondary"} aria-pressed={mine?.status === st} className="w-full capitalize">{st === "declined" ? "Can't go" : st}</Button></form>
              ))}
            </div>
          ) : <p className="mt-4 text-sm text-muted">{e.status === "cancelled" ? "This event was cancelled." : e.status === "draft" ? "Draft — not visible to members." : "RSVPs are closed."}</p>}
          {mine?.attended && <p className="mt-3 text-sm text-success">Attendance recorded ✓</p>}
        </Card>
      </div>

      {manage && (
        <section className="mt-10 grid gap-6" aria-labelledby="manage">
          <h2 id="manage" className="text-xl font-bold">Manage event</h2>
          <div className="flex flex-wrap gap-2">
            {e.status !== "published" && <form action={setEventStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="published" /><Button size="sm">Publish</Button></form>}
            {e.status === "published" && <form action={setEventStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="cancelled" /><Button size="sm" variant="danger">Cancel event</Button></form>}
          </div>
          <Card>
            <h3 className="font-bold">Attendance</h3>
            {rows.length === 0 ? <p className="mt-2 text-sm text-muted">No RSVPs yet.</p> : (
              <ul className="mt-3 divide-y divide-line">
                {rows.map((r) => (
                  <li key={r.user_id} className="flex flex-wrap items-center gap-3 py-2.5">
                    <span className="flex-1 font-semibold">{r.full_name || "Member"}</span><StatusBadge status={r.status} />
                    <form action={markAttendance}><input type="hidden" name="event_id" value={id} /><input type="hidden" name="user_id" value={r.user_id} />
                      <input type="hidden" name="attended" value={String(!r.attended)} />
                      <Button size="sm" variant={r.attended ? "primary" : "secondary"} className={cn(r.attended && "bg-success text-white")}>{r.attended ? "Attended ✓" : "Mark attended"}</Button></form>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card><h3 className="mb-4 font-bold">Edit details</h3><EventForm event={e} /></Card>
        </section>
      )}
    </>
  );
}
