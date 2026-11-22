import { cn } from "@/lib/utils";

const tones = {
  neutral: "border-line bg-surface-2 text-ink",
  accent: "border-gold/70 bg-champagne/50 text-navy dark:bg-transparent dark:text-champagne",
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  danger: "border-danger/40 bg-danger/10 text-danger",
} as const;

export function Badge({ tone = "neutral", className, ...props }: { tone?: keyof typeof tones } & React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)} {...props} />;
}

const STATUS_TONE: Record<string, keyof typeof tones> = {
  active: "success", approved: "success", verified: "success", published: "success", accepted: "success", actioned: "success",
  pending: "warning", pending_approval: "warning", submitted: "warning", pending_verification: "warning", draft: "neutral", open: "warning",
  rejected: "danger", suspended: "danger", revoked: "danger", cancelled: "danger", declined: "danger",
  left: "neutral", withdrawn: "neutral", archived: "neutral", dismissed: "neutral", hidden: "neutral", unverified: "neutral",
};
export const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={STATUS_TONE[status] ?? "neutral"}>{status.replace(/_/g, " ")}</Badge>
);
