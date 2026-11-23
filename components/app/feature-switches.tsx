import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { setCommunityFeature } from "@/lib/actions/admin";
import { FEATURES, type FeatureKey } from "@/lib/features";
import { formatDateTime } from "@/lib/utils";

export type FeatureRow = { feature: FeatureKey; items: number; detail: string | null; last_activity: string | null;
  enabled: boolean; locked: boolean; switched_at: string | null; switched_by: string | null };

/** Where each module's records are managed. */
const MANAGE: Record<FeatureKey, { href: string; label: string }> = {
  alumni: { href: "/admin/members", label: "Members" },
  businesses: { href: "/admin/content#businesses", label: "Listings" },
  locations: { href: "/app/locations", label: "View map list" },
  events: { href: "/admin/content#events", label: "Events" },
  gallery: { href: "/admin/content#gallery", label: "Photos" },
  announcements: { href: "/admin/content#announcements", label: "Announcements" },
  dues: { href: "/admin/dues", label: "Dues" },
  network: { href: "/app/network", label: "Network" },
};
const UNIT: Record<FeatureKey, [string, string]> = { alumni: ["member", "members"], businesses: ["listing", "listings"], locations: ["shared", "shared"],
  events: ["event", "events"], gallery: ["photo", "photos"], announcements: ["post", "posts"], dues: ["active plan", "active plans"], network: ["post", "posts"] };

/** List view of class modules: state, real record counts, last activity, last switch, and actions. */
export function FeatureSwitches({ communityId, rows, isPlatform }: { communityId: string; rows: FeatureRow[]; isPlatform: boolean }) {
  const byKey = new Map(rows.map((r) => [r.feature, r]));
  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[760px] text-left text-sm">
        <caption className="sr-only">Class features</caption>
        <thead className="border-b border-line bg-surface-2 text-xs uppercase tracking-wider text-muted">
          <tr><th className="p-3">Feature</th><th className="p-3">Status</th><th className="p-3">Records</th><th className="p-3">Last activity</th>
            <th className="p-3">Last changed</th><th className="p-3 text-right">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {FEATURES.map((f) => {
            const r = byKey.get(f.key) ?? { items: 0, detail: null, last_activity: null, enabled: true, locked: false, switched_at: null, switched_by: null };
            const frozen = r.locked && !isPlatform;
            return (
              <tr key={f.key} className="align-top">
                <th scope="row" className="p-3 font-semibold">{f.label}</th>
                <td className="p-3"><div className="flex flex-wrap gap-1">{r.enabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
                  {r.locked && <Badge tone="warning">Locked</Badge>}</div></td>
                <td className="p-3"><span className="font-semibold">{r.items}</span> {UNIT[f.key][Number(r.items) === 1 ? 0 : 1]}{r.detail && <span className="block text-xs text-muted">{r.detail}</span>}</td>
                <td className="p-3 text-muted">{r.last_activity ? formatDateTime(r.last_activity) : "No activity yet"}</td>
                <td className="p-3 text-muted">{r.switched_at ? <>{formatDateTime(r.switched_at)}<span className="block text-xs">by {r.switched_by ?? "an admin"}</span></> : "Default (on)"}</td>
                <td className="p-3">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Link href={MANAGE[f.key].href} className="inline-flex h-9 items-center rounded-full border border-line px-3.5 text-sm font-semibold hover:bg-surface-2"
                      aria-label={`Manage ${f.label}`}>Manage →</Link>
                    {!frozen && (
                      <ActionForm action={setCommunityFeature}>
                        <input type="hidden" name="community_id" value={communityId} />
                        <input type="hidden" name="feature" value={f.key} />
                        <input type="hidden" name="enabled" value={String(!r.enabled)} />
                        <SubmitButton size="sm" variant={r.enabled ? "secondary" : "primary"} aria-label={`${r.enabled ? "Turn off" : "Turn on"} ${f.label}`}>
                          {r.enabled ? "Turn off" : "Turn on"}</SubmitButton>
                      </ActionForm>
                    )}
                    {isPlatform && (
                      <ActionForm action={setCommunityFeature}>
                        <input type="hidden" name="community_id" value={communityId} />
                        <input type="hidden" name="feature" value={f.key} />
                        <input type="hidden" name="enabled" value={String(r.enabled)} />
                        <input type="hidden" name="locked" value={String(!r.locked)} />
                        <SubmitButton size="sm" variant="ghost" aria-label={`${r.locked ? "Unlock" : "Lock"} ${f.label}`}>{r.locked ? "Unlock" : "Lock"}</SubmitButton>
                      </ActionForm>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
