import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";

export const metadata = { title: "About ALUMS" };

const PRINCIPLES = [
  ["users", "Class-first", "Your graduating class — not a distant institution office — is the heart of ALUMS. “Class of” is how you find your people."],
  ["shield", "Verified by your class", "Every member is reviewed by class leaders or invited by them. Member data is only visible after verification."],
  ["key", "Private by default", "You choose who sees each field: everyone, verified classmates, approved connections or only you. Contact details start private."],
  ["scroll", "Accountable leadership", "Leaders can only act within their own class. Critical changes need an independent approval and every privileged action is logged."],
] as const;

export default function About() {
  return (
    <>
      <section className="hero-surface py-20 text-white">
        <div className="container">
          <div className="gold-rule mb-6" />
          <h1 className="max-w-[18ch] font-serif text-5xl font-normal leading-tight">Turning shared history into lifelong opportunity.</h1>
          <p className="mt-5 max-w-[60ch] text-lg text-[#D6DEE9]">
            Classmates drift apart after graduation, and class-led groups end up scattered across chats and spreadsheets. ALUMS gives every
            class a verified, private home — with a directory, businesses, events, memories and governance built in.
          </p>
        </div>
      </section>
      <section className="container grid gap-6 py-20 sm:grid-cols-2">
        {PRINCIPLES.map(([icon, t, d]) => (
          <article key={t} className="rounded-2xl border border-line bg-surface p-7 shadow-card">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-champagne text-navy"><Icon name={icon} /></span>
            <h2 className="mt-5 text-xl font-bold">{t}</h2>
            <p className="mt-2 text-muted">{d}</p>
          </article>
        ))}
      </section>
      <section className="container pb-24 text-center">
        <h2 className="text-2xl font-extrabold">Ready to find your class?</h2>
        <ButtonLink href="/discover" size="lg" className="mt-6">Find my class</ButtonLink>
      </section>
    </>
  );
}
