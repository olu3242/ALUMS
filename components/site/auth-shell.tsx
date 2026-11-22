import { Logo } from "@/components/ui/logo";

export function AuthShell({ title, subtitle, children, aside }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="container grid min-h-[calc(100dvh-4rem)] items-center gap-12 py-14 lg:grid-cols-2">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        {subtitle && <p className="mt-2 text-muted">{subtitle}</p>}
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">{children}</div>
      </div>
      <aside className="hero-surface hidden rounded-3xl p-10 text-white lg:block">
        <Logo />
        <div className="gold-rule mt-10" />
        {aside ?? (
          <p className="mt-6 font-serif text-4xl leading-tight">Graduation was just the beginning.</p>
        )}
        <ul className="mt-10 grid gap-3 text-[#D6DEE9]">
          <li>✓ Verified class membership</li><li>✓ Privacy controls on every field</li><li>✓ Leaders limited to their own class</li>
        </ul>
      </aside>
    </section>
  );
}
