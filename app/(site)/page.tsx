import Image from "next/image";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClassFinder } from "@/components/site/class-finder";
import { FeatureCarousel, type FeatureSlide } from "@/components/site/feature-carousel";
import { Reveal } from "@/components/site/reveal";
import { AI_IMAGE_LABEL, LANDING_IMAGES } from "@/lib/landing-media";

const STEPS = [
  ["Find your class", "Search by institution, department and year."],
  ["Get verified", "Class leaders review every request."],
  ["Reconnect", "Share only what you choose."],
  ["Grow together", "Hire, partner, mentor and meet."],
] as const;

// One carousel replaces the former feature grid + businesses / locations / leadership bands.
const FEATURES: FeatureSlide[] = [
  { icon: "users", title: "Alumni Directory", body: "Find classmates by name, profession, industry and city.",
    points: ["Verified members only", "Filters respect each person's privacy"] },
  { icon: "user", title: "Personal Profiles", body: "Tell your story since graduation, on your terms.",
    points: ["Visibility set per field", "Contact details private by default"] },
  { icon: "briefcase", title: "Business Directory", body: "Discover and support businesses run by classmates.",
    points: ["Every listing reviewed first", "Owner verification badge"] },
  { icon: "pin", title: "Alumni Locations", body: "See where your class is in the world — country and city.",
    points: ["Strictly opt-in, with consent", "Addresses are never collected"] },
  { icon: "calendar", title: "Events & Reunions", body: "Plan gatherings and know who's coming.",
    points: ["RSVPs and capacity", "Reminders and attendance"] },
  { icon: "image", title: "Class Memories", body: "Graduation photos and milestones in shared albums.",
    points: ["Private to your class", "Moderated by leaders"] },
  { icon: "megaphone", title: "Announcements", body: "One feed for news from your class leaders.",
    points: ["Pinned updates", "Members notified instantly"] },
  { icon: "building", title: "Institution network", body: "Branded institution pages with news and opportunities across every class.",
    points: ["Logo, colours and public page", "Partners, associations and chapters"] },
  { icon: "shield", title: "Lead with guardrails", body: "Class leaders manage members, approvals and events.",
    points: ["Access limited to their own class", "MFA, independent approvals, audit trail"] },
  { icon: "heart", title: "Dues & contributions", body: "Pay class dues and see your status at a glance.",
    points: ["Treasurer-confirmed, never self-approved", "Every payment on an audited ledger"] },
];

