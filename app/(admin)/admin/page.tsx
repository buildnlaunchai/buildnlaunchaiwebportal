import { AlertTriangle, BarChart3, LineChart } from "lucide-react";

import { Callout } from "@/components/ui/callout";
import { Panel, SectionHeader } from "@/components/ui/panel";
import { requireAdmin } from "@/lib/access";
import { getAdminMetrics, type PriceNeedingReview } from "@/lib/admin-metrics";

/**
 * Provider prices whose review date has passed.
 *
 * Sits at the very top of the dashboard, above the metrics, because it is the
 * only thing on this page that costs money while it is ignored. A promotional
 * rate that quietly expires leaves us billing members against a cost basis we
 * no longer pay — and it fails silently, on every call, in our disfavour.
 */
function PriceReviewBanner({ prices }: { prices: PriceNeedingReview[] }) {
  if (prices.length === 0) return null;

  return (
    <Callout tone="warn" icon={AlertTriangle}>
      <div className="flex flex-col gap-2">
        <div className="text-body-strong">
          {prices.length === 1
            ? "A provider price is past its review date"
            : `${prices.length} provider prices are past their review date`}
        </div>
        <ul className="flex flex-col gap-2">
          {prices.map((p) => (
            <li key={`${p.provider}:${p.model}`}>
              <span className="text-mono-chip">
                {p.provider} · {p.model}
              </span>{" "}
              — due {p.reviewAfter}
              {p.sourceNote ? <div className="mt-0.5">{p.sourceNote}</div> : null}
            </li>
          ))}
        </ul>
        <p>
          Re-check the provider&apos;s published rate and update{" "}
          <span className="text-mono-chip">provider_model_prices</span>. Until it
          is corrected, every call on these models is billed against a cost basis
          we may no longer be paying.
        </p>
      </div>
    </Callout>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  const w = 120;
  const h = 32;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const points = data
    .map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-accent" aria-hidden>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Metric({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <Panel>
      <div className="text-small text-text-muted">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="tabular text-display-l leading-none">{value}</div>
        {children}
      </div>
    </Panel>
  );
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const m = await getAdminMetrics();

  return (
    <div className="flex flex-col gap-8">
      <PriceReviewBanner prices={m.pricesNeedingReview} />

      {m.orphanedBackgroundCalls7d > 0 && (
        <Callout tone="warn" icon={AlertTriangle}>
          <div className="flex flex-col gap-1">
            <div className="text-body-strong">
              {m.orphanedBackgroundCalls7d} background{" "}
              {m.orphanedBackgroundCalls7d === 1 ? "call" : "calls"} expired
              unsettled in the last 7 days
            </div>
            <p>
              Each one is work OpenAI performed and billed us for, that no member
              was charged for — the client never came back to collect the result.
              A few is people closing laptops. A run of them is a bug worth
              finding before the invoice does. Each is named in the function logs
              with its upstream id.
            </p>
          </div>
        </Callout>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-eyebrow text-text-faint">Last 7 days</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Metric label="Active members" value={String(m.activeMembers)} />
          <Metric label="Runs (7d)" value={String(m.runs7d)} />
          <Metric label="Run success rate" value={m.successRate === null ? "—" : `${m.successRate}%`} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel>
          <SectionHeader icon={BarChart3} title="Top tools" description="Last 7 days" />
          {m.topTools.length === 0 ? (
            <p className="mt-4 text-small text-text-faint">No runs yet this week.</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {m.topTools.map((t) => (
                <li key={t.name} className="flex items-center justify-between text-small">
                  <span className="text-text">{t.name}</span>
                  <span className="tabular text-mono text-text-muted">{t.runs}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <SectionHeader icon={LineChart} title="Signups" description="Last 14 days" />
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="tabular text-display-l leading-none">
              {m.signupTrend.reduce((a, b) => a + b, 0)}
            </div>
            <Sparkline data={m.signupTrend} />
          </div>
        </Panel>
      </section>
    </div>
  );
}
