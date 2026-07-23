import { Suspense } from "react";

import { MembershipActivationWatcher } from "@/components/billing/membership-activation-watcher";
import { AnnouncementBanner } from "@/components/shell/announcement-banner";
import { AppShell, type NavItem } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/access";
import { getLatestPublishedAnnouncement } from "@/lib/announcements";
import { getMyMembership, isMembershipActive } from "@/lib/member";
import { getMyNotifications } from "@/lib/notifications";
import { getLogoUrl } from "@/lib/settings";
import { getPublicTools } from "@/lib/tools";

/* CLAUDE.md §8 — the member app. Grouped for the sidebar (§10). */
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Apps", icon: "apps", section: "Workspace" },
  { href: "/dashboard/runs", label: "Runs", icon: "runs", section: "Workspace" },
  { href: "/dashboard/keys", label: "Keys", icon: "keys", section: "Account" },
  { href: "/dashboard/requests", label: "Requests", icon: "requests", section: "Account" },
  { href: "/dashboard/settings", label: "Settings", icon: "settings", section: "Account" },
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
  const [tools, notifications, announcement, membership, logoUrl] = await Promise.all([
    // includeHidden: this feeds the ⌘K palette (auth-gated, never crawled), so a
    // member keeps reach to tools hidden from public surfaces.
    getPublicTools({ includeHidden: true }),
    getMyNotifications(),
    getLatestPublishedAnnouncement(),
    getMyMembership(),
    getLogoUrl(),
  ]);

  // Derive the badge from actual access, not membership status alone: an admin
  // has full access with no membership row, so they must never read "Applicant".
  const isAdmin = user.profile.role === "admin";
  const plan = isAdmin
    ? { label: "Admin", sublabel: "Full access" }
    : isMembershipActive(membership)
      ? { label: "Member", sublabel: "Active · all tools" }
      : { label: "Applicant", sublabel: "Browse the free tools" };

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
      plan={plan}
      logoUrl={logoUrl}
      searchHint="Search tools, runs, keys…"
      paletteTools={tools.map((t) => ({ slug: t.slug, name: t.name }))}
      notifications={notifications}
    >
      <Suspense fallback={null}>
        <MembershipActivationWatcher />
      </Suspense>
      <AnnouncementBanner announcement={announcement} />
      {children}
    </AppShell>
  );
}
