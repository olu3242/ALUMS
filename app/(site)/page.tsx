import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon, type IconName } from "@/components/ui/icons";
import { ClassFinder } from "@/components/site/class-finder";

const STEPS = [
  ["Find your graduating class", "Search by institution, department and year."],
  ["Verify your membership", "Class leaders review every request before access is granted."],
  ["Reconnect with classmates", "Browse the directory and share only what you choose."],
  ["Build lasting opportunities", "Hire, partner, mentor and meet."],
] as const;

const FEATURES: [IconName, string, string, string?][] = [
  ["users", "Alumni Directory", "Search classmates by name, profession, industry and city."],
  ["user", "Personal Profiles", "Share your story and career, with privacy set per field."],
  ["briefcase", "Business Directory", "Discover businesses owned by classmates — reviewed before listing."],
  ["pin", "Alumni Locations", "Find classmates by country and city, only when they opt in."],
  ["calendar", "Events & Reunions", "Plan gatherings, collect RSVPs and track attendance."],
  ["image", "Class Memories", "Keep photographs and milestones in shared albums."],
  ["megaphone", "Announcements", "Hear from your class leaders in one feed."],
  ["heart", "Welfare & Support", "Organise support for classmates with clear approvals.", "Coming later"],
];

export default function Home() {
  return (
    <>
      <section className="hero-surface relative overflow-hidden pb-32 pt-16 text-white sm:pt-24">
        <div className="container relative">
          <div className="gold-rule mb-7" />
          <h1 className="max-w-[13ch] animate-rise font-serif text-[clamp(2.6rem,7.5vw,5.25rem)] font-normal leading-[1.02] tracking-normal">
            Your class. Your people. Your network.
          </h1>
          <p className="mt-6 max-w-[54ch] animate-rise text-lg text-[#D6DEE9] [animation-delay:80ms]">
            Graduation was just the beginning. Find your classmates, reconnect with familiar faces and build lasting relationships — inside a
            verified, private community that belongs to your class.
          </p>
          <div className="mt-8 flex animate-rise flex-wrap gap-3 [animation-delay:160ms]">
            <ButtonLink href="#find" size="lg" className="bg-orange-strong text-white">Find my class</ButtonLink>
            <ButtonLink href="/about" size="lg" variant="onDark">Explore ALUMS</ButtonLink>
          </div>
        </div>
      </section>

      <div id="find" className="container relative z-10 -mt-20 scroll-mt-24">
        <ClassFinder />
      </div>

      <section id="how" className="container scroll-mt-20 py-20 sm:py-24">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-2 max-w-[22ch] text-3xl font-extrabold sm:text-4xl">From “Class of” to community in four steps</h2>
        <ol className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([t, d], i) => (
            <li key={t} className="border-t-[3px] border-accent pt-5">
              <span className="font-heading text-3xl font-extrabold text-accent-text">{i + 1}</span>
              <h3 className="mt-2 text-lg font-bold">{t}</h3>
              <p className="mt-1 text-muted">{d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="features" className="bg-champagne/70 py-20 text-navy dark:bg-surface-2 dark:text-ink sm:py-24">
        <div className="container">
          <p className="eyebrow text-navy dark:text-accent-text">One home for your class</p>
          <h2 className="mt-2 text-3xl font-extrabold sm:text-4xl">Everything your class needs</h2>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(([icon, t, d, tag]) => (
              <article key={t} className="group rounded-2xl border border-line bg-surface p-6 text-ink shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
                <div className="mb-4 flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-navy text-champagne"><Icon name={icon} /></span>
                  {tag && <Badge>{tag}</Badge>}
                </div>
                <h3 className="text-lg font-bold">{t}</h3>
                <p className="mt-1.5 text-[15px] text-muted">{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="community" className="container grid items-center gap-10 py-20 sm:py-24 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <Badge tone="accent">Founding community</Badge>
          <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">Accounting — Class of 2007</h2>
          <p className="mt-4 max-w-[56ch] text-muted">
            The first community on ALUMS, where the platform is being shaped with real classmates. The institution will be shown once it is
            verified.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/community/accounting-class-of-2007">View community</ButtonLink>
            <ButtonLink href="/register?next=/community/accounting-class-of-2007" variant="secondary">Apply for membership</ButtonLink>
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <h3 className="font-heading text-lg font-bold">Class identity</h3>
          <dl className="mt-4 grid gap-4">
          {[["Department", "Accounting"], ["Graduation year", "2007"], ["Institution", "Pending confirmation"]].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-t border-line pt-4 text-[15px]"><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>
          ))}
          </dl>
        </div>
      </section>

      <section className="hero-surface py-20 text-white sm:py-24">
        <div className="container">
          <h2 className="max-w-[24ch] text-3xl font-extrabold sm:text-4xl">Discover the businesses behind your classmates.</h2>
          <p className="mt-3 max-w-[56ch] text-[#D6DEE9]">Every listing is reviewed by class leaders before it appears in your class directory.</p>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {["Sample Business Name", "Another Sample Business"].map((n) => (
              <div key={n} className="rounded-2xl border-2 border-dashed border-gold/70 p-6">
                <span className="rounded-full border border-gold px-2.5 py-0.5 text-xs font-semibold text-champagne">Sample preview — not a real listing</span>
                <h3 className="mt-4 text-xl font-bold">{n}</h3>
                <p className="mt-1 text-[#D6DEE9]">Industry · City · Short service summary</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container grid gap-12 py-20 sm:py-24 lg:grid-cols-2">
        <div>
          <Icon name="pin" className="h-8 w-8 text-accent-text" />
          <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">No matter where life takes you, your class is never far away.</h2>
          <p className="mt-3 text-muted">Find classmates by country and city. Only members who opt in appear, and precise addresses are never collected.</p>
        </div>
        <div>
          <Icon name="shield" className="h-8 w-8 text-accent-text" />
          <h2 className="mt-4 text-2xl font-extrabold sm:text-3xl">Lead your class, with guardrails.</h2>
          <p className="mt-3 text-muted">
            Class leaders manage members, approvals, events and announcements — with access limited to their own class, multi-factor
            authentication for critical actions, independent approvals and a permanent audit trail.
          </p>
          <Link href="/discover#request" className="mt-4 inline-flex items-center gap-1.5 font-heading font-semibold text-accent-text hover:underline">
            Request your class community <Icon name="arrow" className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <section className="bg-navy py-20 text-center text-white sm:py-24">
        <div className="container">
          <h2 className="mx-auto max-w-[20ch] font-serif text-4xl font-normal sm:text-5xl">Your story didn’t end at graduation.</h2>
          <p className="mx-auto mt-4 max-w-[52ch] text-[#D6DEE9]">Reconnect with the people who were part of your journey and discover what comes next.</p>
          <ButtonLink href="#find" size="lg" className="mt-8 bg-orange-strong text-white">Find your class</ButtonLink>
        </div>
      </section>
    </>
  );
}
