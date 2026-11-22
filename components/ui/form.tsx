import { cn } from "@/lib/utils";

const control = "w-full rounded-xl border border-line bg-bg px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/80 shadow-inner shadow-black/[0.02] transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60";

export const Input = ({ className, ...p }: React.InputHTMLAttributes<HTMLInputElement>) => <input className={cn(control, "h-11", className)} {...p} />;
export const Textarea = ({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={cn(control, "min-h-28", className)} {...p} />;
export const Select = ({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className={cn(control, "h-11 pr-8", className)} {...p} />;

export function Field({ label, hint, children, className, htmlFor }: { label: string; hint?: string; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <label htmlFor={htmlFor} className="font-heading text-sm font-semibold">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Checkbox({ label, hint, ...p }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded border-line accent-[rgb(var(--primary))]" {...p} />
      <span><span className="font-medium">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}
