import { Card } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/misc";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Select, Textarea } from "@/components/ui/form";
import { NeedsCommunity } from "@/components/app/scope-note";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { setPlatformSetting, updateCommunity } from "@/lib/actions/admin";
import { requestAffiliation, revokeAffiliation } from "@/lib/actions/network";
import { StatusBadge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { formatDate } from "@/lib/utils";
import { FeatureSwitches, type FeatureRow } from "@/components/app/feature-switches";

export const metadata = { title: "Admin settings" };

export default async function AdminSettings() {
  const ctx = await requireAdmin("community.manage");
  const supabase = await createClient();
  const community = ctx.current.scope_type === "community"
    ? (await supabase.from("class_communities").select("id, name, description").eq("id", ctx.current.scope_id!).single()).data : null;
  const { data: settings } = ctx.permissions.has("platform.settings") ? await supabase.from("platform_settings").select("key, value") : { data: null };
  const [{ data: affs }, { data: insts }] = community ? await Promise.all([
    supabase.from("community_affiliations").select("id, status, created_at, decided_at, decision_note, institutions(name, slug)")
      .eq("community_id", community.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("institutions").select("id, name, country").eq("status", "verified").order("name"),
  ]) : [{ data: null }, { data: null }];
  const live = (affs ?? []).find((a) => a.status === "pending" || a.status === "approved") as
    { id: string; status: string; created_at: string; institutions: { name: string; slug: string } | null } | undefined;
  const mfa = settings?.find((s) => s.key === "security.require_mfa_for_privileged")?.value !== false;
  return (
    <>
      <PageHeader eyebrow={ctx.current.label} title="Settings" />
      {community ? (
        <Card className="mb-8 max-w-3xl">
          <h2 className="text-lg font-bold">Community profile</h2>
          <p className="text-sm text-muted">Shown on the public community page.</p>
          <ActionForm action={updateCommunity} className="mt-4 grid gap-4">
            <input type="hidden" name="id" value={community.id} />
            <Field label="Description" htmlFor="description"><Textarea id="description" name="description" defaultValue={community.description ?? ""} maxLength={2000} /></Field>
            <div><SubmitButton>Save</SubmitButton></div>
          </ActionForm>
        </Card>
      ) : !settings && <NeedsCommunity next="/admin/settings" />}
      {community && (
        <Card className="mb-8">
          <h2 className="text-lg font-bold">Class features</h2>
          <p className="text-sm text-muted">Turn sections of the member portal on or off for this class. Turning one off hides it from members; nothing is deleted.
            Changes need your authenticator code and are audited.{ctx.scopes.some((s) => s.scope_type === "platform") ? " As a platform admin you can also lock a setting so class leaders can't change it." : ""}</p>
          <div className="mt-3"><FeatureSwitches communityId={community.id}
            rows={((await supabase.rpc("admin_feature_summary", { p_community_id: community.id })).data ?? []) as FeatureRow[]} isPlatform={ctx.scopes.some((s) => s.scope_type === "platform")} /></div>
        </Card>
      )}
      {community && (
        <Card className="mb-8 max-w-3xl">
          <h2 className="text-lg font-bold">Institution affiliation</h2>
          <p className="text-sm text-muted">Link this class to its institution's alumni network: institution branding, alumni news and opportunities, and collaboration with other classes.
            Approving gives the institution's admins oversight of this class; either side can end it.</p>
          {live ? (
            <div className="mt-4 grid gap-3">
              <p className="flex flex-wrap items-center gap-2"><StatusBadge status={live.status} /> <strong>{live.institutions?.name}</strong>
                <span className="text-sm text-muted">since {formatDate(live.created_at)}</span></p>
              <ActionForm action={revokeAffiliation} className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="id" value={live.id} />
                <label className="sr-only" htmlFor="aff-reason">Reason</label>
                <Input id="aff-reason" name="reason" required minLength={3} placeholder="Reason" />
                <SubmitButton variant="secondary">{live.status === "pending" ? "Withdraw request" : "Leave network"}</SubmitButton>
              </ActionForm>
            </div>
          ) : (insts ?? []).length === 0 ? <p className="mt-4 text-sm text-muted">No verified institutions on ALUMS yet. Ask the platform team to add yours.</p> : (
            <ActionForm action={requestAffiliation} className="mt-4 grid gap-3">
              <input type="hidden" name="community_id" value={community.id} />
              <Field label="Institution" htmlFor="aff-inst">
                <Select id="aff-inst" name="institution_id" required defaultValue=""><option value="" disabled>Choose a verified institution…</option>
                  {insts!.map((i) => <option key={i.id} value={i.id}>{i.name}{i.country ? ` (${i.country})` : ""}</option>)}</Select>
              </Field>
              <Field label="Message to the institution (optional)" htmlFor="aff-msg"><Textarea id="aff-msg" name="message" maxLength={1000} className="min-h-16" /></Field>
              <div><SubmitButton>Request affiliation</SubmitButton></div>
            </ActionForm>
          )}
        </Card>
      )}
      {settings && (
        <Card className="max-w-3xl">
          <h2 className="text-lg font-bold">Platform security</h2>
          <ActionForm action={setPlatformSetting} className="mt-4 grid gap-4">
            <input type="hidden" name="key" value="security.require_mfa_for_privileged" />
            <Field label="Require MFA for privileged actions" htmlFor="mfa" hint="Disable only in non-production environments. Changing this is itself MFA-protected and audited.">
              <Select id="mfa" name="value" defaultValue={String(mfa)}><option value="true">Required (recommended)</option><option value="false">Not required</option></Select>
            </Field>
            {!mfa && <Notice tone="warning">MFA is currently not enforced.</Notice>}
            <div><SubmitButton>Save</SubmitButton></div>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
