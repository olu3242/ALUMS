import { describe, expect, it } from "vitest";
import { assignableRoles, conflictsWith, roleByKey } from "@/lib/rbac/catalog";

describe("RBAC previews (mirror of DB rules)", () => {
  it("class admins can grant only lower-ranked community roles", () => {
    expect(assignableRoles("community", 50).map((r) => r.key)).toEqual(["class_secretary", "class_treasurer", "community_moderator"]);
  });
  it("no one can grant super admin or the implicit verified member role", () => {
    expect(assignableRoles("platform", 100).map((r) => r.key)).toEqual(["platform_admin"]);
    expect(assignableRoles("community", 100).some((r) => r.key === "verified_member")).toBe(false);
  });
  it("financial roles require independent approval", () => {
    expect(roleByKey("class_treasurer")).toMatchObject({ financial: true, requiresApproval: true });
  });
  it("detects separation-of-duty conflicts in both directions", () => {
    expect(conflictsWith("class_treasurer", ["class_admin"])).toEqual(["class_admin"]);
    expect(conflictsWith("class_admin", ["class_treasurer", "community_moderator"])).toEqual(["class_treasurer"]);
    expect(conflictsWith("class_secretary", ["class_admin"])).toEqual([]);
  });
});
