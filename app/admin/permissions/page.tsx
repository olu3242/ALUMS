import { PageHeader } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Permissions" };

export default async function Permissions() {
  const ctx = await requireAdmin();
  const supabase = await createClient();
  const [{ data: roles }, { data: perms }, { data: rp }] = await Promise.all([
    supabase.from("roles").select("key, name, scope_type, rank, requires_approval, is_financial").order("rank", { ascending: false }),
    supabase.from("permissions").select("key, description").order("key"),
    supabase.from("role_permissions").select("role_key, permission_key"),
  ]);
  const grants = new Set((rp ?? []).map((r) => `${r.role_key}|${r.permission_key}`));
  return (
    <>
      <PageHeader title="Permission matrix" description={<>Read live from the database. Your permissions in <strong>{ctx.current.label}</strong> are highlighted.</>} />
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[900px] text-sm">
          <caption className="sr-only">Roles and the permissions they grant</caption>
          <thead className="bg-surface-2 text-xs">
            <tr>
              <th scope="col" className="sticky left-0 bg-surface-2 p-3 text-left">Permission</th>
              {(roles ?? []).map((r) => (
                <th key={r.key} scope="col" className="p-3 text-center align-bottom">
                  <span className="block font-heading font-bold">{r.name}</span>
                  <span className="block font-normal text-muted">{r.scope_type} · rank {r.rank}</span>
                  <span className="mt-1 flex justify-center gap-1">{r.requires_approval && <Badge tone="warning">approval</Badge>}{r.is_financial && <Badge tone="accent">financial</Badge>}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {(perms ?? []).map((p) => (
              <tr key={p.key} className={ctx.permissions.has(p.key) ? "bg-champagne/15" : undefined}>
                <th scope="row" className="sticky left-0 bg-surface p-3 text-left font-normal"><code className="text-xs font-semibold">{p.key}</code><span className="block text-xs text-muted">{p.description}</span></th>
                {(roles ?? []).map((r) => (
                  <td key={r.key} className="p-3 text-center">{grants.has(`${r.key}|${p.key}`) ? <span className="text-success" aria-label="granted">●</span> : <span className="text-line" aria-label="not granted">·</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-sm text-muted">Verified Member access comes from membership itself (directory, events, gallery, announcements of that class) and needs no role.</p>
    </>
  );
}
