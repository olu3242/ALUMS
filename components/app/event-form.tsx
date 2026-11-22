import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { saveEvent } from "@/lib/actions/content";

type E = { id: string; title: string; description: string | null; starts_at: string; ends_at: string | null; venue: string | null;
  is_virtual: boolean; meeting_url: string | null; capacity: number | null; status: string };
const local = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 16) : "");

export function EventForm({ event }: { event?: E }) {
  return (
    <ActionForm action={saveEvent} className="grid gap-4 sm:grid-cols-2">
      {event && <input type="hidden" name="id" value={event.id} />}
      <Field label="Title" htmlFor="title" className="sm:col-span-2"><Input id="title" name="title" defaultValue={event?.title} required maxLength={160} /></Field>
      <Field label="Starts (UTC)" htmlFor="starts_at"><Input id="starts_at" name="starts_at" type="datetime-local" defaultValue={local(event?.starts_at)} required /></Field>
      <Field label="Ends (UTC, optional)" htmlFor="ends_at"><Input id="ends_at" name="ends_at" type="datetime-local" defaultValue={local(event?.ends_at)} /></Field>
      <Field label="Venue" htmlFor="venue" hint="A public venue name — never a private home address."><Input id="venue" name="venue" defaultValue={event?.venue ?? ""} maxLength={200} /></Field>
      <Field label="Capacity (optional)" htmlFor="capacity"><Input id="capacity" name="capacity" type="number" min={1} defaultValue={event?.capacity ?? ""} /></Field>
      <div className="sm:col-span-2"><Checkbox name="is_virtual" defaultChecked={event?.is_virtual} label="Online event" /></div>
      <Field label="Meeting link (optional)" htmlFor="meeting_url" className="sm:col-span-2"><Input id="meeting_url" name="meeting_url" type="url" defaultValue={event?.meeting_url ?? ""} placeholder="https://" /></Field>
      <Field label="Description" htmlFor="description" className="sm:col-span-2"><Textarea id="description" name="description" defaultValue={event?.description ?? ""} maxLength={5000} /></Field>
      <Field label="Status" htmlFor="status"><Select id="status" name="status" defaultValue={event?.status === "published" ? "published" : "draft"}><option value="draft">Draft (leaders only)</option><option value="published">Published to members</option></Select></Field>
      <div className="flex items-end"><SubmitButton pendingLabel="Saving…">{event ? "Save event" : "Create event"}</SubmitButton></div>
    </ActionForm>
  );
}
