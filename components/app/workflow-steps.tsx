import { cn } from "@/lib/utils";
import type { StepView } from "@/lib/workflows";

const DOT: Record<StepView["outcome"], string> = {
  completed: "bg-success border-success", skipped: "bg-success/40 border-success/40", waiting: "bg-warning border-warning animate-pulse motion-reduce:animate-none",
  denied: "bg-danger border-danger", pending: "bg-transparent border-line",
};
const TEXT: Record<StepView["outcome"], string> = { completed: "Done", skipped: "Not needed", waiting: "Waiting", denied: "Declined", pending: "To do" };

/** Accessible step tracker for a workflow run (list with per-step status text). */
export function WorkflowSteps({ steps, compact = false }: { steps: StepView[]; compact?: boolean }) {
  return (
    <ol className={cn("flex flex-wrap gap-x-4 gap-y-2", compact && "gap-x-3")}>
      {steps.map((s) => (
        <li key={s.id} className="flex items-center gap-2 text-sm">
          <span aria-hidden className={cn("h-3 w-3 shrink-0 rounded-full border-2", DOT[s.outcome])} />
          <span className={cn(s.outcome === "pending" && "text-muted")}>{s.label}</span>
          <span className="sr-only">: {TEXT[s.outcome]}</span>
        </li>
      ))}
    </ol>
  );
}
