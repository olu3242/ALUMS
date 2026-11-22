"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function NavLink({ href, label, icon, badge }: { href: string; label: string; icon: IconName; badge?: number }) {
  const path = usePathname();
  const active = path === href || (href !== "/app/dashboard" && href !== "/admin/dashboard" && path.startsWith(href + "/"));
  return (
    <Link href={href} aria-current={active ? "page" : undefined}
      className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-white/80 transition hover:bg-white/10 hover:text-white",
        active && "bg-white/10 font-semibold text-white shadow-[inset_3px_0_0_#EA580C]")}>
      <Icon name={icon} className="h-[18px] w-[18px] shrink-0" />
      <span className="flex-1">{label}</span>
      {badge ? <span className="rounded-full bg-orange-strong px-2 py-0.5 text-xs font-bold text-white">{badge > 99 ? "99+" : badge}</span> : null}
    </Link>
  );
}
