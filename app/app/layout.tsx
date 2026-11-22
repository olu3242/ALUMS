import { Shell, CommunitySwitcher, type NavItem } from "@/components/app/shell";
import { BackendNotice } from "@/components/ui/misc";
import { isBackendConfigured } from "@/lib/env";
import { getActiveCommunity, getViewer } from "@/lib/session";
import { switchCommunity } from "@/lib/actions/membership";

export const dynamic = "force-dynamic";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  if (!isBackendConfigured()) return <main id="main" className="container py-16"><BackendNotice /></main>;
  const { user, profile, activeMemberships, supabase } = await getViewer();
  const active = await getActiveCommunity();
  const [{ count: unread }, { data: scopes }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.rpc("my_admin_scopes"),
  ]);
  const nav: NavItem[] = [
    { href: "/app/dashboard", label: "Dashboard", icon: "home" },
    { href: "/app/my-classes", label: "My classes", icon: "layers" },
    { href: "/app/alumni", label: "Alumni", icon: "users" },
    { href: "/app/businesses", label: "Businesses", icon: "briefcase" },
    { href: "/app/locations", label: "Locations", icon: "pin" },
    { href: "/app/events", label: "Events", icon: "calendar" },
    { href: "/app/gallery", label: "Gallery", icon: "image" },
    { href: "/app/announcements", label: "Announcements", icon: "megaphone" },
    { href: "/app/notifications", label: "Notifications", icon: "bell", badge: unread ?? 0 },
    { href: "/app/profile", label: "My profile", icon: "user" },
    { href: "/app/settings", label: "Settings", icon: "settings" },
    ...(((scopes as unknown[]) ?? []).length ? [{ href: "/admin/dashboard", label: "Admin center", icon: "shield" as const }] : []),
  ];
  return (
    <Shell title="Member portal" nav={nav} user={{ name: profile?.full_name ?? "", email: user.email }}
      top={<CommunitySwitcher communities={activeMemberships.map((m) => ({ id: m.community_id, name: m.class_communities.name }))}
        activeId={active?.id} action={switchCommunity} />}>
      {children}
    </Shell>
  );
}
