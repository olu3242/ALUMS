import { Notice } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { getAdminContext } from "@/lib/session";
import { setAdminScope } from "@/lib/actions/admin";

/** Shown when a community-level page is opened from a platform/institution scope: pick a class right here. */
export async function NeedsCommunity({ next }: { next?: string } = {}) {
  const ctx = await getAdminContext();
  const classes = (ctx?.options ?? []).filter((o) => o.scope_type === "community");
  return (
    <div className="grid gap-4">
      <Notice>This page works one class at a time. Choose a class{classes.length ? " below" : ""} (or use the <strong>Admin scope</strong> selector).</Notice>
      {classes.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {classes.map((c) => (
            <li key={c.scope_id}>
              <form action={setAdminScope} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
                <input type="hidden" name="scope" value={`community:${c.scope_id}`} />
                {next && <input type="hidden" name="next" value={next} />}
                <span className="font-semibold">{c.label}</span>
                <Button size="sm" variant="secondary">Open</Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
