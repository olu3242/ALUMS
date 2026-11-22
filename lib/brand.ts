import { env } from "@/lib/env";

/** Institution branding helpers. Brand colours are only ever used where text contrast meets WCAG AA (≥4.5:1). */
export type Branding = {
  name: string; logo_path: string | null; logo_format: "mark" | "wordmark" | string | null;
  brand_primary: string | null; brand_accent: string | null;
};

const HEX = /^#[0-9a-f]{6}$/i;
const NAVY = "#10243A", WHITE = "#FFFFFF";

const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}
/** Best readable text colour on a background: white or navy, whichever contrasts more. */
export const readableOn = (bg: string) => (contrast(bg, WHITE) >= contrast(bg, NAVY) ? WHITE : NAVY);
/** True when some text colour reaches AA on this background. */
export const isUsableBackground = (bg: string) => HEX.test(bg) && contrast(bg, readableOn(bg)) >= 4.5;

/** CSS variables for a branded surface; falls back to ALUMS navy when unset or unreadable. */
export function brandVars(b?: Pick<Branding, "brand_primary" | "brand_accent"> | null): React.CSSProperties {
  const bg = b?.brand_primary && isUsableBackground(b.brand_primary) ? b.brand_primary : NAVY;
  const fg = readableOn(bg);
  // Accent is decorative (rules, rings); only used when it is distinguishable from the background (≥3:1, WCAG non-text).
  const accent = b?.brand_accent && HEX.test(b.brand_accent) && contrast(b.brand_accent, bg) >= 3 ? b.brand_accent : "#D8AD58";
  return { "--brand-bg": bg, "--brand-fg": fg, "--brand-accent": accent } as React.CSSProperties;
}

export const logoUrl = (path?: string | null) =>
  path && env.supabaseUrl ? `${env.supabaseUrl}/storage/v1/object/public/institution-assets/${path.split("/").map(encodeURIComponent).join("/")}` : null;
