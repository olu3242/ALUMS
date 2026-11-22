import { Card } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Notice, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { getViewer } from "@/lib/session";
import { updateLocation, updateProfile } from "@/lib/actions/profile";
import { SENSITIVE_FIELDS, type ProfileField } from "@/lib/validation";
import type { Profile } from "@/lib/types";

export const metadata = { title: "My profile" };

const LEVELS = [["everyone", "Everyone on ALUMS"], ["members", "Verified class members"], ["connections", "Approved connections"], ["private", "Only me"]] as const;

function Vis({ field, profile }: { field: ProfileField; profile: Profile | null }) {
  const current = profile?.visibility?.[field] ?? (SENSITIVE_FIELDS.includes(field) ? "private" : "members");
  return (
    <Select name={`vis_${field}`} defaultValue={current} aria-label={`Who can see ${field.replace(/_/g, " ")}`} className="h-9 text-sm sm:w-56">
      {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </Select>
  );
}

function Row({ field, label, profile, children, hint }: { field: ProfileField; label: string; profile: Profile | null; children: React.ReactNode; hint?: string }) {
  return (
    <div className="grid gap-2 border-t border-line pt-4 first:border-0 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-end sm:gap-4">
      <Field label={label} htmlFor={field} hint={hint}>{children}</Field>
      <Vis field={field} profile={profile} />
    </div>
  );
}

export default async function ProfilePage() {
  const { profile, user, supabase } = await getViewer();
  const { data: loc } = await supabase.from("locations").select("country, city, share_level, consent_at").eq("user_id", user.id).single();
  const p = profile;
  return (
    <>
      <PageHeader eyebrow="Workflow B" title="My profile" description="You decide who sees each field. Contact details start as “Only me”."
        actions={<ButtonLink href={`/app/alumni/${user.id}`} variant="secondary">Preview as classmates see it</ButtonLink>} />
      <ActionForm action={updateProfile} className="grid gap-6">
        <Card>
          <h2 className="mb-4 text-lg font-bold">Identity</h2>
          <div className="grid gap-4">
            <Row field="full_name" label="Full name" profile={p}><Input id="full_name" name="full_name" defaultValue={p?.full_name} required maxLength={120} /></Row>
            <Row field="name_at_graduation" label="Name at graduation" profile={p} hint="If different today — helps classmates recognise you."><Input id="name_at_graduation" name="name_at_graduation" defaultValue={p?.name_at_graduation ?? ""} maxLength={160} /></Row>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-bold">About</h2>
          <div className="grid gap-4">
            <Row field="headline" label="Headline" profile={p}><Input id="headline" name="headline" defaultValue={p?.headline ?? ""} maxLength={160} placeholder="e.g. Chartered accountant · Lagos" /></Row>
            <Row field="about" label="About you" profile={p}><Textarea id="about" name="about" defaultValue={p?.about ?? ""} maxLength={2000} /></Row>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 text-lg font-bold">Professional</h2>
          <div className="grid gap-4">
            <Row field="profession" label="Profession" profile={p}><Input id="profession" name="profession" defaultValue={p?.profession ?? ""} maxLength={100} /></Row>
            <Row field="industry" label="Industry" profile={p}><Input id="industry" name="industry" defaultValue={p?.industry ?? ""} maxLength={100} /></Row>
            <Row field="employer" label="Employer" profile={p}><Input id="employer" name="employer" defaultValue={p?.employer ?? ""} maxLength={120} /></Row>
            <Row field="job_title" label="Job title" profile={p}><Input id="job_title" name="job_title" defaultValue={p?.job_title ?? ""} maxLength={120} /></Row>
            <Row field="linkedin_url" label="LinkedIn" profile={p}><Input id="linkedin_url" name="linkedin_url" type="url" defaultValue={p?.linkedin_url ?? ""} placeholder="https://linkedin.com/in/…" /></Row>
            <Row field="website_url" label="Website" profile={p}><Input id="website_url" name="website_url" type="url" defaultValue={p?.website_url ?? ""} placeholder="https://" /></Row>
            <Checkbox name="open_to_mentoring" defaultChecked={p?.open_to_mentoring} label="Open to mentoring classmates" />
          </div>
        </Card>
        <Card>
          <h2 className="mb-1 text-lg font-bold">Contact details</h2>
          <p className="mb-4 text-sm text-muted">Sensitive. Private unless you choose otherwise.</p>
          <div className="grid gap-4">
            <Row field="contact_email" label="Contact email" profile={p}><Input id="contact_email" name="contact_email" type="email" defaultValue={p?.contact_email ?? ""} /></Row>
            <Row field="phone" label="Phone" profile={p}><Input id="phone" name="phone" type="tel" defaultValue={p?.phone ?? ""} maxLength={40} /></Row>
          </div>
        </Card>
        <Card>
          <Checkbox name="directory_listed" defaultChecked={p?.directory_listed ?? true} label="List me in my class directories"
            hint="Turn off to stay a verified member without appearing in directory search." />
        </Card>
        <div className="flex justify-end"><SubmitButton pendingLabel="Saving…">Save profile</SubmitButton></div>
      </ActionForm>

      <Card id="location" className="mt-10 scroll-mt-24">
        <h2 className="text-lg font-bold">Location</h2>
        <p className="mt-1 text-sm text-muted">Country and city only — ALUMS never asks for your address. Shown to verified classmates only if you opt in.</p>
        <ActionForm action={updateLocation} className="mt-5 grid gap-4 sm:grid-cols-3">
          <Field label="Country" htmlFor="country"><Input id="country" name="country" defaultValue={loc?.country ?? ""} maxLength={80} /></Field>
          <Field label="City" htmlFor="city"><Input id="city" name="city" defaultValue={loc?.city ?? ""} maxLength={80} /></Field>
          <Field label="Share with classmates" htmlFor="share_level">
            <Select id="share_level" name="share_level" defaultValue={loc?.share_level ?? "hidden"}>
              <option value="hidden">Don't share</option><option value="country">Country only</option><option value="city">Country and city</option>
            </Select>
          </Field>
          <div className="sm:col-span-3"><Checkbox name="consent" label="I consent to verified members of my classes seeing the location level selected above." hint="You can withdraw consent at any time by choosing “Don't share”." /></div>
          <div className="sm:col-span-3"><SubmitButton variant="secondary">Update location</SubmitButton></div>
        </ActionForm>
        {loc?.share_level !== "hidden" && loc?.consent_at && <div className="mt-4"><Notice tone="success">Sharing since {new Date(loc.consent_at).toUTCString().slice(5, 16)}.</Notice></div>}
      </Card>
    </>
  );
}
