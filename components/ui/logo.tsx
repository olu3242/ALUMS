import Link from "next/link";
import { cn } from "@/lib/utils";

/** "Alumni Circle" mark: the class (ring) with one member rising (gold). */
export function LogoMark({ className, size = 32 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <circle cx="16" cy="17" r="9" fill="none" stroke="#EA580C" strokeWidth="3.4" />
      <circle cx="16" cy="7.5" r="3.2" fill="#D8AD58" />
    </svg>
  );
}

export function Logo({ href = "/", className, tone = "light" }: { href?: string; className?: string; tone?: "light" | "dark" }) {
  return (
    <Link href={href} aria-label="ALUMS home" className={cn("inline-flex items-center gap-2.5 font-heading text-xl font-extrabold tracking-[0.04em]",
      tone === "light" ? "text-white" : "text-ink", className)}>
      <LogoMark />
      ALUMS
    </Link>
  );
}
