import { Card } from "@/components/ui/card";
import { Notice, PageHeader } from "@/components/ui/misc";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Field, Select, Textarea } from "@/components/ui/form";
import { NeedsCommunity } from "@/components/app/scope-note";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { setPlatformSetting, updateCommunity } from "@/lib/actions/admin";

export const metadata = { title: "Admin settings" };

export default async function AdminSettings() {
  const ctx = await requireAdmin("community.manage");
  const supabase = await createClient();
  const community = ctx.current.scope_type === "community"
    ? (await supabase.from("class_communities").select("id, name, description").eq("id", ctx.current.scope_id!).single()).data : null;
  const { data: settings } = ctx.permissions.has("platform.settings") ? await supabase.from("platform_settings").select("key, value") : { data: null };
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
      ) : !settings && <NeedsCommunity />}
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
