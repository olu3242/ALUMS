import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { CommunityHit } from "@/lib/queries/public";

export function CommunityCard({ c }: { c: CommunityHit }) {
  return (
    <Link href={`/community/${c.slug}`} className="group flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-card transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lift">
      <div className="flex items-center justify-between gap-2">
        <span className="font-heading text-sm font-bold text-accent-text">Class of {c.graduation_year}</span>
        {c.is_founding && <Badge tone="accent">Founding</Badge>}
      </div>
      <h3 className="mt-3 text-lg font-bold group-hover:underline">{c.name}</h3>
      <p className="mt-1 text-sm text-muted">{c.department_name} · {c.institution_name ?? "Institution pending confirmation"}</p>
      <span className="mt-5 text-sm font-semibold text-accent-text">View community →</span>
    </Link>
  );
}
