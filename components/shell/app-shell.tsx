"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";

import { SparkBackground } from "@/components/brand/spark-background";
import { SparkMark } from "@/components/brand/spark-mark";
import {
  CommandPalette,
  type PaletteTool,
  type PaletteUser,
} from "@/components/shell/command-palette";
import { ICONS, type IconName } from "@/components/shell/icons";
import { NotificationBell } from "@/components/shell/notification-bell";
import { UserMenu } from "@/components/shell/user-menu";
import type { Database } from "@/lib/database.types";
import { cn } from "@/lib/utils";

type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export type NavItem = {
  href: string;
  label: string;
  /** An icon NAME, not a component — see components/shell/icons.ts. */
  icon: IconName;
  /** Optional group heading (DESIGN.md §10). Consecutive items with the same
      section render under one eyebrow; omit it and items render ungrouped. */
  section?: string;
};

export type ShellUser = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
};

/** The membership footer in the sidebar (DESIGN.md §10). */
export type ShellPlan = { label: string; sublabel: string };

type AppShellProps = {
  title: string;
  nav: NavItem[];
  user: ShellUser;
  /** DESIGN.md §10: "You will eventually forget which account you're in." */
  isAdmin?: boolean;
  /** The sidebar footer — plan/role and status. Omitted → no footer. */
  plan?: ShellPlan;
  /** Admin-uploaded logo URL; falls back to the built-in daisy mark when null. */
  logoUrl?: string | null;
  /** Placeholder for the top-bar search. */
  searchHint?: string;
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

/** Group consecutive nav items by their `section`. No section → one empty group. */
function groupNav(nav: NavItem[]): { section: string; items: NavItem[] }[] {
  const groups: { section: string; items: NavItem[] }[] = [];
  for (const item of nav) {
    const key = item.section ?? "";
    const last = groups[groups.length - 1];
    if (last && last.section === key) last.items.push(item);
    else groups.push({ section: key, items: [item] });
  }
  return groups;
}

export function AppShell({
  title,
  nav,
  user,
  isAdmin = false,
  plan,
  logoUrl,
  searchHint = "Search…",
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

  const groups = groupNav(nav);

  return (
    <div className="min-h-dvh">
      {/* The "Spark" ambient background — gradient + orbit arcs behind the app.
          The opaque sidebar sits over its left edge; the working area shows it. */}
      <SparkBackground />
      {/* Grain film (DESIGN.md §3) — a fixed, screen-locked texture over the
          whole app so the flat green fills read as graded, not plastic.
          pointer-events:none, so it never intercepts a click. */}
      <div className="grain" aria-hidden />

      {/* ---- Sidebar (DESIGN.md §10) — 260px, on --canvas, hairline right edge.
          Collapses to a 64px icon rail at md; below md the bottom bar takes over.
          Depth is carried by lit elements on the navy, not a different fill:
          a glow behind the logo, lifted icon tiles, a glass footer. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col overflow-hidden border-r border-line bg-canvas md:flex lg:w-[260px]">
        <div className="app-glow-side" aria-hidden />

        {/* logo */}
        <div className="relative z-10 flex h-16 items-center gap-[11px] px-3 md:justify-center lg:justify-start lg:px-5">
          <span
            aria-hidden
            className="flex size-[30px] shrink-0 items-center justify-center text-accent [filter:drop-shadow(0_0_9px_rgba(200,242,79,0.5))]"
          >
            {logoUrl ? (
              <Image src={logoUrl} alt="" width={30} height={30} className="size-[30px] object-contain" />
            ) : (
              <SparkMark className="size-[26px]" />
            )}
          </span>
        </div>

        {/* nav */}
        <nav className="relative z-10 flex flex-1 flex-col gap-4 overflow-y-auto px-3 pt-2 lg:px-[14px]">
          {groups.map((group, gi) => (
            <div key={group.section || gi} className="flex flex-col gap-0.5">
              {group.section && (
                <p className="mb-1.5 hidden pl-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-text-faint lg:block">
                  {group.section}
                </p>
              )}
              {group.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = ICONS[item.icon];
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    aria-label={item.label}
                    title={item.label}
                    className={cn(
                      "group relative flex h-[42px] items-center gap-[11px] rounded-[10px] text-body transition-colors duration-micro ease-default",
                      "justify-center px-0 lg:justify-start lg:px-[10px]",
                      active
                        ? "text-text lg:bg-elevated lg:shadow-[0_8px_22px_-14px_rgba(80,160,60,0.6)]"
                        : "text-text-muted hover:text-text lg:hover:bg-surface/60",
                    )}
                  >
                    {/* the glowing accent rail (lg only; the lit tile marks active on the rail) */}
                    {active && (
                      <span
                        aria-hidden
                        className="absolute left-[-14px] top-1/2 hidden h-[22px] w-[3px] -translate-y-1/2 rounded-pill bg-accent shadow-[0_0_10px_0_rgba(200,242,79,0.9)] lg:block"
                      />
                    )}
                    <span
                      className={cn(
                        "flex size-[30px] shrink-0 items-center justify-center rounded-[8px] border transition-colors duration-micro ease-default",
                        active
                          ? "border-[color:rgba(200,242,79,0.4)] bg-accent-quiet text-illuminate"
                          : "border-line bg-surface text-text-faint group-hover:text-text-muted",
                      )}
                    >
                      <Icon aria-hidden className="size-4" strokeWidth={1.6} />
                    </span>
                    <span className="hidden lg:inline">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* membership footer — glass, lg only */}
        {plan && (
          <div className="relative z-10 mx-[14px] mb-[14px] hidden items-center gap-2.5 rounded-[11px] border border-line bg-[var(--glass)] p-[11px] [border-top-color:var(--glass-top)] lg:flex">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-pill bg-illuminate shadow-[0_0_8px_0_rgba(200,242,79,0.9)]"
            />
            <div className="min-w-0">
              <div className="truncate text-[12.5px] font-semibold text-text">
                {plan.label}
              </div>
              <div className="truncate text-[11px] text-text-faint">
                {plan.sublabel}
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* ---- Main column ------------------------------------------------- */}
      <div className="relative flex min-h-dvh flex-col md:pl-16 lg:pl-[260px]">
        <div className="app-glow" aria-hidden />

        {/* Top bar (§10): 64px, glass + blur, hairline bottom. */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-line bg-[var(--glass)] px-5 backdrop-blur-[14px] lg:px-[22px]">
          <h1 className="shrink-0 font-display text-[20px] font-semibold tracking-[-0.01em]">
            {pageTitle}
          </h1>

          {/* search — a real field that opens the palette (⌘K). Collapses to an
              icon-only tile below sm. */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search"
            className="flex h-9 w-9 shrink-0 items-center justify-center gap-2.5 rounded-[10px] border border-line bg-surface/70 text-text-faint transition-colors duration-micro ease-default hover:border-line-strong sm:w-full sm:max-w-[340px] sm:flex-1 sm:justify-start sm:px-3"
          >
            <Search aria-hidden className="size-4 shrink-0" strokeWidth={1.6} />
            <span className="hidden truncate text-small sm:inline">{searchHint}</span>
            <kbd className="ml-auto hidden rounded-[5px] border border-line px-1.5 py-0.5 font-mono text-[10.5px] text-text-faint sm:inline">
              ⌘K
            </kbd>
          </button>

          <div className="ml-auto flex items-center gap-2">
            {isAdmin && (
              <span className="hidden rounded-pill bg-warn-quiet px-2 py-1 font-mono text-mono-chip text-warn sm:inline">
                ADMIN
              </span>
            )}
            <NotificationBell initial={notifications} userId={user.id} />
            <UserMenu
              email={user.email}
              fullName={user.fullName}
              avatarUrl={user.avatarUrl}
            />
          </div>
        </header>

        {/* §4: app pages max out at 1200px. Bottom padding clears the mobile
            nav bar, which is fixed.

            No z-index here, deliberately: a z would make <main> a stacking
            context, and then a route-level takeover (the embed focus mode's
            fixed overlay) could never rise above the sidebar (z-30) or this
            header (z-20) no matter its own z. DOM order alone keeps main's
            content above the .app-glow sibling (both paint at level 0, later
            wins), so the z bought nothing. */}
        <main className="relative flex-1 px-5 pb-24 pt-8 md:pb-10 lg:px-8">
          <div className="mx-auto w-full max-w-[1200px]">{children}</div>
        </main>
      </div>

      {/* ---- Mobile nav, below 768px (§11) — glass, matching the top bar. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-[var(--glass)] backdrop-blur-[14px] md:hidden">
        {nav.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex min-h-14 flex-1 flex-col items-center justify-center gap-1 transition-colors duration-micro ease-default",
                active ? "text-accent" : "text-text-muted",
              )}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 top-0 mx-auto h-[3px] w-8 rounded-pill bg-accent shadow-[0_0_10px_0_rgba(200,242,79,0.9)]"
                />
              )}
              <Icon aria-hidden className="size-5" strokeWidth={1.6} />
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
