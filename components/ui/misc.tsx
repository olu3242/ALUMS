import { cn, initials } from "@/lib/utils";

export function Avatar({ name, className }: { name?: string | null; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-full bg-champagne font-heading text-sm font-extrabold text-navy ring-2 ring-surface", className)}>
      {initials(name)}
    </span>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gold/70 bg-surface/60 px-6 py-12 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-champagne/60 text-navy" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="13" r="7" /><circle cx="12" cy="4" r="2" fill="currentColor" /></svg>
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <div className="mx-auto mt-2 max-w-prose text-sm text-muted">{children}</div>}
      {action && <div className="mt-5 flex justify-center gap-3">{action}</div>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-2xl font-extrabold sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "success"; children: React.ReactNode }) {
  const t = { info: "border-gold/60 bg-champagne/30", warning: "border-warning/40 bg-warning/10", success: "border-success/40 bg-success/10" }[tone];
  return <div role="note" className={cn("rounded-xl border px-4 py-3 text-sm", t)}>{children}</div>;
}

export function BackendNotice() {
  return (
    <Notice tone="warning">
      <strong>Backend not connected.</strong> Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable
      accounts, communities and member data. No sample data is shown in its place.
    </Notice>
  );
}
