import { BarChart3, LineChart } from "lucide-react";
import Link from "next/link";

import { Panel, SectionHeader } from "@/components/ui/panel";
import { requireAdmin } from "@/lib/access";
import { getAdminMetrics } from "@/lib/admin-metrics";

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
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-eyebrow text-text-faint">Last 7 days</h2>
          {m.pendingApplications > 0 && (
            <Link href="/admin/applications?status=pending" className="text-small text-accent transition-colors duration-micro ease-default hover:text-accent-hover">
              {m.pendingApplications} to review →
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Pending applications" value={String(m.pendingApplications)} />
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