export default function Home() {
  const { hero, celebrate } = LANDING_IMAGES;
  return (
    <>
      <section className="hero-surface relative overflow-hidden pb-32 pt-16 text-white sm:pt-24">
        <div className={`container relative ${hero ? "grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr]" : ""}`}>
          <div>
            <div className="gold-rule mb-7 origin-left animate-[grow_.8s_cubic-bezier(.2,.7,.2,1)_both]" />
            <h1 className="max-w-[13ch] animate-rise font-serif text-[clamp(2.6rem,7.5vw,5.25rem)] font-normal leading-[1.02] tracking-normal">
              Your class. Your people. Your network.
            </h1>
            <p className="mt-6 max-w-[48ch] animate-rise text-lg text-[#D6DEE9] [animation-delay:80ms]">
              Graduation was just the beginning. Reconnect with classmates in a verified, private community that belongs to your class.
            </p>
            <div className="mt-8 flex animate-rise flex-wrap gap-3 [animation-delay:160ms]">
              <ButtonLink href="#find" size="lg" className="bg-orange-strong text-white">Find my class</ButtonLink>
              <ButtonLink href="#features" size="lg" variant="onDark">See what's inside</ButtonLink>
            </div>
          </div>
          {hero && (
            <figure className="relative hidden animate-rise [animation-delay:120ms] lg:block">
              <div className="overflow-hidden rounded-[28px] border border-gold/50 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
                <Image src={hero.src} width={hero.width} height={hero.height} alt={hero.alt} priority
                  sizes="(min-width: 1024px) 560px, 0px" className="aspect-[549/310] h-auto w-full object-cover" />
              </div>
              <figcaption className="mt-3 text-right text-xs text-white/60">{AI_IMAGE_LABEL}</figcaption>
            </figure>
          )}
        </div>
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-[-10%] h-72 w-72 animate-[float_12s_ease-in-out_infinite] rounded-full border border-gold/20 motion-reduce:animate-none" />
      </section>

      <div id="find" className="container relative z-10 -mt-20 scroll-mt-24">
        <ClassFinder />
      </div>

      <section id="how" aria-labelledby="how-title" className="container scroll-mt-20 py-16 sm:py-20">
        <Reveal><h2 id="how-title" className="text-center text-2xl font-extrabold sm:text-3xl">From “Class of” to community</h2></Reveal>
        <ol className="relative mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <span aria-hidden className="absolute left-[12.5%] right-[12.5%] top-6 hidden h-px bg-gradient-to-r from-transparent via-gold/70 to-transparent lg:block" />
          {STEPS.map(([t, d], i) => (
            <Reveal as="li" key={t} delay={i * 120} className="relative text-center">
              <span className="relative mx-auto grid h-12 w-12 place-items-center rounded-full border-2 border-accent bg-bg font-heading text-lg font-extrabold text-accent-text">{i + 1}</span>
              <h3 className="mt-4 font-bold">{t}</h3>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </Reveal>
          ))}
        </ol>
      </section>

      <section id="features" aria-labelledby="features-title" className="scroll-mt-16 overflow-hidden bg-champagne/70 py-16 text-navy dark:bg-surface-2 dark:text-ink sm:py-20">
        <div className="container">
          <Reveal className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow text-navy dark:text-accent-text">One home for your class</p>
              <h2 id="features-title" className="mt-2 text-3xl font-extrabold sm:text-4xl">Everything your class needs</h2>
            </div>
            <p className="max-w-sm text-[15px] text-navy/75 dark:text-muted">Swipe, use the arrows, or let it play. Every feature is private to verified members.</p>
          </Reveal>
          <Reveal delay={100}><FeatureCarousel slides={FEATURES} label="ALUMS features" /></Reveal>
        </div>
      </section>

      {celebrate && (
        <section aria-labelledby="memories" className="container grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[.9fr_1.1fr]">
          <Reveal as="div" className="mx-auto w-full max-w-[440px] lg:mx-0">
            <figure>
              <div className="overflow-hidden rounded-[28px] border border-line shadow-lift">
                <Image src={celebrate.src} width={celebrate.width} height={celebrate.height} alt={celebrate.alt}
                  sizes="(min-width: 1024px) 440px, 100vw" className="aspect-[441/549] h-auto w-full object-cover" />
              </div>
              <figcaption className="mt-3 text-xs text-muted">{AI_IMAGE_LABEL}</figcaption>
            </figure>
          </Reveal>
          <Reveal delay={120}>
            <p className="eyebrow">Class memories</p>
            <h2 id="memories" className="mt-2 max-w-[18ch] font-serif text-4xl font-normal sm:text-5xl">The day you threw your caps, together.</h2>
            <p className="mt-4 max-w-[52ch] text-muted">Graduation photos, reunion moments and milestones — private to verified classmates.</p>
          </Reveal>
        </section>
      )}

      <section id="community" aria-labelledby="community-title" className="container py-16 sm:py-20">
        <Reveal className="grid items-center gap-8 rounded-3xl border border-line bg-surface p-7 shadow-card sm:p-10 lg:grid-cols-[1.2fr_.8fr]">
          <div>
            <Badge tone="accent">Founding community</Badge>
            <h2 id="community-title" className="mt-4 text-3xl font-extrabold sm:text-4xl">Accounting — Class of 2007</h2>
            <p className="mt-3 max-w-[52ch] text-muted">The first community on ALUMS, shaping the platform with real classmates. Its institution is shown once verified.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/community/accounting-class-of-2007">View community</ButtonLink>
              <ButtonLink href="/register?next=/community/accounting-class-of-2007" variant="secondary">Apply to join</ButtonLink>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-3 text-center lg:grid-cols-1 lg:text-left">
            {[["Department", "Accounting"], ["Class of", "2007"], ["Institution", "Pending"]].map(([k, v]) => (
              <div key={k} className="rounded-2xl bg-surface-2 px-4 py-3"><dt className="text-xs text-muted">{k}</dt><dd className="font-heading font-bold">{v}</dd></div>
            ))}
          </dl>
        </Reveal>
      </section>

      <section className="bg-navy py-16 text-center text-white sm:py-20">
        <Reveal className="container">
          <h2 className="mx-auto max-w-[20ch] font-serif text-4xl font-normal sm:text-5xl">Your story didn’t end at graduation.</h2>
          <ButtonLink href="#find" size="lg" className="mt-8 bg-orange-strong text-white">Find your class</ButtonLink>
        </Reveal>
      </section>
    </>
  );
}
