import type { Metadata } from "next";
import Link from "next/link";

import { LegalShell, Section } from "@/components/legal/legal";
import { getCreditSettings } from "@/lib/credits";
import {
  CREDIT_TERMS,
  PUBLISHED_EXPIRY_MONTHS,
  creditExpirySentence,
} from "@/lib/credit-terms";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy — Build & Launch AI",
  description:
    "What you can buy from Build & Launch AI, how each one stops, and what is refundable.",
};

/**
 * ─── THE SHAPE OF THIS PAGE, AND WHY ────────────────────────────────────────
 *
 * One section per thing you can buy, each answering the same three questions:
 * what it is, how it stops, and what is refundable. It is organised this way
 * because two more things are coming — lifetime access and per-tool
 * subscriptions — and a policy organised by TOPIC ("Cancellation", "Refunds")
 * has to be rewritten to add a product, while one organised by PRODUCT only has
 * to be added to.
 *
 * When those land, they are two more entries in `purchases` below, with the same
 * three fields:
 *
 *   { id: "lifetime",  title: "Lifetime access",       what, stops, refund }
 *   { id: "tool",      title: "Per-tool subscriptions", what, stops, refund }
 *
 * Do not write them before they can be bought. A policy describing something
 * nobody can purchase is a promise with no product under it, and the version of
 * it that ships is never the version that was guessed at.
 *
 * ─── AND WHY THE CREDIT SENTENCES ARE IMPORTED ──────────────────────────────
 *
 * They are the same sentences the member reads on /dashboard/credits. Not
 * similar — the same, from lib/credit-terms.ts. A billing term paraphrased in
 * two places is two terms.
 */

type Purchase = {
  id: string;
  title: string;
  /** What you get for the money. */
  what: React.ReactNode;
  /** How it stops. Null when there is nothing recurring to stop. */
  stops: React.ReactNode | null;
  /** What is and is not refundable. */
  refund: React.ReactNode;
};

export default async function RefundPage() {
  // The live expiry, so the published term cannot drift from the system that
  // enforces it. Falls back to the number this policy was written against only
  // if the settings row cannot be read; `verify:legal` asserts they agree.
  const settings = await getCreditSettings();
  const months = settings?.expiryMonths ?? PUBLISHED_EXPIRY_MONTHS;

  const purchases: Purchase[] = [
    {
      id: "membership",
      title: "Membership",
      what: (
        <p>
          A membership is access to the tools. It is billed monthly from your
          signup date and renews until you cancel.
        </p>
      ),
      stops: (
        <p>
          Cancel at any time from your account settings. Cancelling stops future
          billing immediately &mdash;{" "}
          <strong>
            your access continues until the end of your current paid billing
            period
          </strong>
          , and you are not charged again after that.
        </p>
      ),
      refund: (
        <p>
          <strong>We do not refund</strong> partial months, unused access, or a
          billing period that has already started. When you cancel you simply are
          not charged again, so there is nothing to request a refund for.
        </p>
      ),
    },
    {
      id: "credits",
      title: "Credits",
      what: (
        <>
          <p>
            {CREDIT_TERMS.whatItIs} {CREDIT_TERMS.whenSpent}
          </p>
          <p>
            {CREDIT_TERMS.whatACallCosts} {CREDIT_TERMS.failedCalls}
          </p>
          <p>
            <strong>{CREDIT_TERMS.notMoney}</strong>
          </p>
        </>
      ),
      stops: (
        <>
          <p>
            Credits are bought once, not subscribed to, so there is nothing to
            cancel. {creditExpirySentence(months)} {CREDIT_TERMS.spendOrder} Your
            balance, every batch you hold, and its expiry date are on your{" "}
            <Link href="/dashboard/credits">credits page</Link>.
          </p>
          <p>
            Credits do not lock. If your membership lapses, credits you have
            already bought stay spendable until they run out or expire.
          </p>
        </>
      ),
      refund: (
        <>
          {/* Two endings, two paragraphs. They used to share one clause —
              "an account that is closed or terminated" — which treats a member
              who walked away and a member who was removed as the same person.
              Both lose their credits; only one of them is being penalised, and
              the policy will be read by whichever of the two is angrier. */}
          <p>
            <strong>{CREDIT_TERMS.unusedNotRefundable}</strong> That includes
            credits that expire unspent. {CREDIT_TERMS.closingYourAccount}
          </p>
          <p>
            {CREDIT_TERMS.forfeitOnTermination} See the{" "}
            <Link href="/acceptable-use">Acceptable Use Policy</Link> for what
            that covers.
          </p>
          <p>
            If a tool charged you for something that plainly did not work, tell
            us. We can put credits back, and we would rather do that than argue
            about it.
          </p>
        </>
      ),
    },
    // Lifetime access and per-tool subscriptions go here when they exist. See
    // the note at the top of this file for the shape.
  ];

  return (
    <LegalShell
      title="Refund & Cancellation Policy"
      updated="August 28, 2026"
      intro={
        <>
          There are two things you can buy from Build &amp; Launch AI: a
          membership, and credits. They stop in different ways and have different
          refund rules, so each one is set out on its own below.
        </>
      }
    >
      {purchases.map((p) => (
        <Section key={p.id} title={p.title}>
          {p.what}
          {p.stops}
          {p.refund}
        </Section>
      ))}

      <Section title="If you were charged in error">
        <p>
          A duplicate charge, a charge after cancelling, a billing system fault
          &mdash; email{" "}
          <a href="mailto:support@buildnlaunchai.com">
            support@buildnlaunchai.com
          </a>{" "}
          and we will review it case by case. Every credit that has ever moved on
          your account is on your credits page, kept permanently, so a
          disagreement about credits can always be settled by looking.
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
          payment-specific issue we cannot resolve, such as a card charged
          incorrectly, you can escalate to Creem at{" "}
          <a href="mailto:support@creem.io">support@creem.io</a>.
        </p>
      </Section>
    </LegalShell>
  );
}
