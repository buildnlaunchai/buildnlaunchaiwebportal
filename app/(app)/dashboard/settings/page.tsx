import { KeyRound, Ticket, UserRound } from "lucide-react";
import Link from "next/link";

import { ReferralLink } from "@/components/dashboard/referral-link";
import { StatusPill } from "@/components/tools/status-pill";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { requireUser } from "@/lib/access";
import { getMyMembership, isMembershipActive } from "@/lib/member";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const user = await requireUser("/dashboard/settings");
  const membership = await getMyMembership();
  const active = isMembershipActive(membership);

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
            <dd>
              {active ? (
                <StatusPill label="active" tone="live" dot={false} />
              ) : membership ? (
                <StatusPill label={membership.status} tone="faint" dot={false} />
              ) : (
                <span className="text-text-faint">none</span>
              )}
            </dd>
          </div>
        </dl>
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
    </div>
  );
}
