import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ButtonLink } from "@/components/ui/button";
import { getUser } from "@/lib/session";

const NAV = [
  { href: "/discover", label: "Discover Classes" },
  { href: "/class-of", label: "Class Of" },
  { href: "/about", label: "About ALUMS" },
  { href: "/#how", label: "How It Works" },
];

export async function SiteHeader() {
  const user = await getUser();
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-navy/95 text-white backdrop-blur supports-[backdrop-filter]:bg-navy/85">
      <div className="container flex h-16 items-center gap-6">
        <Logo />
        <nav aria-label="Primary" className="ml-6 hidden items-center gap-6 text-[15px] md:flex">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="text-white/85 transition hover:text-champagne">{n.label}</Link>)}
        </nav>
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          {user ? (
            <ButtonLink href="/app/dashboard" size="sm">Open my class</ButtonLink>
          ) : (
            <>
              <ButtonLink href="/sign-in" variant="onDark" size="sm">Sign in</ButtonLink>
              <ButtonLink href="/register" size="sm" className="bg-orange-strong text-white">Join ALUMS</ButtonLink>
            </>
          )}
        </div>
        <details className="relative ml-auto md:hidden sm:ml-0">
          <summary className="list-none rounded-lg border border-white/30 px-3 py-1.5 text-sm [&::-webkit-details-marker]:hidden">Menu</summary>
          <nav aria-label="Mobile" className="absolute right-0 top-11 grid w-60 gap-1 rounded-2xl border border-white/10 bg-navy p-3 shadow-lift">
            {NAV.map((n) => <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 hover:bg-white/10">{n.label}</Link>)}
            <hr className="my-1 border-white/10" />
            {user ? <Link href="/app/dashboard" className="rounded-lg px-3 py-2 font-semibold text-champagne">Open my class</Link> : (
              <>
                <Link href="/sign-in" className="rounded-lg px-3 py-2 hover:bg-white/10">Sign in</Link>
                <Link href="/register" className="rounded-lg px-3 py-2 font-semibold text-champagne">Join ALUMS</Link>
              </>
            )}
          </nav>
        </details>
      </div>
    </header>
  );
}
