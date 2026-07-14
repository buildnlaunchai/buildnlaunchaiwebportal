import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { requireAdmin } from "@/lib/access";

/* CLAUDE.md §8 — admin. */
const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "overview" },
  { href: "/admin/applications", label: "Applications", icon: "applications" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/tools", label: "Tools", icon: "tools" },
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

  return (
    <AppShell
      title="Overview"
      nav={NAV}
      user={{
        email: user.email,
        fullName: user.profile.full_name,
        avatarUrl: user.profile.avatar_url,
      }}
      isAdmin
    >
      {children}
    </AppShell>
  );
}
