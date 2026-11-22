import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function SiteFooter() {
  return (
    <footer className="bg-navy text-[#D6DEE9]">
      <div className="container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm">Your Class. Your People. Your Network.</p>
          <ThemeToggle className="mt-5 inline-block text-white" />
        </div>
        <FooterCol title="Explore" links={[["/discover", "Discover Classes"], ["/class-of", "Browse by year"], ["/about", "About ALUMS"]]} />
        <FooterCol title="Communities" links={[["/community/accounting-class-of-2007", "Accounting — Class of 2007"], ["/discover#request", "Request a class"]]} />
        <FooterCol title="Account" links={[["/sign-in", "Sign in"], ["/register", "Create account"]]} />
      </div>
      <div className="border-t border-white/10">
        <p className="container py-5 text-xs text-white/60">© {new Date().getUTCFullYear()} ALUMS. Privacy policy and terms are being finalised before public launch.</p>
      </div>
    </footer>
  );
}
function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-bold text-white">{title}</h2>
      <ul className="grid gap-2 text-sm">{links.map(([h, l]) => <li key={h}><Link href={h} className="hover:text-champagne">{l}</Link></li>)}</ul>
    </div>
  );
}
