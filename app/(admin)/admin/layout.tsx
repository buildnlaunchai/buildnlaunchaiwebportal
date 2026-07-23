import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { requireAdmin } from "@/lib/access";
import { getUsersForAdmin } from "@/lib/admin-users";
import { getMyNotifications } from "@/lib/notifications";
import { getLogoUrl } from "@/lib/settings";
import { getPublicTools } from "@/lib/tools";

/* CLAUDE.md §8 — admin. Grouped for the sidebar (§10). */
const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "overview", section: "Manage" },
  { href: "/admin/users", label: "Users", icon: "users", section: "Manage" },
  { href: "/admin/tools", label: "Tools", icon: "tools", section: "Catalog" },
  { href: "/admin/announcements", label: "Announcements", icon: "announcements", section: "Catalog" },
  { href: "/admin/codes", label: "Codes", icon: "codes", section: "Catalog" },
  { href: "/admin/requests", label: "Requests", icon: "requests", section: "Signals" },
  { href: "/admin/audit", label: "Audit", icon: "audit", section: "Signals" },
  { href: "/admin/settings", label: "Settings", icon: "settings", section: "System" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // A signed-in member who types /admin gets a 404, not a 403 — there is no
  // reason to confirm the route exists. Middleware did NOT check this: it only
  // asks "signed in at all", so this is the first real gate, and every admin
  // Server Action will be the second.
  const user = await requireAdmin();

  // Command-palette sources: the admin can jump to any tool or any user by name.
  // includeHidden: the palette is auth-gated (never crawled), so admins keep
  // reach to tools hidden from public surfaces.
  const [tools, users, notifications, logoUrl] = await Promise.all([
    getPublicTools({ includeHidden: true }),
    getUsersForAdmin(),
    getMyNotifications(),
    getLogoUrl(),
  ]);

  return (
    <AppShell
      title="Overview"
      nav={NAV}
      user={{
        id: user.id,
        email: user.email,
        fullName: user.profile.full_name,
        avatarUrl: user.profile.avatar_url,
      }}
      isAdmin
      plan={{ label: "Admin", sublabel: "Full access" }}
      logoUrl={logoUrl}
      searchHint="Search users, tools…"
      paletteTools={tools.map((t) => ({ slug: t.slug, name: t.name }))}
      paletteUsers={users.map((u) => ({
        id: u.profile.id,
        name: u.profile.full_name ?? u.profile.email,
        email: u.profile.email,
      }))}
      notifications={notifications}
    >
      {children}
    </AppShell>
  );
}
