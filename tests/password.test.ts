import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { breachedPasswordError, rangeContains, sha1Parts } from "@/lib/password";

describe("breached password check", () => {
  it("splits SHA-1 into a 5-char prefix (sent) and 35-char suffix (kept)", () => {
    const { prefix, suffix } = sha1Parts("password");
    expect(prefix).toBe("5BAA6"); expect(suffix).toHaveLength(35);
  });
  it("matches listed suffixes and ignores zero-count padding", () => {
    const { suffix } = sha1Parts("password");
    expect(rangeContains(`AAAA:1\r\n${suffix}:9545824\r\n`, suffix)).toBe(true);
    expect(rangeContains(`${suffix}:0\r\n`, suffix)).toBe(false);
  });
  it("flags a breached password and fails open on network errors", async () => {
    const { suffix } = sha1Parts("password");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(`${suffix}:10\n`)));
    expect(await breachedPasswordError("password")).toMatch(/breach/);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await breachedPasswordError("password")).toBeNull();
    vi.unstubAllGlobals();
  });
});
