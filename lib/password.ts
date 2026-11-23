import "server-only";
import { createHash } from "node:crypto";

const BREACHED = "This password has appeared in a known data breach. Please choose a different one.";

/** k-anonymity breach check against Have I Been Pwned: only the first 5 hex chars of the SHA-1 leave the server. */
export function sha1Parts(password: string) {
  const h = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { prefix: h.slice(0, 5), suffix: h.slice(5) };
}

/** True when the range response lists the suffix with a non-zero count (padding entries have count 0). */
export function rangeContains(body: string, suffix: string) {
  return body.split(/\r?\n/).some((line) => { const [s, n] = line.trim().split(":"); return s === suffix && Number(n) > 0; });
}

/**
 * Returns an error message if the password is known-breached, otherwise null.
 * Fails open (null) on network errors or timeouts so sign-up never hard-depends on a third party.
 */
export async function breachedPasswordError(password: string, timeoutMs = 2500): Promise<string | null> {
  const { prefix, suffix } = sha1Parts(password);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "ALUMS-password-check" },
      signal: AbortSignal.timeout(timeoutMs), cache: "no-store",
    });
    if (!res.ok) return null;
    return rangeContains(await res.text(), suffix) ? BREACHED : null;
  } catch {
    return null;
  }
}
