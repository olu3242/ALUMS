import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveCommunity } from "@/lib/session";

/** Class modules a class (or the platform team) can switch off. Must match community_features.feature check. */
export const FEATURES = [
  { key: "alumni", label: "Alumni directory", href: "/app/alumni" },
  { key: "businesses", label: "Business directory", href: "/app/businesses" },
  { key: "locations", label: "Alumni locations", href: "/app/locations" },
  { key: "events", label: "Events & reunions", href: "/app/events" },
  { key: "gallery", label: "Gallery", href: "/app/gallery" },
  { key: "announcements", label: "Announcements", href: "/app/announcements" },
  { key: "dues", label: "Dues", href: "/app/dues" },
  { key: "network", label: "Alumni network", href: "/app/network" },
] as const;
export type FeatureKey = (typeof FEATURES)[number]["key"];
export type FeatureState = Record<FeatureKey, { enabled: boolean; locked: boolean }>;

/** Missing rows mean "on" (same default as private.feature_enabled). */
export const getFeatures = cache(async (communityId: string): Promise<FeatureState> => {
  const { data } = await (await createClient()).from("community_features").select("feature, enabled, locked").eq("community_id", communityId);
  const state = Object.fromEntries(FEATURES.map((f) => [f.key, { enabled: true, locked: false }])) as FeatureState;
  for (const r of data ?? []) if (r.feature in state) state[r.feature as FeatureKey] = { enabled: r.enabled, locked: r.locked };
  return state;
});

/** Page guard: a switched-off module sends members back to the dashboard with a notice. */
export async function requireFeature(key: FeatureKey) {
  const community = await getActiveCommunity();
  if (!community) return;
  if (!(await getFeatures(community.id))[key].enabled) redirect(`/app/dashboard?notice=feature-off`);
}
