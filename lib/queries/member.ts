import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getPermissions } from "@/lib/session";

export const communityPermissions = cache(async (communityId: string) => getPermissions("community", communityId));

export function profileCompleteness(p: Record<string, unknown> | null) {
  const fields = ["full_name", "headline", "about", "profession", "industry", "employer", "job_title"];
  const done = fields.filter((f) => typeof p?.[f] === "string" && (p[f] as string).trim().length > 0).length;
  return { done, total: fields.length, pct: Math.round((done / fields.length) * 100) };
}

export async function upcomingEvents(communityId: string, limit = 3) {
  const { data } = await (await createClient()).from("events").select("id, title, starts_at, venue, is_virtual, status")
    .eq("community_id", communityId).eq("status", "published").gte("starts_at", new Date().toISOString())
    .order("starts_at").limit(limit);
  return data ?? [];
}

export async function latestAnnouncements(communityId: string, limit = 3) {
  const { data } = await (await createClient()).from("announcements").select("id, title, body, is_pinned, published_at")
    .eq("community_id", communityId).order("is_pinned", { ascending: false }).order("published_at", { ascending: false }).limit(limit);
  return data ?? [];
}
