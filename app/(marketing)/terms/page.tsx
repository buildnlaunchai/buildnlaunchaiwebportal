import type { Metadata } from "next";
import Link from "next/link";

import { LegalShell, Section } from "@/components/legal/legal";

export const metadata: Metadata = {
  title: "Terms of Service — Build & Launch AI",
  description: "The terms that govern your use of Build & Launch AI.",
};

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service" updated="July 24, 2026">
      <Section title="1. Who we are">
        <p>
          Build &amp; Launch AI is operated by Caparison Soft (&ldquo;we,&rdquo;
          &ldquo;us,&rdquo; &ldquo;our&rdquo;), a business registered at 55 CDA
          R/A, Access Road, Agrabad, Double Mooring, Chattogram, Bangladesh.
        </p>
      </Section>

      <Section title="2. What Build & Launch AI is">
        <p>
          Build &amp; Launch AI is a members-only platform providing access to a
          catalog of AI-powered tools. Members bring their own API keys
          (&ldquo;BYOK&rdquo;) for the AI services these tools use &mdash; we do
          not charge you for AI compute, and your keys are used only to run the
          tools you choose to run.
        </p>
      </Section>

      <Section title="3. Membership and billing">
        <ul>
          <li>
            Membership costs $10.00 USD per month, billed automatically each month
            from your signup date until you cancel.
          </li>
          <li>
            Payments are processed by Paddle.com, our merchant of record. Paddle
            handles billing, tax, and payment security; we never see or store your
            card details.
          </li>
          <li>
            If we change the price of membership, we&rsquo;ll notify you by email
            at least 30 days before the change takes effect. Continuing your
            membership after that date means you accept the new price.
          </li>
          <li>
            If a payment fails, Paddle will automatically retry according to its
            standard retry schedule. If payment continues to fail after
            Paddle&rsquo;s retries are exhausted, we may suspend your access until
            payment succeeds.
          </li>
          <li>We do not currently offer a free trial.</li>
        </ul>
      </Section>

      <Section title="4. Cancellation and refunds">
        <p>
          You can cancel your membership at any time from your account settings.
          Cancelling stops future billing &mdash; you keep access until the end of
          your current paid period. See our{" "}
          <Link href="/refund">Refund Policy</Link> for full details.{" "}
          <strong>
            We do not offer refunds for partial months or unused access.
          </strong>
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>
          You agree not to use Build &amp; Launch AI to: break any applicable law;
          attack, scrape, or abuse other services using our tools; resell, share,
          or provide unauthorized access to your account; or attempt to circumvent
          membership access controls or usage limits.
        </p>
      </Section>

      <Section title="6. Ownership">
        <ul>
          <li>
            We own the Build &amp; Launch AI platform, its design, and its code.
          </li>
          <li>
            You own the inputs you provide and the outputs you generate using our
            tools, subject to the terms of the underlying AI providers whose keys
            you connect.
          </li>
          <li>
            We do not claim ownership over anything you create using the tools.
          </li>
        </ul>
      </Section>

      <Section title="7. Termination">
        <p>
          We may suspend or terminate your account if you violate these terms,
          don&rsquo;t pay, or misuse the platform. If your account is terminated,
          your data (run history, stored keys) will be retained for 30 days and
          then deleted, matching our standard retention period, unless you request
          earlier deletion.
        </p>
      </Section>

      <Section title="8. Warranties and limitation of liability">
        <p>
          Build &amp; Launch AI is provided as-is, without warranties of any kind,
          express or implied. To the maximum extent permitted by law, Caparison
          Soft is not liable for indirect, incidental, or consequential damages
          arising from use of the platform.
        </p>
      </Section>

      <Section title="9. Governing law">
        <p>
          These terms are governed by the laws of Bangladesh. Any disputes arising
          from these terms will be resolved in the courts of Chattogram,
          Bangladesh.
        </p>
      </Section>

      <Section title="10. Changes to these terms">
        <p>
          We may update these terms from time to time. We&rsquo;ll notify you by
          email and/or a notice on the site if changes are material. Continued use
          after changes means you accept the updated terms.
        </p>
      </Section>

      <Section title="11. Contact">
        <p>
          Questions about these terms?{" "}
          <a href="mailto:support@buildnlaunchai.com">
            support@buildnlaunchai.com
          </a>{" "}
          or see our <Link href="/contact">Contact page</Link>.
        </p>
      </Section>
    </LegalShell>
  );
}
