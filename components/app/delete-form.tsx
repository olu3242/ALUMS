import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Checkbox } from "@/components/ui/form";
import type { ActionState } from "@/lib/errors";

/** Safe-delete control: explicit confirmation; Postgres refuses when the record still has dependants. */
export function DeleteForm({ action, id, label, hint }: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>; id: string; label: string; hint: string;
}) {
  return (
    <ActionForm action={action} className="grid gap-2 rounded-xl border border-line p-3">
      <input type="hidden" name="id" value={id} />
      <Checkbox name="confirm" required label={`Yes, ${label.toLowerCase()}`} hint={hint} />
      <div><SubmitButton variant="danger" size="sm" pendingLabel="Deleting…">{label}</SubmitButton></div>
    </ActionForm>
  );
}
