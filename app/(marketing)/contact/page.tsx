import { Mail } from "lucide-react";
import type { Metadata } from "next";

import { LegalShell, Section } from "@/components/legal/legal";

export const metadata: Metadata = {
  title: "Contact — Build & Launch AI",
  description: "How to get in touch with Build & Launch AI.",
};

export default function ContactPage() {
  return (
    <LegalShell
      title="Contact"
      updated="July 24, 2026"
      intro={<>Need help or have a question about Build &amp; Launch AI?</>}
    >
      <Section title="Email us">
        <p className="flex items-center gap-2">
          <Mail aria-hidden className="size-4 shrink-0 text-accent" strokeWidth={1.8} />
          <a href="mailto:support@buildnlaunchai.com">
            support@buildnlaunchai.com
          </a>
        </p>
        <p>We aim to respond within 1&ndash;2 business days.</p>
      </Section>

      <Section title="Billing & payments">
        <p>
          For billing or payment issues specifically, you can also reach
          Paddle.com support directly, as they process all payments on our behalf
          as merchant of record.
        </p>
      </Section>

      <Section title="Business address">
        <p>
          Caparison Soft
          <br />
          55 CDA R/A, Access Road, Agrabad, Double Mooring, Chattogram, Bangladesh
        </p>
      </Section>
    </LegalShell>
  );
}
