import Link from "next/link";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { BrandHero, InstitutionLogo } from "@/components/site/brand-hero";
import { getActiveCommunity, getViewer } from "@/lib/session";
import { latestAnnouncements, profileCompleteness, upcomingEvents } from "@/lib/queries/member";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const { profile, requests } = await getViewer();
  const community = await getActiveCommunity();
  const pending = requests.filter((r) => r.status === "pending");
  const completeness = profileCompleteness(profile);
  const firstName = profile?.full_name?.split(" ")[0];

  if (!community) {
    return (
      <>
        <PageHeader eyebrow="Welcome" title={`Welcome${firstName ? `, ${firstName}` : ""}`} description="You're not a verified member of a class yet." />
        {pending.length > 0 ? (
          <Notice>Your request to join <strong>{pending[0]!.class_communities?.name}</strong> is under review. We'll notify you when it's decided.</Notice>
        ) : (
          <EmptyState title="Find your class to get started" action={<ButtonLink href="/discover">Find my class</ButtonLink>}>
            Search by institution, department and graduation year, then apply for membership.
          </EmptyState>
        )}
      </>
    );
  }

  const [events, announcements] = await Promise.all([upcomingEvents(community.id), latestAnnouncements(community.id)]);
  return (
    <>
      {notice === "no-admin" && <div className="mb-6"><Notice tone="warning">You don't have an admin role in any scope.</Notice></div>}
      <BrandHero branding={community.institutions?.status === "verified" ? { ...community.institutions } : null} className="mb-8 rounded-3xl p-7 sm:p-10">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          {community.institutions?.status === "verified" && (
            <InstitutionLogo b={{ name: community.institutions.name, logo_path: community.institutions.logo_path ?? null, logo_format: community.institutions.logo_format ?? "mark" }} />
          )}
          <div>
            <p className="text-sm font-semibold opacity-80">Welcome back{firstName ? `, ${firstName}` : ""}</p>
            <h1 className="mt-2 font-serif text-3xl sm:text-5xl">{community.name}</h1>
            <p className="mt-2 opacity-90">{community.department_name} · Class of {community.graduation_year} · {community.institutions?.status === "verified" ? community.institutions.name : "Institution pending confirmation"}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <ButtonLink href="/app/alumni" size="sm" className="bg-orange-strong text-white">Browse classmates</ButtonLink>
          <ButtonLink href="/app/dues" size="sm" className="border border-current/40 bg-transparent text-current hover:bg-white/10">Dues</ButtonLink>
        </div>
      </BrandHero>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardTitle as="h2">Your profile</CardTitle>
          <p className="mt-1 text-sm text-muted">{completeness.done} of {completeness.total} sections complete</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={completeness.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
            <div className="h-full rounded-full bg-accent" style={{ width: `${completeness.pct}%` }} />
          </div>
          <ButtonLink href="/app/profile" variant="secondary" size="sm" className="mt-5">{completeness.pct === 100 ? "Review profile" : "Complete profile"}</ButtonLink>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between"><CardTitle as="h2">Upcoming events</CardTitle><Link href="/app/events" className="text-sm font-semibold text-accent-text hover:underline">All events</Link></div>
          {events.length === 0 ? <p className="mt-4 text-sm text-muted">No upcoming events yet.</p> : (
            <ul className="mt-4 divide-y divide-line">
              {events.map((e) => (
                <li key={e.id}><Link href={`/app/events/${e.id}`} className="flex items-center gap-4 py-3 hover:text-accent-text">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-champagne text-navy"><Icon name="calendar" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{e.title}</span><span className="text-sm text-muted">{formatDateTime(e.starts_at)} · {e.is_virtual ? "Online" : e.venue ?? "Venue TBC"}</span></span>
                </Link></li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-3">
          <div className="flex items-center justify-between"><CardTitle as="h2">Announcements</CardTitle><Link href="/app/announcements" className="text-sm font-semibold text-accent-text hover:underline">All announcements</Link></div>
          {announcements.length === 0 ? <p className="mt-4 text-sm text-muted">No announcements from your class leaders yet.</p> : (
            <ul className="mt-4 grid gap-4 md:grid-cols-3">
              {announcements.map((a) => (
                <li key={a.id} className="rounded-xl border border-line p-4">
                  {a.is_pinned && <span className="text-xs font-bold uppercase tracking-wider text-accent-text">Pinned</span>}
                  <h3 className="mt-1 font-bold">{a.title}</h3>
                  <p className="mt-1 line-clamp-3 text-sm text-muted">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
