"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type FeatureSlide = { icon: IconName; title: string; body: string; points: string[]; tag?: string };

const AUTOPLAY_MS = 5500;

/**
 * Accessible carousel (WAI-ARIA APG pattern): native scroll-snap track (touch/trackpad swipe), prev/next,
 * dot navigation, ←/→ keys. Autoplay pauses on hover/focus, has a visible pause control (WCAG 2.2.2),
 * and is off entirely for prefers-reduced-motion.
 */
export function FeatureCarousel({ slides, label }: { slides: FeatureSlide[]; label: string }) {
  const uid = useId();
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { setReduced(mq.matches); setPlaying(!mq.matches); };
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const goTo = useCallback((i: number) => {
    const el = track.current;
    if (!el) return;
    const n = slides.length;
    const target = el.children[((i % n) + n) % n] as HTMLElement | undefined;
    const first = el.children[0] as HTMLElement | undefined;
    if (target && first) el.scrollTo({ left: target.offsetLeft - first.offsetLeft, behavior: reduced ? "auto" : "smooth" });
  }, [slides.length, reduced]);

  // Track which slide is nearest the start edge.
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const kids = Array.from(el.children) as HTMLElement[];
        let best = 0, dist = Infinity;
        const origin = kids[0]?.offsetLeft ?? 0;
        kids.forEach((k, i) => { const d = Math.abs(k.offsetLeft - origin - el.scrollLeft); if (d < dist) { dist = d; best = i; } });
        // At the far end, the last slide is the active one even if it can't snap to the start edge.
        if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) best = kids.length - 1;
        setActive(best);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    if (!playing || hovered || reduced) return;
    const t = setTimeout(() => goTo(active + 1 >= slides.length ? 0 : active + 1), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [playing, hovered, reduced, active, goTo, slides.length]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); goTo(active + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); goTo(active - 1); }
  };

  return (
    <section aria-roledescription="carousel" aria-label={label} onKeyDown={onKey}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(false); }}>
      <div id={`${uid}-track`} ref={track} tabIndex={0} aria-live={playing && !hovered ? "off" : "polite"}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto scroll-smooth px-4 pb-6 pt-2 [scrollbar-width:none] focus-visible:outline-offset-4 [&::-webkit-scrollbar]:hidden">
        {slides.map((s, i) => (
          <article key={s.title} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${slides.length}: ${s.title}`}
            className={cn("group relative flex w-[85%] shrink-0 snap-start flex-col overflow-hidden rounded-3xl border border-line bg-surface p-7 text-ink shadow-card transition duration-500 sm:w-[calc(50%-10px)] lg:w-[calc(33.333%-14px)]",
              i === active ? "shadow-lift" : "opacity-95")}>
            <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-champagne/50 transition duration-700 group-hover:scale-125 dark:bg-gold/10" />
            <div className="relative flex items-center justify-between">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-navy text-champagne transition duration-500 group-hover:-rotate-6"><Icon name={s.icon} className="h-6 w-6" /></span>
              <span className="font-heading text-sm font-bold tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <h3 className="relative mt-6 text-xl font-bold">{s.title}</h3>
            <p className="relative mt-2 text-[15px] text-muted">{s.body}</p>
            <ul className="relative mt-5 grid gap-2 text-sm">
              {s.points.map((p) => (
                <li key={p} className="flex gap-2"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" /><span>{p}</span></li>
              ))}
            </ul>
            {s.tag && <span className="relative mt-auto self-start pt-5"><span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-xs font-semibold">{s.tag}</span></span>}
          </article>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          <button type="button" onClick={() => goTo(active - 1)} aria-controls={`${uid}-track`} aria-label="Previous feature"
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink transition hover:border-accent hover:text-accent-text">
            <Icon name="arrow" className="h-5 w-5 rotate-180" />
          </button>
          <button type="button" onClick={() => goTo(active + 1)} aria-controls={`${uid}-track`} aria-label="Next feature"
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface text-ink transition hover:border-accent hover:text-accent-text">
            <Icon name="arrow" className="h-5 w-5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Choose a feature">
          {slides.map((s, i) => (
            <button key={s.title} type="button" onClick={() => goTo(i)} aria-label={`Show ${s.title}`} aria-current={i === active ? "true" : undefined}
              className="grid h-6 w-6 place-items-center">
              <span className={cn("block h-2 rounded-full transition-all duration-300", i === active ? "w-6 bg-accent" : "w-2 bg-ink/25 hover:bg-ink/50")} />
            </button>
          ))}
        </div>
        {!reduced && (
          <button type="button" onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}
            className="ml-auto rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold text-ink transition hover:border-accent">
            {playing ? "Pause" : "Play"}<span className="sr-only"> automatic rotation</span>
          </button>
        )}
      </div>
    </section>
  );
}
