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

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";

export type DirectoryCountry = { country: string; country_code: string | null; institutions: number };
export type DirectoryEntry = { id: number; name: string; country: string; country_code: string | null; state_province: string | null; website_url: string | null; kind: string };

/** Countries in the institution directory (reference data, cached for a day). */
export const getDirectoryCountries = unstable_cache(async (): Promise<DirectoryCountry[]> => {
  if (!isBackendConfigured()) return [];
  const { data } = await createPublicClient().rpc("institution_directory_countries");
  return (data as DirectoryCountry[] | null) ?? [];
}, ["directory-countries"], { revalidate: 86400 });
