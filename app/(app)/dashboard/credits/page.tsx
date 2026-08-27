import { Coins, History, Hourglass, LifeBuoy } from "lucide-react";

import { StatusPill } from "@/components/tools/status-pill";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { requireUser } from "@/lib/access";
import { getCreditSettings, getMyCredits } from "@/lib/credits";
import { formatShipDate } from "@/lib/format";

export const metadata = { title: "Credits" };

/**
 * What a member has, what it is worth, and where it went.
 *
 * This page is the destination `creditModeUrl()` points at from every client. It
 * used to point at /dashboard/settings, which never mentioned credit at all — so
 * a member running on credit was sent to a page that could not explain their own
 * situation to them.
 *
 * ON SHOWING THE SPEND HISTORY AT ALL: it is the only honest answer to "where
 * did my credit go", and the only reason the ledger's `credit_usd_value_at` and
 * `margin_multiplier_at` columns are frozen per row is so that answer stays true
 * when the rate changes. A page that showed a balance and nothing else would
 * waste that.
 */
export default async function CreditsPage() {
  await requireUser("/dashboard/credits");

  const [credits, settings] = await Promise.all([
    getMyCredits(),
    getCreditSettings(),
  ]);

  const rate = settings?.usdValue ?? null;
  const worth = (n: number) => (rate === null ? null : n * rate);

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <Panel>
        <SectionHeader
          icon={Coins}
          title="Credits"
          description="What you have left, and what it can pay for."
        />

        <div className="mt-5 flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <div className="text-mono text-h1 text-text">
              {credits.available.toLocaleString()}
            </div>
            <p className="mt-1 text-small text-text-muted">
              available to spend
              {worth(credits.available) !== null && (
                <> &middot; about ${worth(credits.available)!.toFixed(2)}</>
              )}
            </p>
          </div>

          {/* Held is only worth a line when there is some. A permanent "0 held"
              invites the question it exists to answer. */}
          {credits.held > 0 && (
            <div>
              <div className="text-mono text-h2 text-text-muted">
                {credits.held.toLocaleString()}
              </div>
              <p className="mt-1 text-small text-text-faint">
                reserved by calls still running
              </p>
            </div>
          )}
        </div>

        {/* ─── WHY THIS PARAGRAPH IS NOT IN THE FIRST PERSON ──────────────────
            The rest of the product speaks as a person, and deliberately so —
            DESIGN.md §12 fixes the key vault's wording in the first person and
            says never to soften it. This paragraph is different in kind: it is
            a billing term. It says what a credit is, what a call costs, and who
            the counterparty is, and every one of those sentences has to still
            be true when it is restated on the refund and expiry pages. Terms
            that name a person on one screen and a company on the next read as
            two different promises. So money speaks as Build & Launch AI, and
            everything else keeps its voice. Do not "fix" the inconsistency in
            either direction. */}
        <p className="mt-5 text-small text-text-faint">
          A credit pays for AI that runs on Build &amp; Launch AI&rsquo;s
          provider accounts instead of your own. While your membership is active
          the apps use your own keys and credits sit untouched; when it lapses,
          credits keep the apps working. A call costs what the provider charged
          Build &amp; Launch AI, plus a margin &mdash; nothing is rounded up to a
          whole cent.
        </p>
      </Panel>

      {credits.lots.length > 0 && (
        <Panel>
          <SectionHeader
            icon={Hourglass}
            title="Expiry"
            description={
              settings
                ? `Credits last ${settings.expiryMonths} months from the day they land.`
                : "When each batch runs out of time."
            }
          />
          <ul className="mt-4 flex flex-col gap-2">
            {credits.lots.map((lot) => (
              <li
                key={lot.id}
                className="flex items-center justify-between gap-4 text-small"
              >
                <span className="text-mono text-text">
                  {lot.remaining.toLocaleString()}
                  {lot.remaining !== lot.total && (
                    <span className="text-text-faint">
                      {" "}
                      of {lot.total.toLocaleString()}
                    </span>
                  )}
                </span>
                <span className="text-text-muted">
                  {lot.expiresAt ? (
                    <>expires {formatShipDate(lot.expiresAt)}</>
                  ) : (
                    <>never expires</>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {/* Oldest first is not cosmetic: that is the order they are spent in,
              so the top row is the one a member is actually racing. */}
          <p className="mt-3 text-small text-text-faint">
            The batch closest to expiring is always spent first.
          </p>
        </Panel>
      )}

      <Panel>
        <SectionHeader
          icon={History}
          title="History"
          description="Every credit that moved, and what moved it."
        />
        {credits.ledger.length === 0 ? (
          <p className="mt-4 text-small text-text-faint">
            Nothing yet. Entries appear here the first time an app spends a
            credit on your behalf.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-line">
            {credits.ledger.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-4 py-2.5">
                <div className="min-w-0">
                  <div className="text-small text-text">{describe(e)}</div>
                  <div className="text-small text-text-faint">
                    {formatShipDate(e.createdAt)}
                    {e.note && <> &middot; {e.note}</>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`text-mono text-small ${
                      e.credits >= 0 ? "text-live" : "text-text"
                    }`}
                  >
                    {e.credits >= 0 ? "+" : ""}
                    {e.credits.toLocaleString()}
                  </div>
                  <div className="text-mono text-small text-text-faint">
                    {e.balanceAfter.toLocaleString()} left
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* The shape #5 slots into. Deliberately not a disabled "Buy" button:
          a button that cannot be pressed is worse than a sentence saying why,
          and this way adding checkout is a button in an existing panel rather
          than a new screen. */}
      <Panel>
        <SectionHeader
          icon={Coins}
          title="Top up"
          action={<StatusPill label="not open yet" tone="faint" dot={false} />}
        />
        <p className="mt-3 text-small text-text-faint">
          Buying credit isn&rsquo;t open yet. If you&rsquo;ve run out and need
          more before it opens, email{" "}
          <a
            href="mailto:support@buildnlaunchai.com"
            className="text-mono text-accent transition-colors duration-micro ease-default hover:text-accent-hover"
          >
            support@buildnlaunchai.com
          </a>{" "}
          to have credits added by hand.
        </p>
      </Panel>

      <p className="flex items-center gap-2 px-1 text-small text-text-faint">
        <LifeBuoy aria-hidden className="size-4 shrink-0" strokeWidth={1.6} />
        <span>
          Something here look wrong? Email{" "}
          <a
            href="mailto:support@buildnlaunchai.com"
            className="text-mono text-accent transition-colors duration-micro ease-default hover:text-accent-hover"
          >
            support@buildnlaunchai.com
          </a>{" "}
          &mdash; every entry above is kept, so it can always be checked.
        </span>
      </p>
    </div>
  );
}

/**
 * One ledger row, in a sentence.
 *
 * The kinds come from the `credit_entry_kind` enum. An unrecognised one falls
 * through to its own name rather than being hidden: a row nobody can read is
 * still better than a row nobody is shown, because the second kind is what makes
 * a balance look wrong for no reason.
 */
function describe(e: {
  kind: string;
  provider: string | null;
  model: string | null;
  toolName: string | null;
}): string {
  switch (e.kind) {
    // The tool's NAME, not its slug. `raw-footage-real-story` is an internal
    // identifier that appears nowhere a member has ever looked; a spend they
    // cannot attribute to something they recognise is a spend they have to take
    // on trust, which is the opposite of what this list is for. See
    // getMyCredits() for how it resolves, and what happens when it cannot.
    case "debit":
      return [e.toolName, e.model ?? e.provider].filter(Boolean).join(" · ") || "A call";
    case "topup":
      return "Credit added";
    case "refund":
      return "Refunded";
    case "expiry":
      return "Expired";
    case "admin_adjustment":
      return "Adjusted by Build & Launch AI";
    default:
      return e.kind;
  }
}
