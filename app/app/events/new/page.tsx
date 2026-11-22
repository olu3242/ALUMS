import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { EventForm } from "@/components/app/event-form";
import { requireCommunity } from "@/lib/session";
import { communityPermissions } from "@/lib/queries/member";

export const metadata = { title: "Create event" };
export default async function NewEvent() {
  const community = await requireCommunity();
  if (!(await communityPermissions(community.id)).has("event.create")) redirect("/app/events");
  return (
    <>
      <PageHeader eyebrow={community.name} title="Create an event" />
      <Card className="max-w-3xl"><EventForm /></Card>
    </>
  );
}
