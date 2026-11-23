import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ActionForm, SubmitButton } from "@/components/ui/action-form";
import { Checkbox, Field, Input } from "@/components/ui/form";
import { ButtonLink } from "@/components/ui/button";
import { getPermissions, requireCommunity } from "@/lib/session";
import { saveCommunityHeader } from "@/lib/actions/community";
import { ClassDetailsForm } from "@/components/app/class-details-form";
import { getDirectoryCountries } from "@/lib/queries/public";

export const metadata = { title: "Edit dashboard header" };

export default async function EditHeader() {
  const community = await requireCommunity();
  const perms = await getPermissions("community", community.id);
  if (!perms.has("community.manage")) redirect("/app/dashboard");
  const canEditIdentity = perms.has("community.create"); // platform or institution admins (re-checked by edit_community)
  return (
    <>
      <PageHeader eyebrow={community.name} title="Dashboard header" description="Shown to verified members at the top of the class dashboard. Changes are audited."
        actions={<ButtonLink href="/app/dashboard" variant="secondary">Back to dashboard</ButtonLink>} />
      {canEditIdentity && (
        <Card className="mb-6 max-w-2xl">
          <h2 className="text-lg font-bold">Class details</h2>
          <p className="text-sm text-muted">The heading and the line under it, in the same order members search: institution, department, then graduation year.</p>
          <div className="mt-4"><ClassDetailsForm c={community} institutionName={community.institutions?.name ?? null}
            canChangeInstitution={perms.has("institution.manage")} countries={await getDirectoryCountries()} /></div>
        </Card>
      )}
      <Card className="max-w-2xl">
        <h2 className="mb-4 text-lg font-bold">Tagline and cover photo</h2>
        <ActionForm action={saveCommunityHeader} className="grid gap-5" encType="multipart/form-data">
          <input type="hidden" name="community_id" value={community.id} />
          <Field label="Tagline" htmlFor="tagline" hint="Up to 160 characters, e.g. “Twenty years since we walked the hall.” Leave empty to hide.">
            <Input id="tagline" name="tagline" maxLength={160} defaultValue={community.header_tagline ?? ""} />
          </Field>
          <Field label="Cover photo (PNG, JPEG or WebP, up to 3 MB)" htmlFor="cover" hint="Private to members. A brand-colour overlay keeps text readable.">
            <Input id="cover" name="cover" type="file" accept="image/png,image/jpeg,image/webp" className="py-2" />
          </Field>
          {community.header_cover_path && (
            <Checkbox name="remove_cover" label="Remove the current cover photo" />
          )}
          <div><SubmitButton>Save header</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
