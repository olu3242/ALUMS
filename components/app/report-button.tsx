import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Textarea } from "@/components/ui/form";
import { reportContent } from "@/lib/actions/content";

export function ReportButton({ type, id }: { type: "business" | "event" | "announcement" | "media" | "profile"; id: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer list-none text-muted hover:text-ink [&::-webkit-details-marker]:hidden">Report</summary>
      <ActionForm action={reportContent} resetOnSuccess className="mt-2 grid w-72 max-w-full gap-2 rounded-xl border border-line bg-surface p-3 shadow-card">
        <input type="hidden" name="target_type" value={type} /><input type="hidden" name="target_id" value={id} />
        <label htmlFor={`rep-${id}`} className="font-semibold">What's wrong?</label>
        <Textarea id={`rep-${id}`} name="reason" required minLength={3} maxLength={1000} className="min-h-20" />
        <SubmitButton size="sm" variant="secondary">Send to moderators</SubmitButton>
      </ActionForm>
    </details>
  );
}
