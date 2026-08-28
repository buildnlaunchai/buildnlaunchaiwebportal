/**
 * The legal pages, checked against the system they describe.
 *
 * ─── WHY A SCRIPT AND NOT A PROOFREAD ───────────────────────────────────────
 *
 * A policy is a claim about how the software behaves, and software drifts. The
 * two ways these pages can quietly become false are both mechanical, so both are
 * checked mechanically:
 *
 *   1. THE EXPIRY NUMBER. /terms and /refund publish it; credit_settings.
 *      expiry_months enforces it. Nothing stops an admin changing the setting
 *      and leaving the published term saying something else.
 *
 *   2. THE SENTENCES. The member reads what a credit is on /dashboard/credits;
 *      the world reads it on /terms and /refund. They are the same billing term,
 *      so they must be the same words — lib/credit-terms.ts is the one copy, and
 *      what this asserts is that nobody has quietly gone back to typing them out.
 *
 * Plus the three things Creem's approval actually asked for, checked as text
 * because "explicitly prohibited" was the condition and a general clause about
 * obeying the law does not satisfy it.
 */
import { readFileSync } from "node:fs";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let pass = 0, fail = 0;
const check = (ok, label, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (ok) pass++; else fail++;
};
const read = (p) => readFileSync(p, "utf8");
/**
 * The same file with its comments removed.
 *
 * Needed because the assertions below search for phrasing that must NOT appear,
 * and the comment explaining why it must not appear quotes it. Checking raw text
 * therefore fails on the note warning against the thing — a check that punishes
 * the explanation is worse than no check, because the fix is to delete the
 * explanation.
 */
const prose = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const TERMS = read("lib/credit-terms.ts");
const AUP = read("app/(marketing)/acceptable-use/page.tsx");
const REFUND = read("app/(marketing)/refund/page.tsx");
const TOS = read("app/(marketing)/terms/page.tsx");
const PRIVACY = read("app/(marketing)/privacy/page.tsx");
const DASH = read("app/(app)/dashboard/credits/page.tsx");
const FOOTER = read("components/marketing/site-footer.tsx");

console.log("\n  Creem's conditions, as text on a page a visitor can reach");
{
  check(/href: "\/acceptable-use"/.test(FOOTER), "the footer links the acceptable use policy");
  check(/\/acceptable-use/.test(TOS), "and the terms link it too");

  // Named one at a time. "Prohibited content" as a heading with a vague list
  // under it is what this is checking against.
  const required = [
    [/sexually explicit|pornographic/i, "sexual content is named"],
    [/NSFW/i, "NSFW is named in those words"],
    [/minor/i, "content involving a minor is named"],
    [/deepfake/i, "deepfakes are named"],
    [/face swap|face-swap|swap a person/i, "face swaps are named"],
    [/voice clone|clone a voice|cloning a voice|voice clones/i, "voice cloning is named"],
    [/consent/i, "consent is the standard for a real person's likeness"],
    [/harassment/i, "harassment is named"],
    [/self-harm/i, "self-harm is named"],
  ];
  for (const [re, label] of required) check(re.test(AUP), label);
}

console.log("\n  One copy of the billing terms, imported and not retyped");
{
  // Every string literal inside the CREDIT_TERMS object, however it happens to
  // be wrapped. An earlier version keyed on indentation and silently missed the
  // two short ones — a completeness check that is itself incomplete is worse
  // than none, because it reports PASS for what it never looked at.
  const body = TERMS.slice(
    TERMS.indexOf("export const CREDIT_TERMS = {"),
    TERMS.indexOf("} as const;"),
  )
    // Comments first. The doc comments quote the questions these sentences
    // answer, and counting those as terms made the check pass for the wrong
    // reason.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  const sentences = [...body.matchAll(/"([^"]{30,})"/g)].map((m) => m[1]);
  check(sentences.length === 9, "credit-terms.ts holds all nine sentences", `${sentences.length} found`);

  for (const [name, file] of [
    ["/refund", REFUND],
    ["/terms", TOS],
    ["/acceptable-use", AUP],
    ["dashboard", DASH],
  ]) {
    check(
      /from "@\/lib\/credit-terms"/.test(file),
      `${name} imports them rather than restating them`,
    );
    // The failure this is really aimed at: someone pastes the sentence in to
    // avoid an import, and the two copies part company six months later.
    const copied = sentences.filter((s) => file.includes(s.slice(0, 45)));
    check(copied.length === 0, `${name} has no hand-copied duplicate`, copied.join(" | "));
  }
}

console.log("\n  Leaving and being removed are two different endings");
{
  // They shared one clause — "an account that is closed or terminated" — until
  // it was pointed out that this treats a member who walked away and a member
  // who was thrown out as the same person. Asserted because the tidy phrasing is
  // the tempting one, and it will be tempting again.
  for (const [name, file] of [["/refund", REFUND], ["/terms", TOS]]) {
    check(!/closed or terminated/i.test(prose(file)), `${name} does not collapse the two`);
    check(
      /forfeitOnTermination/.test(file) && /closingYourAccount/.test(file),
      `${name} states both, separately`,
    );
  }
  check(
    /CREDIT_TERMS\.forfeitOnTermination/.test(AUP),
    "the AUP states the forfeit in the shared words",
  );
  check(
    !/will not be one|never be one/.test(prose(AUP)) &&
      /not permitted on this platform/.test(AUP),
    "and the adult clause describes today rather than promising forever",
  );
}

console.log("\n  What is published matches what the database will do");
if (!URL_ || !ANON) {
  check(false, "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY are required for this part");
} else {
  const published = Number(/PUBLISHED_EXPIRY_MONTHS = (\d+)/.exec(TERMS)?.[1]);
  const res = await fetch(`${URL_}/rest/v1/credit_settings_public?select=expiry_months`, {
    headers: { apikey: ANON },
  });
  const row = (await res.json())?.[0];
  check(
    row?.expiry_months === published,
    "the published expiry is the one the database enforces",
    `published ${published}, database ${row?.expiry_months}`,
  );
  // Both pages read the live value; the constant is only the fallback. If that
  // ever stops being true the assertion above is the only thing left holding
  // the policy to the system, so it is asserted separately.
  const CREDITS_LIB = read("lib/credits.ts");
  for (const [name, file] of [["/refund", REFUND], ["/terms", TOS]]) {
    check(
      /getPublishedExpiryMonths\(\)/.test(file),
      `${name} reads the live setting through the deadlined helper`,
    );
    // Not `getCreditSettings` directly any more: these are the only marketing
    // pages that touch the database, so an unbounded read here is the one that
    // takes the public site down with it. Asserted by name so a refactor back
    // to the plain call fails here rather than during the next outage.
    check(
      !/getCreditSettings\(\)/.test(prose(file)),
      `${name} does not call the unbounded read`,
    );
  }
  check(
    /timed\(/.test(CREDITS_LIB) && /return PUBLISHED_EXPIRY_MONTHS/.test(CREDITS_LIB),
    "and the helper has a deadline and falls back to the published constant",
  );
}

console.log("\n  Privacy says what credit mode changed");
{
  check(/sub-processor/i.test(PRIVACY), "sub-processors are named as such");
  check(/OpenAI/.test(PRIVACY) && /ElevenLabs/.test(PRIVACY), "and the credit-mode providers are listed");
  check(
    /when you run on credits/i.test(PRIVACY),
    "and the page says the relationship differs from BYOK",
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
