import { Card } from "@/components/ui/card";
import { requireFeature } from "@/lib/features";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireCommunity } from "@/lib/session";

export const metadata = { title: "Alumni locations" };
type Loc = { user_id: string; full_name: string | null; country: string; city: string | null };

export default async function Locations() {
  await requireFeature("locations");
  const community = await requireCommunity();
  const { data } = await (await createClient()).rpc("community_locations", { p_community_id: community.id });
  const rows = (data as Loc[] | null) ?? [];
  const byCountry = new Map<string, Loc[]>();
  rows.forEach((r) => byCountry.set(r.country, [...(byCountry.get(r.country) ?? []), r]));
  const countries = [...byCountry.entries()].sort((a, b) => b[1].length - a[1].length);
  const max = Math.max(1, ...countries.map(([, v]) => v.length));

  return (
    <>
      <PageHeader eyebrow={community.name} title="Alumni locations" description="Country and city only, and only for classmates who opted in. Precise addresses are never collected."
        actions={<ButtonLink href="/app/profile#location" variant="secondary">My location settings</ButtonLink>} />
      {rows.length === 0 ? (
        <EmptyState title="No classmates are sharing a location yet" action={<ButtonLink href="/app/profile">Share mine</ButtonLink>}>Location sharing is opt-in.</EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card>
            <h2 className="font-bold">By country</h2>
            <ul className="mt-4 grid gap-3">
              {countries.map(([c, list]) => (
                <li key={c}>
                  <a href={`#c-${encodeURIComponent(c)}`} className="block">
                    <div className="flex justify-between text-sm"><span className="font-semibold">{c}</span><span className="tabular-nums text-muted">{list.length}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent" style={{ width: `${(list.length / max) * 100}%` }} /></div>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
          <div className="grid gap-4">
            {countries.map(([c, list]) => (
              <Card key={c} id={`c-${encodeURIComponent(c)}`}>
                <h2 className="font-bold">{c}</h2>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {list.map((r) => (
                    <li key={r.user_id} className="text-sm"><Link href={`/app/alumni/${r.user_id}`} className="font-semibold hover:text-accent-text">{r.full_name ?? "Classmate"}</Link>
                      <span className="text-muted"> · {r.city ?? "City not shared"}</span></li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
