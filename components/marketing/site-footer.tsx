import Link from "next/link";

// Build-time year for the copyright (module scope, so it's not a render-time
// impurity). Refreshes whenever the site is rebuilt.
const YEAR = new Date().getFullYear();

const LINKS = [
  { href: "/tools", label: "Tools" },
  { href: "/changelog", label: "Changelog" },
  // Neutral label (not "Subscribe") so an active member browsing marketing pages
  // never sees a subscribe CTA in the footer (Bug 2). /pricing itself is member-aware.
  { href: "/pricing", label: "Pricing" },
  { href: "/login", label: "Log in" },
];

// Legal / policy links — required by Creem (merchant of record) for live approval.
const LEGAL_LINKS = [
  { href: "/terms", label: "Terms" },
  // Creem's approval asked for a VISIBLE acceptable use policy, and visible is
  // the operative word: a page nobody links to satisfies nothing. It sits with
  // the other policies, on every marketing page.
  { href: "/acceptable-use", label: "Acceptable use" },
  { href: "/privacy", label: "Privacy" },
  { href: "/refund", label: "Refunds" },
  { href: "/contact", label: "Contact" },
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
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-mono-chip text-text-faint">
          {LEGAL_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="transition-colors duration-micro ease-default hover:text-text-muted"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="text-mono-chip uppercase tracking-[0.12em] text-text-faint">
          © {YEAR} Build &amp; Launch AI. All rights reserved.
        </p>
        {/* Third-party AI transparency. Required by payment providers reviewing
            "AI wrapper" businesses, and true regardless: some tools call models
            we neither own nor represent. The per-tool half of this — which model
            powers which tool — is <AiAttribution>, under each tool's title.
            Deliberately in the footer so it appears on every marketing page. */}
        <p className="prose-measure mx-auto mt-4 text-center text-small text-text-faint">
          Build &amp; Launch AI is an independent product. Some tools use
          third-party AI models through APIs you connect with your own keys. We
          are not affiliated with, endorsed by, or sponsored by any AI model
          provider, and all product names and trademarks belong to their
          respective owners.
        </p>
      </div>
    </footer>
  );
}
