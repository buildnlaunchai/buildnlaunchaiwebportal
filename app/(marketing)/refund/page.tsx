import type { Metadata } from "next";

import { LegalShell, Section } from "@/components/legal/legal";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy — Build & Launch AI",
  description: "How to cancel your membership and our refund policy.",
};

export default function RefundPage() {
  return (
    <LegalShell title="Refund & Cancellation Policy" updated="July 24, 2026">
      <Section title="Cancellation">
        <p>
          You may cancel your Build &amp; Launch AI membership at any time from your
          account settings. Cancelling stops future billing immediately &mdash;{" "}
          <strong>
            your access continues until the end of your current paid billing
            period
          </strong>
          , and you will not be charged again after that.
        </p>
      </Section>

      <Section title="Refunds">
        <p>
          <strong>We do not offer refunds</strong> for partial months, unused
          access, or after a billing period has started. When you cancel, you
          simply won&rsquo;t be charged again &mdash; there&rsquo;s no need to
          request a refund for future periods since none will occur.
        </p>
        <p>
          If you believe you were charged in error (e.g., a duplicate charge or a
          billing system issue), contact us at{" "}
          <a href="mailto:support@buildnlaunchai.com">
            support@buildnlaunchai.com
          </a>{" "}
          and we&rsquo;ll review it case-by-case.
        </p>
      </Section>

      <Section title="How billing works with Creem">
        <p>
          Creem is our merchant of record and processes all payments, so charges
          appear on your statement under their name rather than ours.
        </p>
        <p>
          Refund requests go through us first &mdash; we run the service, and we
          can resolve almost everything faster directly. If you have a
          payment-specific issue we can&rsquo;t resolve (e.g., a card was charged
          incorrectly), you can escalate to Creem at{" "}
          <a href="mailto:support@creem.io">support@creem.io</a>.
        </p>
      </Section>
    </LegalShell>
  );
}
