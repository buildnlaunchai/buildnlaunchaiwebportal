"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import {
  CommandPalette,
  type PaletteTool,
  type PaletteUser,
} from "@/components/shell/command-palette";
import { ICONS, type IconName } from "@/components/shell/icons";
import { NotificationBell } from "@/components/shell/notification-bell";
import { UserMenu } from "@/components/shell/user-menu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import type { Database } from "@/lib/database.types";
import { cn } from "@/lib/utils";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export type NavItem = {
  href: string;
  label: string;
  /** An icon NAME, not a component — see components/shell/icons.ts. */
  icon: IconName;
};

export type ShellUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
};

type AppShellProps = {
  title: string;
  nav: NavItem[];
  user: ShellUser;
  /** DESIGN.md §10: "You will eventually forget which account you're in." */
  isAdmin?: boolean;
  /** Command palette sources (DESIGN.md §9). Users are admin-only. */
  paletteTools?: PaletteTool[];
  paletteUsers?: PaletteUser[];
  notifications?: Notification[];
  children: React.ReactNode;
};

function isActive(pathname: string, href: string) {
  // Exact match, or a true path segment below it. Stops /admin/tools from
  // lighting up a hypothetical /admin/toolsmith, and stops /admin — the
  // shortest href — from matching every admin route at once.
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  title,
  nav,
  user,
  isAdmin = false,
  paletteTools = [],
  paletteUsers = [],
  notifications = [],
  children,
}: AppShellProps) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K toggles the palette from anywhere in the authed app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The top-bar title tracks the current section: the deepest nav item whose
  // href matches the path wins, so /admin/applications reads "Applications", not
  // the layout's default. Pages with no nav entry fall back to `title`.
  const pageTitle =
    nav
      .filter((item) => isActive(pathname, item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]?.label ?? title;

  return (
    <div className="min-h-dvh">
      {/* ---- Sidebar: 240px, --canvas, 1px --line right edge (§10) --------
          Collapses to icons at 1024px. Below 768px it is replaced by the bottom
          bar at the end of this file — §11: nothing scrolls horizontally. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col border-r border-line bg-canvas md:flex lg:w-60">
        <div className="flex h-14 items-center gap-2 border-b border-line px-3 lg:px-5">
          <span aria-hidden className="size-6 shrink-0 rounded-sm bg-accent" />
          <span className="hidden font-display text-[15px] font-semibold lg:inline">
            Build &amp; Launch
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                // Collapsed to icons at md: the label is gone, so the link needs
                // an accessible name from somewhere. §13.
                aria-label={item.label}
                title={item.label}
                className={cn(
                  "relative flex h-9 items-center gap-2 rounded-sm px-3 text-body",
                  "transition-colors duration-micro ease-default",
                  active
                    ? "bg-accent-quiet text-accent"
                    : "text-text-muted hover:bg-elevated hover:text-text",
                )}
              >
                {/* §10: a 2px --accent bar on the left edge when active. */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-pill bg-accent"
                  />
                )}
                <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* ---- Main column ------------------------------------------------- */}
      <div className="flex min-h-dvh flex-col md:pl-16 lg:pl-60">
        {/* Top bar: 56px (§10) */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-line bg-canvas px-5 lg:px-8">
          <h1 className="text-h1 truncate">{pageTitle}</h1>

          <div className="ml-auto flex items-center gap-2">
            {/* ⌘K trigger — a real button so it works on mobile too (§11). */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Search"
              className="inline-flex h-8 items-center gap-2 rounded-sm border border-line bg-surface px-2.5 text-text-muted transition-colors duration-micro ease-default hover:border-line-strong hover:text-text"
            >
              <Search aria-hidden className="size-4" strokeWidth={1.5} />
              <span className="text-mono-chip hidden text-text-faint sm:inline">
                ⌘K
              </span>
            </button>
            {isAdmin && (
              <span className="text-mono-chip rounded-pill bg-warn-quiet px-2 py-1 text-warn">
                ADMIN
              </span>
            )}
            <NotificationBell initial={notifications} userId={user.id} />
            <ThemeToggle />
            <UserMenu
              email={user.email}
              fullName={user.fullName}
              avatarUrl={user.avatarUrl}
            />
          </div>
        </header>

        {/* §4: app pages max out at 1200px. Bottom padding clears the mobile
            nav bar, which is fixed. */}
        <main className="flex-1 px-5 pb-24 pt-8 md:pb-10 lg:px-8">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>

      {/* ---- Mobile nav, below 768px (§11) --------------------------------
          Tap targets are 56px tall, comfortably over the 44px floor, and it
          never scrolls sideways. The full bottom-sheet treatment lands with the
          command palette in Phase 4; this is the complete working version until
          then, not a stub. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-canvas md:hidden">
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-1",
                "transition-colors duration-micro ease-default",
                active ? "text-accent" : "text-text-muted",
              )}
            >
              <Icon aria-hidden className="size-5" strokeWidth={1.5} />
              <span className="text-[11px] leading-none">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        isAdmin={isAdmin}
        tools={paletteTools}
        users={paletteUsers}
      />
    </div>
  );
}
