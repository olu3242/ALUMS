import Link from "next/link";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireCommunity } from "@/lib/session";
import { communityPermissions } from "@/lib/queries/member";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Events" };

export default async function Events({ searchParams }: { searchParams: Promise<{ when?: string }> }) {
  const { when } = await searchParams;
  const community = await requireCommunity();
  const perms = await communityPermissions(community.id);
  const now = new Date().toISOString();
  let q = (await createClient()).from("events").select("id, title, starts_at, venue, is_virtual, status, capacity").eq("community_id", community.id);
  q = when === "past" ? q.lt("starts_at", now).order("starts_at", { ascending: false }) : q.gte("starts_at", now).order("starts_at");
  const { data } = await q.limit(50);
  const events = data ?? [];
  return (
    <>
      <PageHeader eyebrow="Workflow D" title="Events & reunions" description="RSVP to gatherings organised by your class leaders."
        actions={perms.has("event.create") ? <ButtonLink href="/app/events/new">Create event</ButtonLink> : undefined} />
      <nav className="mb-6 flex gap-4 text-sm font-semibold" aria-label="Event timeframe">
        <Link href="/app/events" aria-current={when !== "past" ? "page" : undefined} className={when !== "past" ? "text-accent-text" : "text-muted"}>Upcoming</Link>
        <Link href="/app/events?when=past" aria-current={when === "past" ? "page" : undefined} className={when === "past" ? "text-accent-text" : "text-muted"}>Past</Link>
      </nav>
      {events.length === 0 ? <EmptyState title={when === "past" ? "No past events" : "No upcoming events"}>When leaders publish an event, it will appear here.</EmptyState> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {events.map((e) => {
            const d = new Date(e.starts_at);
            return (
              <li key={e.id}>
                <Link href={`/app/events/${e.id}`} className="block h-full">
                  <Card className="flex h-full gap-5 transition hover:-translate-y-0.5 hover:shadow-lift">
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-navy text-center text-white">
                      <span className="text-xs font-bold uppercase tracking-wider text-champagne">{d.toLocaleString("en", { month: "short", timeZone: "UTC" })}</span>
                      <span className="-mt-2 font-heading text-2xl font-extrabold">{d.getUTCDate()}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{e.title}</h2>{e.status !== "published" && <StatusBadge status={e.status} />}</div>
                      <p className="mt-1 text-sm text-muted">{formatDateTime(e.starts_at)}</p>
                      <p className="text-sm text-muted">{e.is_virtual ? "Online" : e.venue ?? "Venue to be confirmed"}</p>
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
