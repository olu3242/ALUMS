import { notFound } from "next/navigation";
import { ReportButton } from "@/components/app/report-button";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Avatar, Notice } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/session";
import { removeConnection, requestConnection, respondConnection } from "@/lib/actions/profile";

export const metadata = { title: "Classmate" };

type P = Record<string, string | null> & {
  id: string; is_self: boolean; open_to_mentoring: boolean;
  connection: { id: string; status: string; outgoing: boolean } | null;
  shared_communities: { id: string; name: string; slug: string }[]; businesses: { id: string; name: string }[];
};

export default async function Member({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  await requireUser();
  const { data, error } = await (await createClient()).rpc("get_member_profile", { p_user_id: id });
  if (error || !data) notFound();
  const p = data as P;
  const work = [p.job_title, p.employer].filter(Boolean).join(" at ");
  const conn = p.connection;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="p-0">
        <div className="hero-surface h-28 rounded-t-2xl" />
        <div className="-mt-10 px-6 pb-6 sm:px-8">
          <Avatar name={p.full_name} className="h-20 w-20 text-xl ring-4" />
          <h1 className="mt-4 text-2xl font-extrabold">{p.full_name ?? "Classmate (name hidden)"}</h1>
          {p.headline && <p className="mt-1 text-muted">{p.headline}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {(p.city || p.country) && <Badge>{[p.city, p.country].filter(Boolean).join(", ")}</Badge>}
            {p.open_to_mentoring && <Badge tone="success">Open to mentoring</Badge>}
            {p.is_self && <Badge tone="accent">This is how classmates see you</Badge>}
          </div>
          {p.about && <p className="mt-6 whitespace-pre-line">{p.about}</p>}
          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            {([["Profession", p.profession], ["Industry", p.industry], ["Work", work || null], ["Name at graduation", p.name_at_graduation],
               ["Email", p.contact_email], ["Phone", p.phone]] as const).filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><dt className="text-sm text-muted">{k}</dt><dd className="font-semibold break-words">{v}</dd></div>
            ))}
          </dl>
          <div className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
            {p.linkedin_url && <a className="text-accent-text hover:underline" href={p.linkedin_url} rel="noopener noreferrer nofollow" target="_blank">LinkedIn ↗</a>}
            {p.website_url && <a className="text-accent-text hover:underline" href={p.website_url} rel="noopener noreferrer nofollow" target="_blank">Website ↗</a>}
            {!p.is_self && <span className="ml-auto font-normal"><ReportButton type="profile" id={p.id} /></span>}
          </div>
        </div>
      </Card>
      <div className="grid content-start gap-6">
        {!p.is_self && (
          <Card>
            <h2 className="font-bold">Connection</h2>
            <p className="mt-1 text-sm text-muted">Connections can see fields set to “Approved connections”.</p>
            <div className="mt-4">
              {!conn ? (
                <form action={requestConnection}><input type="hidden" name="user_id" value={p.id} /><Button size="sm">Request connection</Button></form>
              ) : conn.status === "accepted" ? (
                <form action={removeConnection} className="flex items-center gap-3"><Badge tone="success">Connected</Badge><input type="hidden" name="id" value={conn.id} /><Button size="sm" variant="ghost">Remove</Button></form>
              ) : conn.status === "pending" && conn.outgoing ? (
                <form action={removeConnection} className="flex items-center gap-3"><Badge tone="warning">Request sent</Badge><input type="hidden" name="id" value={conn.id} /><Button size="sm" variant="ghost">Cancel</Button></form>
              ) : conn.status === "pending" ? (
                <div className="flex gap-2">
                  <form action={respondConnection}><input type="hidden" name="id" value={conn.id} /><input type="hidden" name="status" value="accepted" /><Button size="sm">Accept</Button></form>
                  <form action={respondConnection}><input type="hidden" name="id" value={conn.id} /><input type="hidden" name="status" value="declined" /><Button size="sm" variant="secondary">Decline</Button></form>
                </div>
              ) : <Notice>Connection declined.</Notice>}
            </div>
          </Card>
        )}
        <Card>
          <h2 className="font-bold">Shared classes</h2>
          <ul className="mt-3 grid gap-1 text-sm">{p.shared_communities.length ? p.shared_communities.map((c) => <li key={c.id}>{c.name}</li>) : <li className="text-muted">None</li>}</ul>
        </Card>
        {p.businesses.length > 0 && (
          <Card>
            <h2 className="font-bold">Businesses</h2>
            <ul className="mt-3 grid gap-1 text-sm">{p.businesses.map((b) => <li key={b.id}><Link className="text-accent-text hover:underline" href={`/app/businesses?q=${encodeURIComponent(b.name)}`}>{b.name}</Link></li>)}</ul>
          </Card>
        )}
      </div>
    </div>
  );
}
