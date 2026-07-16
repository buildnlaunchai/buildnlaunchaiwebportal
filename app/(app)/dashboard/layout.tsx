import { AnnouncementBanner } from "@/components/shell/announcement-banner";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/access";
import { getLatestPublishedAnnouncement } from "@/lib/announcements";
import { getMyNotifications } from "@/lib/notifications";
import { getPublicTools } from "@/lib/tools";

/* CLAUDE.md §8 — the member app. */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Apps", icon: "apps" },
  { href: "/dashboard/runs", label: "Runs", icon: "runs" },
  { href: "/dashboard/keys", label: "Keys", icon: "keys" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check two of three (§13). Middleware already redirected an anonymous
  // visitor, but middleware is a redirect, not authorization — this runs on the
  // server, against a revalidated session, and does not care what middleware
  // decided. Mutations check again for themselves.
  const user = await requireUser("/dashboard");
  const [tools, notifications, announcement] = await Promise.all([
    getPublicTools(),
    getMyNotifications(),
    getLatestPublishedAnnouncement(),
  ]);

  return (
    <AppShell
      title="Apps"
      nav={NAV}
      user={{
        id: user.id,
        email: user.email,
        fullName: user.profile.full_name,
        avatarUrl: user.profile.avatar_url,
      }}
      isAdmin={user.profile.role === "admin"}
      paletteTools={tools.map((t) => ({ slug: t.slug, name: t.name }))}
      notifications={notifications}
    >
      <AnnouncementBanner announcement={announcement} />
      {children}
    </AppShell>
  );
}
