import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { requireAdmin } from "@/lib/access";
import { getUsersForAdmin } from "@/lib/admin-users";
import { getMyNotifications } from "@/lib/notifications";
import { getPublicTools } from "@/lib/tools";

/* CLAUDE.md §8 — admin. */
const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "overview" },
  { href: "/admin/applications", label: "Applications", icon: "applications" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/tools", label: "Tools", icon: "tools" },
  { href: "/admin/announcements", label: "Announcements", icon: "announcements" },
  { href: "/admin/codes", label: "Codes", icon: "codes" },
  { href: "/admin/audit", label: "Audit", icon: "audit" },
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
  const [tools, users, notifications] = await Promise.all([
    getPublicTools(),
    getUsersForAdmin(),
    getMyNotifications(),
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
