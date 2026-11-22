import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const initials = (name?: string | null) =>
  (name ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "A";

const dtf = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const df = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });
export const formatDateTime = (v: string | Date) => `${dtf.format(new Date(v))} UTC`;
export const formatDate = (v: string | Date) => df.format(new Date(v));

/** Only allow same-origin relative redirects. */
export const safeNext = (v: unknown, fallback = "/app/dashboard") =>
  typeof v === "string" && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : fallback;
