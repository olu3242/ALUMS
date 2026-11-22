import { describe, expect, it } from "vitest";
import { brandVars, contrast, isUsableBackground, readableOn } from "@/lib/brand";
import { formatMoney, toMinor } from "@/lib/money";

describe("brand colours stay accessible", () => {
  it("computes WCAG contrast", () => {
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 0);
    expect(contrast("#10243A", "#FFFFFF")).toBeGreaterThan(14);
  });
  it("picks the readable text colour", () => {
    expect(readableOn("#0B3D91")).toBe("#FFFFFF");
    expect(readableOn("#F5B700")).toBe("#10243A");
  });
  it("falls back to navy for unreadable or invalid primaries", () => {
    expect(isUsableBackground("#808080")).toBe(false); // mid-grey: white 3.95:1, navy 3.99:1 — neither passes AA
    expect(brandVars({ brand_primary: "#808080", brand_accent: null })).toMatchObject({ "--brand-bg": "#10243A" });
    expect(isUsableBackground("#0B3D91")).toBe(true);
    expect(brandVars({ brand_primary: "red", brand_accent: null })).toMatchObject({ "--brand-bg": "#10243A" });
    expect(brandVars(null)).toMatchObject({ "--brand-bg": "#10243A", "--brand-fg": "#FFFFFF" });
  });
  it("ignores an accent too close to the background", () => {
    expect(brandVars({ brand_primary: "#0B3D91", brand_accent: "#0C3F95" })["--brand-accent" as never]).toBe("#D8AD58");
    expect(brandVars({ brand_primary: "#0B3D91", brand_accent: "#F5B700" })["--brand-accent" as never]).toBe("#F5B700");
  });
});

describe("money", () => {
  it("parses major units into minor units", () => {
    expect(toMinor("25,000")).toBe(2500000);
    expect(toMinor("25000.5")).toBe(2500050);
    expect(toMinor("0")).toBeNull();
    expect(toMinor("-5")).toBeNull();
    expect(toMinor("1.234")).toBeNull();
    expect(toMinor("abc")).toBeNull();
  });
  it("formats per currency", () => {
    expect(formatMoney(2500000, "NGN")).toMatch(/25,000\.00/);
    expect(formatMoney(1999, "USD")).toBe("$19.99");
  });
});
