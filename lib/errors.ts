export type ActionState = { ok?: boolean; message?: string; error?: string; fieldErrors?: Record<string, string[]> } | null;

/** Shown when a privileged RPC needs an AAL2 session; FormMessage turns it into a "Verify now" link. */
export const MFA_REQUIRED_MESSAGE = "This action needs a code from your authenticator app. Verify this session under Admin → Security (no need to sign out), then try again.";

type PgError = { code?: string; message?: string; hint?: string | null } | null | undefined;

/** Map database errors to safe, human messages. RPCs raise deliberate, user-safe messages for 42501/P0001/P0002. */
export function friendlyError(err: PgError): string {
  if (!err) return "Something went wrong. Please try again.";
  if (err.hint === "mfa_required") return MFA_REQUIRED_MESSAGE;
  if (err.hint === "email_unverified") return "Please verify your email address first.";
  switch (err.code) {
    case "42501": return err.message && !/permission denied|row-level security/i.test(err.message) ? capitalize(err.message) : "You don't have permission to do that.";
    case "P0001": case "P0002": case "22023": return capitalize(err.message ?? "Request could not be completed.");
    case "28000": return "Please sign in to continue.";
    case "23505": return "That already exists.";
    case "23514": return "Some values are not valid. Please review the form.";
    default: return "Something went wrong. Please try again.";
  }
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
