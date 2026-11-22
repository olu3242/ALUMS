import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isBackendConfigured } from "@/lib/env";

export type CommunityHit = {
  id: string; slug: string; name: string; department_name: string; graduation_year: number;
  institution_name: string | null; institution_verified: boolean | null; is_founding: boolean;
};

export async function searchCommunities(q: { institution?: string; department?: string; year?: number }, limit = 24) {
  if (!isBackendConfigured()) return { hits: [] as CommunityHit[], error: "not-configured" as const };
  const { data, error } = await (await createClient()).rpc("search_communities", {
    p_institution: q.institution || null, p_department: q.department || null, p_year: q.year ?? null, p_limit: limit,
  });
  return { hits: (data as CommunityHit[] | null) ?? [], error: error ? ("failed" as const) : null };
}
