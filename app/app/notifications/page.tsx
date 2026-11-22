import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/session";
import { markNotificationsRead } from "@/lib/actions/profile";
import { cn, formatDateTime, safeNext } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function Notifications() {
  await requireUser();
  const { data } = await (await createClient()).from("notifications").select("id, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false }).limit(100);
  const items = data ?? [];
  return (
    <>
      <PageHeader title="Notifications" actions={items.some((n) => !n.read_at) ? <form action={markNotificationsRead}><Button size="sm" variant="secondary">Mark all read</Button></form> : undefined} />
      {items.length === 0 ? <EmptyState title="You're all caught up" /> : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {items.map((n) => (
            <li key={n.id} className={cn("flex items-start gap-4 p-4", !n.read_at && "bg-champagne/20")}>
              <span aria-hidden className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} />
              <div className="min-w-0 flex-1">
                {n.link ? <Link href={safeNext(n.link)} className="font-semibold hover:text-accent-text">{n.title}</Link> : <p className="font-semibold">{n.title}</p>}
                {n.body && <p className="text-sm text-muted">{n.body}</p>}
                <p className="mt-1 text-xs text-muted">{formatDateTime(n.created_at)}</p>
              </div>
              {!n.read_at && <form action={markNotificationsRead}><input type="hidden" name="id" value={n.id} /><Button size="sm" variant="ghost">Mark read</Button></form>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
