import { describe, expect, it } from "vitest";
import { assignRoleSchema, businessSchema, eventSchema, finderSchema, locationSchema, profileSchema, registerSchema } from "@/lib/validation";
import { safeNext } from "@/lib/utils";
import { friendlyError } from "@/lib/errors";

describe("validation", () => {
  it("class finder accepts empty or four-digit years only", () => {
    expect(finderSchema.parse({ department: " Accounting ", year: "2007" })).toMatchObject({ department: "Accounting", year: 2007 });
    expect(finderSchema.parse({ year: "" }).year).toBeUndefined();
    expect(finderSchema.safeParse({ year: "1800" }).success).toBe(false);
  });
  it("registration enforces password length and normalises email", () => {
    expect(registerSchema.safeParse({ full_name: "Ada", email: "a@b.co", password: "short" }).success).toBe(false);
    expect(registerSchema.parse({ full_name: "Ada", email: " A@B.CO ", password: "long-enough-pw" }).email).toBe("a@b.co");
  });
  it("location sharing requires consent and the right granularity", () => {
    expect(locationSchema.safeParse({ share_level: "city", country: "Ghana", city: "Accra" }).success).toBe(false);
    expect(locationSchema.safeParse({ share_level: "city", country: "Ghana", consent: "on" }).success).toBe(false);
    expect(locationSchema.parse({ share_level: "country", country: "Ghana", consent: "on" })).toMatchObject({ share_level: "country" });
    expect(locationSchema.parse({ share_level: "hidden" }).share_level).toBe("hidden");
  });
  it("profile visibility only accepts known levels; URLs must be https", () => {
    const base = { full_name: "Ada Lovelace", visibility: { phone: "private" } };
    expect(profileSchema.safeParse({ ...base, visibility: { phone: "public" } }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base, linkedin_url: "http://x.y" }).success).toBe(false);
    expect(profileSchema.parse({ ...base, contact_email: "" }).contact_email).toBeNull();
  });
  it("business services split and cap at 20", () => {
    const r = businessSchema.parse({ name: "Audit Co", services: Array.from({ length: 25 }, (_, i) => `S${i}`).join(",") });
    expect(r.services).toHaveLength(20);
  });
  it("events: end must be after start", () => {
    expect(eventSchema.safeParse({ title: "Reunion", starts_at: "2027-01-02T10:00", ends_at: "2027-01-01T10:00", status: "draft" }).success).toBe(false);
    expect(eventSchema.parse({ title: "Reunion", starts_at: "2027-01-02T10:00", status: "published" }).starts_at).toBe("2027-01-02T10:00:00.000Z");
  });
  it("role assignment requires explicit confirmation", () => {
    const base = { user_id: "8f9c5a7e-6a3b-4c1d-9e2f-0a1b2c3d4e5f", role_key: "class_secretary", scope_type: "community", scope_id: "8f9c5a7e-6a3b-4c1d-9e2f-0a1b2c3d4e5f" };
    expect(assignRoleSchema.safeParse(base).success).toBe(false);
    expect(assignRoleSchema.safeParse({ ...base, confirm: "on" }).success).toBe(true);
  });
});

describe("safety helpers", () => {
  it("safeNext blocks open redirects", () => {
    expect(safeNext("/app/alumni")).toBe("/app/alumni");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", undefined, 42]) expect(safeNext(bad)).toBe("/app/dashboard");
  });
  it("friendlyError never leaks raw RLS/permission internals", () => {
    expect(friendlyError({ code: "42501", message: "new row violates row-level security policy for table x" })).toBe("You don't have permission to do that.");
    expect(friendlyError({ code: "42501", message: "you cannot review your own request" })).toBe("You cannot review your own request");
    expect(friendlyError({ code: "XX000", message: "internal stack" })).toBe("Something went wrong. Please try again.");
    expect(friendlyError({ code: "42501", message: "x", hint: "mfa_required" })).toMatch(/multi-factor/);
  });
});

import { communityRequestSchema, institutionSchema } from "@/lib/validation";
describe("institution directory ids", () => {
  it("are optional positive integers", () => {
    const base = { institution_name: "University of Lagos", department_name: "Accounting", graduation_year: "2007" };
    expect(communityRequestSchema.parse({ ...base, institution_directory_id: "42" }).institution_directory_id).toBe(42);
    expect(communityRequestSchema.parse({ ...base, institution_directory_id: "" }).institution_directory_id).toBeUndefined();
    expect(communityRequestSchema.safeParse({ ...base, institution_directory_id: "-1" }).success).toBe(false);
    expect(institutionSchema.parse({ name: "University of Lagos", directory_id: "7" }).directory_id).toBe(7);
  });
});
