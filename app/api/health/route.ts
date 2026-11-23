import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/public";
import { isBackendConfigured } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Uptime probe: app is serving and the database answers (anon, public data only). 200 = healthy, 503 = degraded. */
export async function GET() {
  const started = Date.now();
  let db: "ok" | "error" | "not_configured" = "not_configured";
  if (isBackendConfigured()) {
    const { error } = await createPublicClient().from("class_communities").select("id", { head: true, count: "exact" }).limit(1);
    db = error ? "error" : "ok";
  }
  const healthy = db === "ok";
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", db, latency_ms: Date.now() - started,
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local", time: new Date().toISOString() },
    { status: healthy ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
