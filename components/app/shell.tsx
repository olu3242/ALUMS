import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { Icon, type IconName } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { NavLink } from "@/components/app/nav-link";
import { signOut } from "@/lib/actions/auth";
import { cn, initials } from "@/lib/utils";

export type NavItem = { href: string; label: string; icon: IconName; badge?: number };

export function Shell({ nav, top, children, title, user }: {
  nav: NavItem[]; top?: React.ReactNode; children: React.ReactNode; title: string; user: { name: string; email?: string };
}) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="hero-surface hidden flex-col text-white lg:sticky lg:top-0 lg:flex lg:h-dvh">
        <div className="px-6 pt-6"><Logo href="/" /></div>
        <div className="px-4 pt-6">{top}</div>
        <nav aria-label={title} className="mt-4 grid gap-0.5 overflow-y-auto px-3 pb-4">
          {nav.map((n) => <NavLink key={n.href} {...n} />)}
        </nav>
        <div className="mt-auto border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full bg-champagne font-heading text-xs font-extrabold text-navy">{initials(user.name)}</span>
            <div className="min-w-0 text-sm"><p className="truncate font-semibold">{user.name || "Your account"}</p><p className="truncate text-white/60">{user.email}</p></div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <ThemeToggle className="text-white" />
            <form action={signOut}><button className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-white/80 hover:bg-white/10"><Icon name="logout" className="h-4 w-4" />Sign out</button></form>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-navy text-white lg:hidden">
        <div className="flex h-14 items-center gap-3 px-4">
          <Logo href="/" />
          <details className="relative ml-auto">
            <summary className="list-none rounded-lg border border-white/30 px-3 py-1.5 text-sm [&::-webkit-details-marker]:hidden">Menu</summary>
            <div className="absolute right-0 top-11 z-40 w-[min(88vw,320px)] rounded-2xl border border-white/10 bg-navy p-3 shadow-lift">
              {top}
              <nav aria-label={`${title} (mobile)`} className="mt-2 grid gap-0.5">{nav.map((n) => <NavLink key={n.href} {...n} />)}</nav>
              <form action={signOut} className="mt-2 border-t border-white/10 pt-2"><button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-white/10">Sign out</button></form>
            </div>
          </details>
        </div>
      </header>

      <main id="main" className="min-w-0 px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}

export function CommunitySwitcher({ communities, activeId, action, label = "Class community" }: {
  communities: { id: string; name: string }[]; activeId?: string | null; action: (f: FormData) => Promise<void>; label?: string;
}) {
  if (communities.length === 0) return (
    <Link href="/app/my-classes" className="block rounded-xl border border-dashed border-gold/60 px-3 py-3 text-sm text-champagne">Find and join your class →</Link>
  );
  return (
    <form action={action} className="rounded-xl border border-white/15 bg-white/5 p-3">
      <label htmlFor="switch" className="text-[11px] font-bold uppercase tracking-[0.14em] text-champagne">{label}</label>
      <div className="mt-1.5 flex gap-2">
        <select id="switch" name="community_id" defaultValue={activeId ?? undefined}
          className="h-9 min-w-0 flex-1 rounded-lg border border-white/20 bg-navy px-2 text-sm text-white">
          {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className={cn("h-9 rounded-lg bg-orange-strong px-3 text-sm font-semibold text-white")}>Go</button>
      </div>
    </form>
  );
}
