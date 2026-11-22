"use client";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/errors";
import { buttonClass, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Action = (prev: ActionState, data: FormData) => Promise<ActionState>;

export function ActionForm({ action, children, className, resetOnSuccess = false, ...rest }:
  { action: Action; children: React.ReactNode; className?: string; resetOnSuccess?: boolean } & Omit<React.FormHTMLAttributes<HTMLFormElement>, "action">) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok && resetOnSuccess) ref.current?.reset(); }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} noValidate={false} {...rest}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  const fe = state?.fieldErrors ? Object.entries(state.fieldErrors).filter(([, v]) => v?.length) : [];
  return (
    <div aria-live="polite" className="empty:hidden">
      {state?.error && <p role="alert" className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{state.error}</p>}
      {fe.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-sm text-danger">
          {fe.map(([k, v]) => <li key={k}><span className="font-semibold">{k.replace(/_/g, " ")}</span>: {v.join(", ")}</li>)}
        </ul>
      )}
      {state?.ok && state.message && <p role="status" className="mt-3 rounded-xl border border-success/30 bg-success/10 px-3.5 py-2.5 text-sm text-success">{state.message}</p>}
    </div>
  );
}

export function SubmitButton({ children, pendingLabel = "Working…", variant, size, className, ...p }:
  ButtonProps & { pendingLabel?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-disabled={pending} className={cn(buttonClass({ variant, size, className }))} {...p}>
      {pending ? pendingLabel : children}
    </button>
  );
}
