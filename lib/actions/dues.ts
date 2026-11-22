"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireUser } from "@/lib/session";
import { duesPaymentSchema, duesPlanSchema, fieldErrors, recordPaymentSchema } from "@/lib/validation";
import { toMinor } from "@/lib/money";
import { friendlyError, type ActionState } from "@/lib/errors";

const uuid = z.string().uuid();
const done = (message: string): ActionState => { revalidatePath("/admin/dues"); revalidatePath("/app/dues"); return { ok: true, message }; };

export async function createDuesPlan(_: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireAdmin("finance.manage");
  if (ctx.current.scope_type !== "community") return { error: "Choose a community first." };
  const parsed = duesPlanSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data, minor = toMinor(d.amount);
  if (!minor) return { fieldErrors: { amount: ["Enter a positive amount with up to 2 decimals"] } };
  const { error } = await (await createClient()).rpc("create_dues_plan", {
    p_community_id: ctx.current.scope_id, p_name: d.name, p_amount_minor: minor, p_currency: d.currency, p_period: d.period,
    p_due_date: d.due_date, p_description: d.description, p_payment_instructions: d.payment_instructions, p_payment_url: d.payment_url,
  });
  return error ? { error: friendlyError(error) } : done("Dues plan created and members notified.");
}

export async function setPlanStatus(form: FormData) {
  await requireAdmin("finance.manage");
  await (await createClient()).rpc("set_dues_plan_status", {
    p_plan_id: uuid.parse(form.get("id")), p_status: z.enum(["active", "archived"]).parse(form.get("status")),
  });
  revalidatePath("/admin/dues");
}

export async function submitDuesPayment(_: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = duesPaymentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data, minor = toMinor(d.amount);
  if (!minor) return { fieldErrors: { amount: ["Enter a positive amount with up to 2 decimals"] } };
  const { error } = await (await createClient()).rpc("submit_dues_payment", {
    p_plan_id: d.plan_id, p_amount_minor: minor, p_method: d.method, p_reference: d.reference, p_period_label: d.period_label, p_note: d.note,
  });
  return error ? { error: friendlyError(error) } : done("Thanks — your treasurer will confirm this payment.");
}

export async function recordDuesPayment(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("finance.manage");
  const parsed = recordPaymentSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data, minor = toMinor(d.amount);
  if (!minor) return { fieldErrors: { amount: ["Enter a positive amount with up to 2 decimals"] } };
  const { error } = await (await createClient()).rpc("record_dues_payment", {
    p_plan_id: d.plan_id, p_user_id: d.user_id, p_amount_minor: minor, p_method: d.method, p_reference: d.reference,
    p_period_label: d.period_label, p_note: d.note,
  });
  return error ? { error: friendlyError(error) } : done("Payment recorded and member notified.");
}

export async function decideDuesPayment(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("finance.manage");
  const { error } = await (await createClient()).rpc("decide_dues_payment", {
    p_payment_id: uuid.parse(form.get("id")), p_confirm: form.get("decision") === "confirm",
    p_note: z.string().trim().max(500).optional().parse(form.get("note") || undefined) ?? null,
  });
  return error ? { error: friendlyError(error) } : done(form.get("decision") === "confirm" ? "Payment confirmed." : "Payment rejected.");
}

export async function voidDuesPayment(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin("finance.manage");
  const reason = z.string().trim().min(3, "Give a reason").max(500).safeParse(form.get("reason"));
  if (!reason.success) return { error: "Give a reason for voiding this payment." };
  const { error } = await (await createClient()).rpc("void_dues_payment", { p_payment_id: uuid.parse(form.get("id")), p_reason: reason.data });
  return error ? { error: friendlyError(error) } : done("Payment voided.");
}
