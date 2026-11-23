import { describe, expect, it } from "vitest";
import { resolveSiteUrl } from "@/lib/env";

describe("resolveSiteUrl", () => {
  it("uses the explicit site URL", () => expect(resolveSiteUrl({ NEXT_PUBLIC_SITE_URL: "https://alums.example/" })).toBe("https://alums.example"));
  it("falls back to the Vercel production domain on previews", () =>
    expect(resolveSiteUrl({ VERCEL: "1", VERCEL_PROJECT_PRODUCTION_URL: "alums.example", VERCEL_URL: "alums-git-x.vercel.app" })).toBe("https://alums.example"));
  it("never hands out localhost on Vercel", () =>
    expect(resolveSiteUrl({ VERCEL: "1", NEXT_PUBLIC_SITE_URL: "http://localhost:3000", VERCEL_URL: "alums-abc.vercel.app" })).toBe("https://alums-abc.vercel.app"));
  it("uses localhost only for local development", () => expect(resolveSiteUrl({})).toBe("http://localhost:3000"));
});
