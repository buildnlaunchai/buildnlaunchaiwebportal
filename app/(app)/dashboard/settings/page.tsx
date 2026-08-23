import { CreditCard, KeyRound, LifeBuoy, Ticket, UserRound } from "lucide-react";
import Link from "next/link";

import { ReferralLink } from "@/components/dashboard/referral-link";
import { StatusPill } from "@/components/tools/status-pill";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { requireUser } from "@/lib/access";
import { getMyMembership, isMembershipActive } from "@/lib/member";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
  const user = await requireUser("/dashboard/settings");
  const membership = await getMyMembership();
  const active = isMembershipActive(membership);

  // /api/portal sends them back here with ?billing=unavailable when Creem could
  // not tell us who owns their subscription. Without this the click would look
  // like a dead button, which is the failure mode this whole page exists to fix.
  const billingUnavailable = (await searchParams).billing === "unavailable";

  // Only offer the portal when there is billing to manage. Gating on `active`
  // alone would show it to a gifted or manually-granted member too, whose
  // membership has no Creem subscription behind it — /api/portal would bounce
  // them straight back, which is worse than no button at all.
  const canManageBilling =
    active &&
    membership?.provider === "creem" &&
    Boolean(membership.provider_subscription_id);

  // How many people this user has referred.
  const supabase = await createClient();
  const { count: referralCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("referred_by", user.id);

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <Panel>
        <SectionHeader icon={UserRound} title="Profile" />
        <dl className="mt-4 flex flex-col gap-3 text-small">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-text-muted">Name</dt>
            <dd className="text-text">{user.profile.full_name ?? "—"}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-text-muted">Email</dt>
            <dd className="text-mono text-text">{user.email}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-text-muted">Membership</dt>
            <dd className="flex items-center gap-3">
              {active ? (
                <StatusPill label="active" tone="live" dot={false} />
              ) : membership ? (
                <StatusPill label={membership.status} tone="faint" dot={false} />
              ) : (
                <span className="text-text-faint">none</span>
              )}
              {canManageBilling && (
                /* A plain <a>, deliberately, not next/link: /api/portal is a
                   Route Handler that answers with a redirect to Creem's hosted
                   page. The App Router client expects an RSC payload and will
                   not follow a redirect to a third-party origin, so only a
                   full-page navigation actually leaves the app. Same reason
                   useSubscribe assigns location for checkout. */
                <a
                  href="/api/portal"
                  className="inline-flex items-center gap-1.5 text-small text-accent transition-colors duration-micro ease-default hover:text-accent-hover"
                >
                  <CreditCard aria-hidden className="size-4" strokeWidth={1.6} />
                  Manage billing
                </a>
              )}
            </dd>
          </div>
        </dl>
        {billingUnavailable && (
          <p className="mt-4 text-small text-text-muted">
            We couldn&rsquo;t open the billing portal just now. Please try again
            in a minute &mdash; or email us and we&rsquo;ll sort it out for you.
          </p>
        )}
        {canManageBilling && !billingUnavailable && (
          <p className="mt-4 text-small text-text-faint">
            Invoices, payment method, and cancelling all live in the billing
            portal. Cancelling stops future billing &mdash; you keep access until
            the end of the period you&rsquo;ve paid for.
          </p>
        )}
      </Panel>

      <Panel>
        <SectionHeader
          icon={UserRound}
          title="Invite people"
          description="Share your link. When enough people you invite join, your membership is on me."
        />
        <div className="mt-4">
          <ReferralLink code={user.profile.referral_code ?? ""} />
        </div>
        <p className="mt-3 text-small text-text-faint">
          You&apos;ve invited {referralCount ?? 0}{" "}
          {referralCount === 1 ? "person" : "people"} so far.
        </p>
      </Panel>

      <Panel>
        <SectionHeader
          icon={Ticket}
          title="Have a code?"
          description="Redeem a membership or tool-access code."
          action={
            <Link
              href="/dashboard/redeem"
              className="inline-flex items-center gap-1.5 text-small text-accent transition-colors duration-micro ease-default hover:text-accent-hover"
            >
              <KeyRound aria-hidden className="size-4" strokeWidth={1.6} />
              Redeem
            </Link>
          }
        />
      </Panel>

      {/* Support. Small on purpose — it is a safety net, not a headline. Until
          now the address only existed on the public legal pages, so a signed-in
          member with a billing problem had to leave the app to find it. */}
      <p className="flex items-center gap-2 px-1 text-small text-text-faint">
        <LifeBuoy aria-hidden className="size-4 shrink-0" strokeWidth={1.6} />
        <span>
          Need a hand? Email{" "}
          <a
            href="mailto:support@buildnlaunchai.com"
            className="text-mono text-accent transition-colors duration-micro ease-default hover:text-accent-hover"
          >
            support@buildnlaunchai.com
          </a>
        </span>
      </p>
    </div>
  );
}
