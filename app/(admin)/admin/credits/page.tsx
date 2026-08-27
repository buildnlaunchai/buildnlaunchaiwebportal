import { Coins } from "lucide-react";
import Link from "next/link";

import { CreditControls } from "@/components/admin/credit-controls";
import { StatusPill } from "@/components/tools/status-pill";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { requireAdmin } from "@/lib/access";
import { listCreditHolders } from "@/lib/credits";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Credits" };

/**
 * Who holds credit, and who is allowed to spend it.
 *
 * The list is not every member on purpose — see `listCreditHolders`. It is the
 * people the credit system currently applies to: anyone with a balance, and
 * anyone with an override. The second group is the one that would otherwise be
 * impossible to find again, because an override is invisible everywhere else.
 */
export default async function AdminCreditsPage() {
  await requireAdmin();

  const supabase = await createClient();
  const [{ data: settings }, holders] = await Promise.all([
    supabase
      .from("credit_settings")
      .select(
        "credit_usd_value, margin_multiplier, per_call_max_credits, per_user_daily_max_credits, credit_mode_enabled",
      )
      .eq("id", true)
      .maybeSingle(),
    listCreditHolders(),
  ]);

  const globalOn = settings?.credit_mode_enabled === true;
  const rate = settings ? Number(settings.credit_usd_value) : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1">Credits</h1>
        <p className="text-small text-text-muted">
          Balances, and who credit mode is switched on for.
        </p>
      </div>

      <Panel>
        <SectionHeader
          icon={Coins}
          title="Settings"
          description="The numbers every quote is computed from."
          action={
            globalOn ? (
              <StatusPill label="credit mode ON" tone="live" dot={false} />
            ) : (
              <StatusPill label="credit mode off" tone="faint" dot={false} />
            )
          }
        />
        {settings ? (
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-small sm:grid-cols-4">
            <Stat label="1 credit" value={`$${Number(settings.credit_usd_value)}`} />
            <Stat label="margin" value={`${Number(settings.margin_multiplier)}x`} />
            <Stat
              label="per call"
              value={settings.per_call_max_credits.toLocaleString()}
            />
            <Stat
              label="per day"
              value={settings.per_user_daily_max_credits.toLocaleString()}
            />
          </dl>
        ) : (
          <p className="mt-4 text-small text-text-faint">No settings row.</p>
        )}
        <p className="mt-4 text-small text-text-faint">
          The switch itself lives in{" "}
          <Link
            href="/admin/settings"
            className="text-accent transition-colors duration-micro ease-default hover:text-accent-hover"
          >
            Settings
          </Link>
          . It is global; the buttons below are the per-member override, which is
          what to use before it is on for everyone.
        </p>
      </Panel>

      <Panel>
        <SectionHeader
          icon={Coins}
          title="Members"
          description="Anyone holding credit, and anyone with an override."
        />

        {holders.length === 0 ? (
          <p className="mt-4 text-small text-text-faint">
            Nobody holds credit and nobody has an override. Adjust a balance from
            a member&rsquo;s own page, or switch one on here once they do.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-line">
            {holders.map((h) => (
              <li key={h.id} className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/users/${h.id}`}
                      className="text-body-strong text-text transition-colors duration-micro ease-default hover:text-accent"
                    >
                      {h.fullName ?? h.email}
                    </Link>
                    <div className="text-mono text-small text-text-faint">
                      {h.email}
                      {h.membershipStatus && <> &middot; {h.membershipStatus}</>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-mono text-body-strong text-text">
                      {(h.balance - h.held).toLocaleString()}
                    </div>
                    <div className="text-small text-text-faint">
                      available
                      {h.held > 0 && <> &middot; {h.held.toLocaleString()} held</>}
                      {rate !== null && (
                        <> &middot; ${((h.balance - h.held) * rate).toFixed(2)}</>
                      )}
                    </div>
                  </div>
                </div>

                <CreditControls
                  userId={h.id}
                  email={h.email}
                  balance={h.balance}
                  override={h.override}
                  globalOn={globalOn}
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="px-1 text-small text-text-faint">
        Every adjustment and every override change is written to{" "}
        <Link
          href="/admin/audit"
          className="text-accent transition-colors duration-micro ease-default hover:text-accent-hover"
        >
          the audit log
        </Link>
        , with what it was before. An override is an authority to spend the
        platform&rsquo;s money, so it is recorded like one.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-text-faint">{label}</dt>
      <dd className="text-mono mt-0.5 text-text">{value}</dd>
    </div>
  );
}
