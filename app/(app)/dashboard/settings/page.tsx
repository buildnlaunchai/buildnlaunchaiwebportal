import Link from "next/link";

import { ReferralLink } from "@/components/dashboard/referral-link";
import { StatusPill } from "@/components/tools/status-pill";
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
    <div className="flex max-w-[640px] flex-col gap-6">
      <section className="rounded-md border border-line bg-surface p-5">
        <h2 className="text-h3">Profile</h2>
        <dl className="mt-3 flex flex-col gap-2 text-small">
          <div className="flex justify-between gap-4">
            <dt className="text-text-muted">Name</dt>
            <dd className="text-text">{user.profile.full_name ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-4">
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
      </section>

      <section className="rounded-md border border-line bg-surface p-5">
        <h2 className="text-h3">Invite people</h2>
        <p className="mt-1 text-small text-text-muted">
          Share your link. When enough people you invite join, your membership is
          on me.
        </p>
        <div className="mt-4">
          <ReferralLink code={user.profile.referral_code ?? ""} />
        </div>
        <p className="mt-3 text-small text-text-faint">
          You&apos;ve invited {referralCount ?? 0}{" "}
          {referralCount === 1 ? "person" : "people"} so far.
        </p>
      </section>

      <section className="rounded-md border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-h3">Have a code?</h2>
            <p className="mt-1 text-small text-text-muted">
              Redeem a membership or tool-access code.
            </p>
          </div>
          <Link
            href="/dashboard/redeem"
            className="shrink-0 text-small text-accent hover:text-accent-hover"
          >
            Redeem →
          </Link>
        </div>
      </section>
    </div>
  );
}
