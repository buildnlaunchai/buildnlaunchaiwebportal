import Image from "next/image";
import Link from "next/link";

import { SparkMark } from "@/components/brand/spark-mark";
import { Button } from "@/components/ui/button";
import { getLogoUrl } from "@/lib/settings";

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const logoUrl = await getLogoUrl();
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Grain film (DESIGN.md §3) — same screen-locked texture the app carries,
          so the marketing ground reads as graded, not plastic. */}
      <div className="grain" aria-hidden />

      <header className="sticky top-0 z-30 border-b border-line/60 bg-canvas/70 backdrop-blur-md">
        {/* §4: page gutter 20 / 32. */}
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center gap-6 px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span
              aria-hidden
              className="flex size-6 items-center justify-center text-accent [filter:drop-shadow(0_0_8px_rgba(200,242,79,0.5))]"
            >
              {logoUrl ? (
                <Image src={logoUrl} alt="" width={24} height={24} className="size-6 object-contain" />
              ) : (
                <SparkMark className="size-[22px]" />
              )}
            </span>
            <span className="font-display text-[15px] font-light tracking-[-0.01em]">
              Build &amp; <span className="font-semibold text-accent">Launch</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-5 sm:flex">
            <Link
              href="/tools"
              className="text-small text-text-muted transition-colors duration-micro ease-default hover:text-text"
            >
              Tools
            </Link>
            <Link
              href="/changelog"
              className="text-small text-text-muted transition-colors duration-micro ease-default hover:text-text"
            >
              Changelog
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link href="/apply">
              {/* §2: one accent per screen. On the landing page, this is it. */}
              <Button variant="primary" size="sm">
                Apply for access
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-2 px-5 py-8 text-small text-text-faint sm:flex-row sm:items-center lg:px-8">
          <span>Build &amp; Launch AI</span>
          <span className="sm:ml-auto">
            A private lab of AI automation tools.
          </span>
        </div>
      </footer>
    </div>
  );
}
