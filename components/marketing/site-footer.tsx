import Link from "next/link";

// Build-time year for the copyright (module scope, so it's not a render-time
// impurity). Refreshes whenever the site is rebuilt.
const YEAR = new Date().getFullYear();

const LINKS = [
  { href: "/tools", label: "Tools" },
  { href: "/changelog", label: "Changelog" },
  { href: "/dashboard", label: "Subscribe" },
  { href: "/login", label: "Log in" },
];

/**
 * The marketing site footer — a giant ghosted wordmark filling the ground, with
 * a small link row and the copyright above it (the AssetBender treatment, in the
 * Spark palette).
 */
export function SiteFooter() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-line">
      {/* giant ghosted wordmark */}
      <span
        aria-hidden
        className="font-display pointer-events-none absolute inset-x-0 bottom-[-0.06em] select-none text-center text-[24vw] font-bold leading-[0.78] tracking-[-0.03em]"
        style={{ color: "rgba(210,235,160,0.05)" }}
      >
        LAUNCH
      </span>

      <div className="relative mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-5 py-16 lg:px-8">
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-small text-text-muted">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors duration-micro ease-default hover:text-text"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-mono-chip uppercase tracking-[0.12em] text-text-faint">
          © {YEAR} Build &amp; Launch AI. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
