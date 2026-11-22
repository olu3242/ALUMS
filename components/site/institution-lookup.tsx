"use client";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { DirectoryCountry, DirectoryEntry } from "@/lib/queries/public";

const control = "w-full rounded-xl border border-line bg-bg px-3.5 text-[15px] text-ink placeholder:text-muted/80 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30";
const KIND: Record<string, string> = { polytechnic: "Polytechnic", college: "College", university: "University", other: "Institution" };

/**
 * WAI-ARIA combobox over the worldwide institution directory. Progressive enhancement: without JS it is a plain
 * text input, so typed names still submit. Picking a suggestion fills the official name (and an optional hidden id).
 */
export function InstitutionLookup({ label = "Institution", name = "institution", idName, countryName, countries, defaultValue = "",
  defaultCountry = "", required, placeholder = "Search your institution", featured = ["Nigeria"] }: {
  label?: string; name?: string; idName?: string; countryName?: string; countries?: DirectoryCountry[]; defaultValue?: string;
  defaultCountry?: string; required?: boolean; placeholder?: string; featured?: string[];
}) {
  const uid = useId();
  const [query, setQuery] = useState(defaultValue);
  const [country, setCountry] = useState(defaultCountry);
  const [results, setResults] = useState<DirectoryEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [selected, setSelected] = useState<DirectoryEntry | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const skip = useRef(false);

  useEffect(() => {
    if (skip.current) { skip.current = false; return; }
    const q = query.trim();
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/institutions?${new URLSearchParams({ q, ...(country ? { country } : {}) })}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const rows = (await res.json()) as DirectoryEntry[];
        setResults(rows); setOpen(true); setActive(-1); setStatus("idle");
      } catch (e) { if (!ctrl.signal.aborted) { setStatus("error"); setResults([]); setOpen(true); } }
    }, 200);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, country]);

  const choose = (r: DirectoryEntry) => {
    skip.current = true; setQuery(r.name); setSelected(r); setOpen(false); setActive(-1);
  };
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && open && active >= 0 && results[active]) { e.preventDefault(); choose(results[active]!); }
    else if (e.key === "Escape") { setOpen(false); setActive(-1); }
  };
  const featuredList = (countries ?? []).filter((c) => featured.includes(c.country));
  const rest = (countries ?? []).filter((c) => !featured.includes(c.country));
  const listId = `${uid}-list`;

  return (
    <div className={cn("grid gap-1.5", countryName && countries?.length ? "sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-3" : "")}>
      {countryName && countries && countries.length > 0 && (
        <label className="grid gap-1.5 font-heading text-sm font-semibold">Country
          <select name={countryName} value={country} onChange={(e) => { setCountry(e.target.value); setSelected(null); }} className={cn(control, "h-11 pr-8")}>
            <option value="">All countries</option>
            {featuredList.length > 0 && <optgroup label="Featured">{featuredList.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}</optgroup>}
            <optgroup label="All countries">{rest.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}</optgroup>
          </select>
        </label>
      )}
      <div className="relative grid gap-1.5">
        <label htmlFor={`${uid}-input`} className="font-heading text-sm font-semibold">{label}</label>
        <input id={`${uid}-input`} name={name} value={query} required={required} placeholder={placeholder} autoComplete="off" maxLength={200}
          role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${uid}-opt-${active}` : undefined}
          onChange={(e) => { setQuery(e.target.value); setSelected(null); }} onKeyDown={onKey}
          onBlur={() => setTimeout(() => setOpen(false), 120)} onFocus={() => results.length && setOpen(true)}
          className={cn(control, "h-11")} />
        {idName && <input type="hidden" name={idName} value={selected?.id ?? ""} />}
        <ul id={listId} role="listbox" aria-label={`${label} suggestions`} hidden={!open}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-auto rounded-xl border border-line bg-surface p-1 text-left shadow-lift">
          {status === "error" ? <li className="px-3 py-2 text-sm text-muted">Lookup unavailable — you can still type the name.</li>
            : results.length === 0 ? <li className="px-3 py-2 text-sm text-muted">{status === "loading" ? "Searching…" : "No match in the directory — keep typing your institution's name."}</li>
            : results.map((r, i) => (
              <li key={r.id} id={`${uid}-opt-${i}`} role="option" aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); choose(r); }} onMouseEnter={() => setActive(i)}
                className={cn("cursor-pointer rounded-lg px-3 py-2", i === active && "bg-surface-2")}>
                <span className="block font-medium text-ink">{r.name}</span>
                <span className="block text-xs text-muted">{[r.state_province, r.country].filter(Boolean).join(", ")} · {KIND[r.kind] ?? "Institution"}</span>
              </li>
            ))}
        </ul>
        <span aria-live="polite" className="sr-only">{open && status === "idle" ? `${results.length} suggestions` : ""}</span>
      </div>
    </div>
  );
}
