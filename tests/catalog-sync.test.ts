import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PERMISSIONS, ROLES, ROLE_CONFLICTS } from "@/lib/rbac/catalog";

const dir = join(__dirname, "../supabase/migrations");
const sql = readFileSync(join(dir, "20261122000250_rbac_catalog.sql"), "utf8");
// Later catalog migrations add permissions and per-row grants.
const later = readdirSync(dir).filter((f) => /_rbac_catalog_v\d+\.sql$/.test(f)).map((f) => readFileSync(join(dir, f), "utf8")).join("\n");
const laterGrants = (role: string) => [...later.matchAll(new RegExp(`\\('${role}', '([a-z_.]+)'\\)`, "g"))].map((m) => m[1]!);

describe("RBAC catalog mirror matches the SQL source of truth", () => {
  it("permissions", () => {
    const keys = [...(sql + "\n" + later).matchAll(/^\s*\('([a-z_]+\.[a-z_.]+)',\s*'[A-Z]/gm)].map((m) => m[1]);
    expect(new Set(keys)).toEqual(new Set(Object.keys(PERMISSIONS)));
  });
  it("roles with rank, scope and flags", () => {
    const rows = [...sql.matchAll(/^\s*\('([a-z_]+)',\s*'[^']+',\s*'[^']+',\s*'(platform|institution|community)',\s*(\d+),\s*(true|false),\s*(true|false),\s*(true|false)\)/gm)];
    const parsed = rows.map((m) => ({ key: m[1], scope: m[2], rank: Number(m[3]), requiresApproval: m[4] === "true", financial: m[5] === "true", assignable: m[6] === "true" }));
    expect(parsed).toEqual(ROLES.map(({ key, scope, rank, requiresApproval, financial, assignable }) => ({ key, scope, rank, requiresApproval, financial, assignable })));
  });
  it("role → permission grants", () => {
    const block = (role: string) => sql.match(new RegExp(`select '${role}', unnest\\(array\\[([^\\]]+)\\]\\)`))?.[1]?.match(/'([^']+)'/g)?.map((s) => s.slice(1, -1)) ?? [];
    for (const r of ROLES.filter((x) => !["super_admin", "platform_admin", "verified_member"].includes(x.key))) {
      expect(new Set([...block(r.key), ...laterGrants(r.key)]), r.key).toEqual(new Set(r.permissions));
    }
    expect(ROLES.find((r) => r.key === "super_admin")!.permissions.length).toBe(Object.keys(PERMISSIONS).length);
    expect(ROLES.find((r) => r.key === "platform_admin")!.permissions).not.toContain("platform.settings");
    // super/platform admins hold every later permission too (granted row-by-row in v2+ catalogs)
    for (const p of [...later.matchAll(/^\s*\('([a-z_]+\.[a-z_.]+)',\s*'[A-Z]/gm)].map((m) => m[1]!)) {
      expect(laterGrants("super_admin"), p).toContain(p);
      expect(laterGrants("platform_admin"), p).toContain(p);
    }
  });
  it("separation-of-duty conflicts", () => {
    const pairs = [...sql.matchAll(/\('(class_[a-z]+)', '(class_[a-z]+)', 'Financial/g)].map((m) => [m[1], m[2]]);
    expect(pairs).toEqual(ROLE_CONFLICTS);
  });
});
