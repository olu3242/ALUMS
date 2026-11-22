"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Fades/rises children in once when scrolled into view. Content is visible by default (no-JS, crawlers,
 * reduced motion); the hidden start state only applies after hydration when motion is allowed.
 */
export function Reveal({ children, className, delay = 0, as: Tag = "div" }:
  { children: React.ReactNode; className?: string; delay?: number; as?: "div" | "li" }) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"static" | "hidden" | "shown">("static");

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9) return; // already on screen: don't flash
    setState("hidden");
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setState("shown"); io.disconnect(); } }, { rootMargin: "0px 0px -10% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Tag ref={ref as never} style={{ transitionDelay: state === "shown" ? `${delay}ms` : undefined }}
      className={cn("transition-[opacity,transform] duration-700 ease-[cubic-bezier(.2,.7,.2,1)]",
        state === "hidden" && "translate-y-6 opacity-0", className)}>
      {children}
    </Tag>
  );
}
