import type { Metadata } from "next";
import Link from "next/link";

import { LegalShell, Section } from "@/components/legal/legal";
import { CREDIT_TERMS } from "@/lib/credit-terms";

export const metadata: Metadata = {
  title: "Acceptable Use Policy — Build & Launch AI",
  description:
    "What you may not create or do with Build & Launch AI, and what happens if you do.",
};

/**
 * The Acceptable Use Policy.
 *
 * ─── WHY IT IS ITS OWN PAGE ─────────────────────────────────────────────────
 *
 * Terms §5 had four clauses about not breaking the law and not sharing your
 * account. That is a fair-use clause, not an acceptable-use policy, and it says
 * nothing about the thing this platform actually makes: images, video, and
 * voice. A policy that does not name what the product can be misused for is a
 * policy about a different product.
 *
 * It is also a condition of being able to take money. Creem's approval named a
 * visible AUP with NSFW, harmful content, and deepfake/face-swap generation
 * explicitly prohibited, and "explicitly" is the operative word — a general
 * "don't break the law" does not satisfy it and should not, because a face-swap
 * is not illegal in most places and is still the thing nobody wants to host.
 *
 * ─── AND WHY THE RULES TIGHTEN IN CREDIT MODE ───────────────────────────────
 *
 * Running on your own key, you answer to your provider. Running on credit, the
 * call leaves Build & Launch AI's account, so we answer for it — and a breach
 * risks the provider account every member on credit depends on. That is a real
 * asymmetry and the policy says so rather than pretending the two modes are the
 * same.
 */
export default function AcceptableUsePage() {
  return (
    <LegalShell
      title="Acceptable Use Policy"
      updated="August 28, 2026"
      intro={
        <>
          These rules apply to everything you make with Build &amp; Launch AI and
          everything you do with the platform. They apply whether a tool runs on
          your own API key or on credits, and they apply to the outputs as well
          as the inputs.
        </>
      }
    >
      <Section title="What you must not create">
        <p>
          Do not use Build &amp; Launch AI, or any tool on it, to generate, edit,
          or distribute:
        </p>
        <ul>
          <li>
            <strong>Sexual or adult content.</strong> No pornographic or
            sexually explicit images, video, audio, or text, and no content
            marketed as NSFW. Adult content is not permitted on this platform.
          </li>
          <li>
            <strong>Any sexual content involving a minor</strong>, real or
            generated, in any form. This is the one rule with no discussion
            attached to it: the account is terminated immediately and the
            material is reported to the relevant authorities.
          </li>
          <li>
            <strong>Deepfakes, face swaps, and voice clones of real people.</strong>{" "}
            Do not swap a person&rsquo;s face onto another body or scene, do not
            generate a synthetic likeness of a real person, and do not clone
            anyone&rsquo;s voice, without that person&rsquo;s explicit and
            documented consent. Never for a public figure, and never to depict
            anyone saying or doing something they did not.
          </li>
          <li>
            <strong>Content that impersonates</strong> a real person, company, or
            public body &mdash; including fake statements, fake endorsements,
            fake reviews, forged documents, and synthetic identity or
            verification material.
          </li>
          <li>
            <strong>Harmful instructions.</strong> Weapons, explosives, drug
            synthesis, malware, intrusion tooling, or anything whose purpose is
            to hurt someone or break into something.
          </li>
          <li>
            <strong>Hate, harassment, and abuse.</strong> Content that attacks or
            degrades people over a protected characteristic, targeted harassment
            of an individual, threats, or publishing private information about
            someone without their consent.
          </li>
          <li>
            <strong>Self-harm content</strong>, including encouragement,
            instruction, or glorification.
          </li>
          <li>
            <strong>Fraud and deception.</strong> Phishing, scams, spam, fake
            engagement, disinformation campaigns, or misleading political
            material.
          </li>
          <li>
            <strong>Material you have no right to use</strong> &mdash; anything
            that infringes someone else&rsquo;s copyright, trademark, or other
            rights, and anything illegal where you are.
          </li>
        </ul>
      </Section>

      <Section title="What you must not do with the platform">
        <ul>
          <li>
            Resell access, share your account, or run someone else&rsquo;s
            product on your membership or your credits.
          </li>
          <li>
            Attack, scrape, overload, or abuse any third-party service using our
            tools.
          </li>
          <li>
            Work around access controls, rate limits, per-call caps, or the
            credit system &mdash; including by automating the interface or
            calling internal endpoints directly.
          </li>
          <li>
            Attempt to extract other members&rsquo; data, runs, keys, or credit
            records.
          </li>
        </ul>
        <p>
          Security research is welcome and is the one exception to the line
          above: if you find a vulnerability, stop, do not use it, and email{" "}
          <a href="mailto:support@buildnlaunchai.com">
            support@buildnlaunchai.com
          </a>
          . You will not be penalised for a report made in good faith.
        </p>
      </Section>

      <Section title="Credit mode: the same rules, enforced harder">
        <p>
          When you run a tool on your own API key, the call is made on your
          account and your provider&rsquo;s policies are between you and them.
          When you run on credits, the call is made on Build &amp; Launch
          AI&rsquo;s provider accounts &mdash; so a breach is ours to answer for,
          and it puts at risk the accounts every member on credit depends on.
        </p>
        <p>
          So in credit mode our providers&rsquo; usage policies apply to you as
          if they were ours, because for the length of that call they are. Today
          those providers are OpenAI and ElevenLabs; the current list is in our{" "}
          <Link href="/privacy">Privacy Policy</Link>. ElevenLabs in particular
          prohibits cloning a voice without the speaker&rsquo;s consent, and we
          enforce that as written.
        </p>
      </Section>

      <Section title="What happens if you break these rules">
        <ul>
          <li>
            For something minor or ambiguous, we will contact you first and ask
            you to stop.
          </li>
          <li>
            For anything serious, and for any repeat, we suspend or terminate the
            account without notice.
          </li>
          <li>
            A terminated account loses access to the tools.{" "}
            {CREDIT_TERMS.forfeitOnTermination} See the{" "}
            <Link href="/refund">Refund &amp; Cancellation Policy</Link>.
          </li>
          <li>
            We report content to the authorities where the law requires it, and
            we may be required to preserve it in order to do so.
          </li>
        </ul>
        <p>
          We do not monitor the content of your runs, and no screen in this
          product shows us what you generated. Enforcement happens when something
          is reported to us, when a provider tells us, or when abuse is visible
          in usage patterns.
        </p>
      </Section>

      <Section title="Reporting a problem">
        <p>
          If you have seen something made with Build &amp; Launch AI that breaks
          these rules, or if a likeness or voice of yours has been used without
          your consent, email{" "}
          <a href="mailto:support@buildnlaunchai.com">
            support@buildnlaunchai.com
          </a>{" "}
          with as much detail as you can. Reports about a person&rsquo;s likeness
          or voice are handled first.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          We may update this policy as the tools change. Material changes are
          announced by email or a notice on the site. Continuing to use Build
          &amp; Launch AI after a change means you accept it.
        </p>
      </Section>
    </LegalShell>
  );
}
