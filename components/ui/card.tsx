import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6", className)} {...props} />;
}
export function CardTitle({ className, as: Tag = "h2", ...props }: React.HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" }) {
  return <Tag className={cn("text-lg font-bold", className)} {...props} />;
}
export function Stat({ label, value, hint }: { label: string; value: number | string | null | undefined; hint?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 font-heading text-3xl font-extrabold tabular-nums">{value ?? "—"}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
