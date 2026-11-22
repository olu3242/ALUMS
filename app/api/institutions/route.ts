import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isBackendConfigured } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";

// Public institution lookup (reference catalogue). Cached at the edge; no user data involved.
const params = z.object({ q: z.string().trim().min(2).max(80), country: z.string().trim().max(80).optional() });

export async function GET(request: NextRequest) {
  const parsed = params.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success || !isBackendConfigured()) return NextResponse.json([]);
  const { data, error } = await createPublicClient().rpc("search_institution_directory", {
    p_query: parsed.data.q, p_country: parsed.data.country || null, p_limit: 10,
  });
  if (error) return NextResponse.json({ error: "lookup unavailable" }, { status: 503 });
  return NextResponse.json(data ?? [], { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
}
