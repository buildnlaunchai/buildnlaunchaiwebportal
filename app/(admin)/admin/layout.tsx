import { AppShell, type NavItem } from "@/components/shell/app-shell";

/* CLAUDE.md §8 — admin. */
const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "overview" },
  { href: "/admin/applications", label: "Applications", icon: "applications" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/tools", label: "Tools", icon: "tools" },
  { href: "/admin/audit", label: "Audit", icon: "audit" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // NOT GUARDED YET. Phase 1 adds the check in all three places CLAUDE.md §13
  // requires: middleware, the Server Component, and every Server Action.
  // Middleware alone is not authorization, and a layout alone is less than that.
  return (
    <AppShell title="Overview" nav={NAV} isAdmin>
      {children}
    </AppShell>
  );
}
