import { brandVars, logoUrl, type Branding } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Logo in the institution's chosen format: a square mark or a wide wordmark. Never shown without its name. */
export function InstitutionLogo({ b, className }: { b: Pick<Branding, "name" | "logo_path" | "logo_format">; className?: string }) {
  const src = logoUrl(b.logo_path);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${b.name} logo`} loading="lazy"
      className={cn("shrink-0 rounded-xl bg-white object-contain p-1.5 shadow-sm",
        b.logo_format === "wordmark" ? "h-14 w-auto max-w-[220px]" : "h-16 w-16", className)} />
  );
}

/** Hero surface in the institution's colours (contrast-checked; falls back to ALUMS navy). */
export function BrandHero({ branding, children, className }: { branding?: Partial<Branding> | null; children: React.ReactNode; className?: string }) {
  return (
    <section style={brandVars(branding as Branding | null)}
      className={cn("relative overflow-hidden bg-[var(--brand-bg)] text-[var(--brand-fg)]", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_360px_at_90%_-20%,rgb(255_255_255/0.10),transparent_60%)]" />
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1 bg-[var(--brand-accent)]" />
      <div className="relative">{children}</div>
    </section>
  );
}
