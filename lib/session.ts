import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isBackendConfigured } from "@/lib/env";
import type { AdminScope, Community, Membership, MembershipRequest, Profile } from "@/lib/types";

export const ACTIVE_COMMUNITY_COOKIE = "alums_cid";
export const ADMIN_SCOPE_COOKIE = "alums_scope";

const COMMUNITY_COLS = "id, slug, name, department_name, graduation_year, institution_id, status, is_founding, description, institutions(name, status)";

/** Verified user for this request (null when signed out or backend absent). */
export const getUser = cache(async () => {
  if (!isBackendConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

export const requireUser = cache(async () => {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  return user;
});

export const getViewer = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const [{ data: profile }, { data: memberships }, { data: requests }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<Profile>(),
    supabase.from("memberships").select(`id, community_id, status, verified_at, class_communities(${COMMUNITY_COLS})`)
      .eq("user_id", user.id).order("verified_at", { ascending: false }).returns<Membership[]>(),
    supabase.from("membership_requests").select("id, community_id, status, created_at, decision_note, class_communities(name, slug)")
      .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20).returns<MembershipRequest[]>(),
  ]);
  const active = (memberships ?? []).filter((m) => m.status === "active");
  return { user, profile: profile ?? null, memberships: memberships ?? [], activeMemberships: active, requests: requests ?? [], supabase };
});

/** Selected community, validated against live memberships (cookie is only a preference). */
export const getActiveCommunity = cache(async (): Promise<Community | null> => {
  const { activeMemberships } = await getViewer();
  const preferred = (await cookies()).get(ACTIVE_COMMUNITY_COOKIE)?.value;
  const match = activeMemberships.find((m) => m.community_id === preferred) ?? activeMemberships[0];
  return match?.class_communities ?? null;
});

/** For /app pages that need a community: redirect to My Classes when the user has none yet. */
export async function requireCommunity() {
  const community = await getActiveCommunity();
  if (!community) redirect("/app/my-classes");
  return community;
}

export const getPermissions = cache(async (scopeType: AdminScope["scope_type"], scopeId: string | null) => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_permissions", { p_scope_type: scopeType, p_scope_id: scopeId });
  return new Set<string>((data as string[] | null) ?? []);
});

export type AdminContext = {
  scopes: AdminScope[];
  communities: (Community & { active_members: number; institution_name: string | null })[];
  current: { scope_type: AdminScope["scope_type"]; scope_id: string | null; label: string };
  permissions: Set<string>;
  maxRank: number;
};

/** Admin control center context. Returns null when the user administers nothing. */
export const getAdminContext = cache(async (): Promise<AdminContext | null> => {
  await requireUser();
  const supabase = await createClient();
  const [{ data: scopes }, { data: communities }] = await Promise.all([
    supabase.rpc("my_admin_scopes"),
    supabase.rpc("admin_communities"),
  ]);
  const s = (scopes as AdminScope[] | null) ?? [];
  const c = (communities as AdminContext["communities"] | null) ?? [];
  if (s.length === 0) return null;

  const options = [
    ...s.filter((x) => x.scope_type !== "community").map((x) => ({ scope_type: x.scope_type, scope_id: x.scope_id, label: x.label })),
    ...c.map((x) => ({ scope_type: "community" as const, scope_id: x.id, label: x.name })),
  ];
  const raw = (await cookies()).get(ADMIN_SCOPE_COOKIE)?.value ?? "";
  const [t, id] = raw.split(":");
  const current = options.find((o) => o.scope_type === t && (o.scope_id ?? "") === (id ?? "")) ?? options[0]!;
  const permissions = await getPermissions(current.scope_type, current.scope_id);
  const maxRank = Math.max(0, ...s
    .filter((x) => x.scope_type === "platform" || (x.scope_type === current.scope_type && x.scope_id === current.scope_id)
      || (current.scope_type === "community" && x.scope_type === "institution"
          && c.find((cc) => cc.id === current.scope_id)?.institution_id === x.scope_id))
    .map((x) => x.max_rank));
  return { scopes: s, communities: c, current, permissions, maxRank };
});

export async function requireAdmin(permission?: string) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/app/dashboard?notice=no-admin");
  if (permission && !ctx.permissions.has(permission)) redirect("/admin/dashboard?notice=forbidden");
  return ctx;
}
