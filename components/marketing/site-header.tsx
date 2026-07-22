"use client";

import { Home, LayoutGrid, ScrollText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { SparkMark } from "@/components/brand/spark-mark";
import { SiteUserMenu } from "@/components/marketing/site-user-menu";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/tools", label: "Tools", icon: LayoutGrid },
  { href: "/changelog", label: "Changelog", icon: ScrollText },
] as const;

/**
 * The marketing site header — a floating capsule nav (logo · icon nav with an
 * active pill · auth), sticky with a gap from the top. Client so the active tab
 * can be highlighted from the path; honors the admin-uploaded logo.
 */
export function SiteHeader({ logoUrl }: { logoUrl: string | null }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 flex justify-center px-4 pb-2 pt-4">
      <div className="flex items-center gap-1 rounded-pill border border-line-strong bg-[var(--glass)] p-1.5 shadow-[0_14px_44px_-18px_rgba(0,0,0,0.7)] backdrop-blur-xl">
        {/* logo */}
        <Link
          href="/"
          aria-label="Build & Launch — home"
          className="flex h-10 shrink-0 items-center px-1.5 text-accent [filter:drop-shadow(0_0_8px_rgba(200,242,79,0.45))]"
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary-aspect admin logo
            <img src={logoUrl} alt="Build & Launch" className="h-7 w-auto max-w-[150px] object-contain" />
          ) : (
            <SparkMark className="size-6" />
          )}
        </Link>

        {/* nav */}
        <nav className="flex items-center gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-2 rounded-pill px-3.5 py-2 text-small font-medium transition-colors duration-micro ease-default sm:px-4",
                  active
                    ? "bg-elevated text-text shadow-[inset_0_1px_0_rgba(205,242,150,0.12)]"
                    : "text-text-muted hover:text-text",
                )}
              >
                <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.8} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <span aria-hidden className="mx-1 hidden h-6 w-px bg-line sm:block" />

        {/* auth — Log in / Apply, or the avatar menu once signed in */}
        <SiteUserMenu />
      </div>
    </header>
  );
}
