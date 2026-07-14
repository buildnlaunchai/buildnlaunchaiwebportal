import { AppShell, type NavItem } from "@/components/shell/app-shell";

/* CLAUDE.md §8 — the member app. The routes themselves land in later phases;
   the shell and its navigation are Phase 0. */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Apps", icon: "apps" },
  { href: "/dashboard/runs", label: "Runs", icon: "runs" },
  { href: "/dashboard/keys", label: "Keys", icon: "keys" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // NOT GUARDED YET. Middleware and the Server Component check land together in
  // Phase 1, with the profiles table. A guard that exists only in a layout is
  // not authorization (CLAUDE.md §13), so this is left honestly open rather than
  // made to look protected.
  return (
    <AppShell title="Apps" nav={NAV}>
      {children}
    </AppShell>
  );
}
