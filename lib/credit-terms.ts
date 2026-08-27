/**
 * The sentences that say what a credit is — written once, shown in both places.
 *
 * ─── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * A credit is described twice: to a member on /dashboard/credits, and to the
 * world on /terms and /refund. Those are the same promise, so they have to be
 * the same words. Two paraphrases of one billing term are not a style problem —
 * they are two terms, and the difference between them is exactly what an
 * argument about money is later fought over.
 *
 * Keeping them in sync by remembering to is not a plan. TEMPLATE.md drifted 93
 * commits behind by exactly that method. So the sentences live here, and both
 * screens import them; a change lands on the dashboard and in the policy in the
 * same commit or not at all.
 *
 * ─── ON VOICE ───────────────────────────────────────────────────────────────
 *
 * These say "Build & Launch AI", never "I". The rest of the product speaks as a
 * person on purpose — DESIGN.md §12 fixes the key vault's wording in the first
 * person and forbids softening it — but a billing term that names a person on
 * the dashboard and a company in the policy reads as two different promises.
 * Money speaks as the business. Everything else keeps its voice.
 *
 * ─── ON THE EXPIRY NUMBER ───────────────────────────────────────────────────
 *
 * `expiry()` takes the number rather than stating it, because the real one is
 * `credit_settings.expiry_months` and the database is what actually expires a
 * lot. PUBLISHED_EXPIRY_MONTHS is the value the policy was written against, and
 * both pages fall back to it only when the settings row cannot be read.
 * `verify:legal` asserts the two agree, so a change to the setting cannot
 * quietly make the published policy false.
 */

/** What the policy was written against. The database is the authority. */
export const PUBLISHED_EXPIRY_MONTHS = 12;

export const CREDIT_TERMS = {
  /** What you are buying. */
  whatItIs:
    "A credit pays for AI that runs on Build & Launch AI's provider accounts instead of your own.",

  /**
   * The answer to "so do I stop paying my provider?" — and to the harder one,
   * "what happens to my credits if I stop being a member?"
   */
  whenSpent:
    "While your membership is active the apps use your own keys and credits sit untouched; when it lapses, credits keep the apps working.",

  /** How the price of one call is arrived at. */
  whatACallCosts:
    "A call costs what the provider charged Build & Launch AI, plus a margin — nothing is rounded up to a whole cent.",

  /** Which credits go first. Not cosmetic: it is the order they are spent in. */
  spendOrder: "The batch closest to expiring is always spent first.",

  /**
   * A call that dies is not a call that was paid for. The runner opens a hold
   * before the call and releases it if the provider never reports usage, so
   * this is a description of the code and not a goodwill gesture.
   */
  failedCalls:
    "A call that fails is not charged. The credits reserved for it are released back to your balance.",

  /** What a credit is not. The sentence that keeps this out of money-transmitter territory. */
  notMoney:
    "Credits are spending power on this platform. They are not money, they cannot be exchanged for cash, and they cannot be transferred to another account.",

  /** The refund rule, stated once. */
  unusedNotRefundable: "Unused credits are not refundable.",

  /**
   * Leaving of your own accord. NOT a penalty — it follows from `notMoney`, and
   * saying so is the difference between a rule and a punishment.
   */
  closingYourAccount:
    "Closing your own account ends its credits with it; like all credits, they are not refunded.",

  /**
   * Being removed. This one IS a penalty, and it has to read like one.
   *
   * These two used to be one clause — "an account that is closed or terminated"
   * — which is a sentence that treats a member who walked away and a member who
   * was thrown out as the same person. They lose their credits either way, but
   * not for the same reason, and a policy that cannot tell the two apart will be
   * read by whichever one of them is angrier.
   */
  forfeitOnTermination:
    "If we terminate an account for breaking the Acceptable Use Policy, any unused credits on it are forfeited — which is a consequence of the breach, not the same thing as closing your account yourself.",
} as const;

/** "Credits expire 12 months after the day they land." */
export function creditExpirySentence(months: number): string {
  return `Credits expire ${months} months after the day they land.`;
}
