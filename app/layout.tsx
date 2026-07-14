import type { Metadata } from "next";
import { Sora, Instrument_Sans, JetBrains_Mono } from "next/font/google";

import "./globals.css";

/* DESIGN.md §3 — three faces, three jobs. Self-hosted by next/font at build
   time, so there is no FOUT and no layout shift. */
const sora = Sora({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-sora",
  display: "swap",
});

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Build & Launch AI",
  description:
    "A private lab of AI automation tools. Apply, get approved, run the tools.",
};

/* Runs before first paint, so the correct theme is on <html> before anything
   renders. DESIGN.md §14: a theme flash is a bug, not a tradeoff. Inline and
   synchronous by necessity — a React effect is far too late. */
const THEME_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var theme = (stored === 'light' || stored === 'dark')
      ? stored
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: the script above sets data-theme before React
    // hydrates, so server and client markup legitimately differ on this one
    // attribute. This is the documented use for it, not a way to silence a bug.
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body
        className={`${sora.variable} ${instrumentSans.variable} ${jetbrainsMono.variable} min-h-full antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
