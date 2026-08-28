import type { Metadata } from "next";
import Link from "next/link";

import { LegalShell, Section } from "@/components/legal/legal";
import { getPublishedExpiryMonths } from "@/lib/credits";
import { CREDIT_TERMS, creditExpirySentence } from "@/lib/credit-terms";

/**
 * ─── ISR AS WELL AS THE FALLBACK, NOT INSTEAD OF IT ─────────────────────────
 *
 * They do different jobs and the black-hole test showed both are needed. With
 * the database gone, /tools and /pricing served in 82ms and 299ms because they
 * are cached; /terms served the RIGHT expiry — via the fallback — after 61
 * seconds, because it was dynamic and had to wait for a request that was never
 * coming.
 *
 * So: the fallback guarantees the number is correct, and the cache guarantees
 * the page is fast. Neither substitutes for the other. This is only possible
 * because getPublishedExpiryMonths reads through the cookieless public client —
 * touching cookies would make the route dynamic again and silently undo it.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Terms of Service — Build & Launch AI",
  description: "The terms that govern your use of Build & Launch AI.",
};

export default async function TermsPage() {
  // Deadlined, with the published constant as the fallback — see
  // getPublishedExpiryMonths. These two are the only marketing pages that read
  // the database, so they were the only two that could hang when it stopped
  // answering; every other one is static or ISR. The fallback is safe to lean on
  // because verify:legal fails if the constant and the setting ever disagree.
  const months = await getPublishedExpiryMonths();

  return (
    <LegalShell title="Terms of Service" updated="August 28, 2026">
      <Section title="1. Who we are">
        <p>
          Build &amp; Launch AI is operated by Mohammad Zahidul Alam
          (&ldquo;we,&rdquo; &ldquo;us,&rdquo; &ldquo;our&rdquo;), a sole
          proprietor based at 1884/A, Mistripara, Double Mooring, Bandar Main
          Post Office - 4100, Chattogram, Bangladesh.
        </p>
      </Section>

      {/* Rewritten. This section used to say "we do not charge you for AI
          compute", which was true of every tool that existed when it was
          written and stopped being true the day credit mode shipped. A terms
          page that describes the product as it was is worse than one that
          describes it vaguely. */}
      <Section title="2. What Build & Launch AI is">
        <p>
          Build &amp; Launch AI is a members-only platform providing access to a
          catalog of AI-powered tools. There are two ways a tool can run:
        </p>
        <ul>
          <li>
            <strong>On your own API keys (&ldquo;BYOK&rdquo;).</strong> You
            connect keys for the AI services a tool uses, your provider bills
            you directly, and we charge you nothing for the compute. Your keys
            are used only to run the tools you choose to run.
          </li>
          <li>
            <strong>On credits.</strong> The call runs on our provider accounts
            and is charged against a credit balance you have bought. See section
            4.
          </li>
        </ul>
        <p>
          Which one applies is shown in the app before you run anything, and on
          your <Link href="/dashboard/credits">credits page</Link>.
        </p>
      </Section>

      {/* WHEN CREDIT PACKAGES GO ON SALE, THIS SECTION OWES AN EDIT.
          It lists membership as the only thing with a price, which is true only
          while credits cannot be bought. The day checkout opens, the packages
          and their prices belong here — a price list that is silent about a
          thing you can buy is the kind of omission a payment provider reads as
          a misrepresentation rather than an oversight. Written here because
          this is the file that will be wrong, not in a plan somewhere. */}
      <Section title="3. Membership and billing">
        <ul>
          <li>
            Membership costs $10.00 USD per month, billed automatically each month
            from your signup date until you cancel.
          </li>
          <li>
            Payments are processed by Creem, our merchant of record. Creem
            handles billing, tax, and payment security; we never see or store your
            card details. As merchant of record, Creem is the seller on the
            transaction, so charges appear on your statement under their name
            rather than ours.
          </li>
          <li>
            If we change the price of membership, we&rsquo;ll notify you by email
            at least 30 days before the change takes effect. Continuing your
            membership after that date means you accept the new price.
          </li>
          <li>
            If a payment fails, Creem will automatically retry according to its
            standard retry schedule. If payment continues to fail after
            Creem&rsquo;s retries are exhausted, we may suspend your access until
            payment succeeds.
          </li>
          <li>We do not currently offer a free trial.</li>
        </ul>
      </Section>

      {/* The sentences here are imported, not written. They are the same ones
          the member reads on /dashboard/credits and in the refund policy — see
          lib/credit-terms.ts for why that is enforced rather than remembered. */}
      <Section title="4. Credits">
        <ul>
          <li>
            {CREDIT_TERMS.whatItIs} {CREDIT_TERMS.whenSpent}
          </li>
          <li>
            <strong>{CREDIT_TERMS.notMoney}</strong> Buying credits is buying the
            ability to run tools here, and nothing else. They carry no cash value,
            they are not a deposit or a stored-value instrument, and they cannot
            be sold, gifted, or moved between accounts.
          </li>
          <li>
            {CREDIT_TERMS.whatACallCosts} {CREDIT_TERMS.failedCalls} Every
            movement is recorded on your credits page with the rate and margin
            that applied at the time, and that record is kept.
          </li>
          <li>
            {creditExpirySentence(months)} {CREDIT_TERMS.spendOrder}{" "}
            {CREDIT_TERMS.unusedNotRefundable} See our{" "}
            <Link href="/refund">Refund Policy</Link>.
          </li>
          <li>
            Credits do not depend on your membership continuing. If it lapses,
            credits you have already bought stay spendable until they run out or
            expire.
          </li>
          <li>
            We may change the rate, the margin, or the caps for future purchases.
            Credits you already hold are unaffected: the rate and margin are
            frozen onto each entry when it is written, so a change cannot
            retroactively alter what you have already been charged or what your
            existing balance is worth.
          </li>
        </ul>
      </Section>

      <Section title="5. Cancellation and refunds">
        <p>
          You can cancel your membership at any time from your account settings.
          Cancelling stops future billing &mdash; you keep access until the end of
          your current paid period. See our{" "}
          <Link href="/refund">Refund Policy</Link> for full details.{" "}
          <strong>
            We do not offer refunds for partial months or unused access, and
            unused credits are not refundable.
          </strong>
        </p>
      </Section>

      <Section title="6. Acceptable use">
        <p>
          Our <Link href="/acceptable-use">Acceptable Use Policy</Link> is part of
          these terms and sets out in full what you may not create or do. In
          short: no sexual or adult content; no deepfakes, face swaps, or voice
          clones of real people; nothing harmful, hateful, deceptive, or illegal;
          and no reselling, sharing, or working around access controls and usage
          limits.
        </p>
        <p>
          When you run on credits, the call is made on our provider accounts, so
          those providers&rsquo; usage policies apply to you as well.
        </p>
      </Section>

      <Section title="7. Ownership">
        <ul>
          <li>
            We own the Build &amp; Launch AI platform, its design, and its code.
          </li>
          <li>
            You own the inputs you provide and the outputs you generate using our
            tools, subject to the terms of the underlying AI providers &mdash;
            whether those are providers whose keys you connected, or ours when you
            run on credits.
          </li>
          <li>
            We do not claim ownership over anything you create using the tools.
          </li>
        </ul>
      </Section>

      <Section title="8. Termination">
        <p>
          We may suspend or terminate your account if you violate these terms or
          the <Link href="/acceptable-use">Acceptable Use Policy</Link>,
          don&rsquo;t pay, or misuse the platform. If your account is terminated,
          your data (run history, stored keys) will be retained for 30 days and
          then deleted, matching our standard retention period, unless you request
          earlier deletion. {CREDIT_TERMS.forfeitOnTermination}
        </p>
        <p>
          Closing your own account is a different thing, and is not a penalty:{" "}
          {CREDIT_TERMS.closingYourAccount}
        </p>
      </Section>

      <Section title="9. Warranties and limitation of liability">
        <p>
          Build &amp; Launch AI is provided as-is, without warranties of any kind,
          express or implied. To the maximum extent permitted by law, Mohammad
          Zahidul Alam is not liable for indirect, incidental, or consequential
          damages arising from use of the platform.
        </p>
      </Section>

      <Section title="10. Governing law">
        <p>
          These terms are governed by the laws of Bangladesh. Any disputes arising
          from these terms will be resolved in the courts of Chattogram,
          Bangladesh.
        </p>
      </Section>

      <Section title="11. Changes to these terms">
        <p>
          We may update these terms from time to time. We&rsquo;ll notify you by
          email and/or a notice on the site if changes are material. Continued use
          after changes means you accept the updated terms.
        </p>
      </Section>

      <Section title="12. Contact">
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
