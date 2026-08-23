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
          Creem processes all payments on our behalf as merchant of record. Email
          us first for anything billing-related &mdash; we can usually sort it out
          faster. If we can&rsquo;t, you can escalate to Creem at{" "}
          <a href="mailto:support@creem.io">support@creem.io</a>.
        </p>
      </Section>

      <Section title="Business address">
        <p>
          Mohammad Zahidul Alam
          <br />
          1884/A, Mistripara, Double Mooring, Bandar Main Post Office - 4100,
          Chattogram, Bangladesh
        </p>
      </Section>
    </LegalShell>
  );
}
