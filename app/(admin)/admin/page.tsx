import Link from "next/link";

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
    <div className="rounded-md border border-line bg-surface p-5">
      <div className="text-small text-text-muted">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="tabular font-display text-[26px] font-semibold leading-tight">{value}</div>
        {children}
      </div>
    </div>
  );
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const m = await getAdminMetrics();

  return (
    <div className="flex flex-col gap-10">
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-eyebrow text-text-faint">Last 7 days</h2>
          {m.pendingApplications > 0 && (
            <Link href="/admin/applications?status=pending" className="text-small text-accent hover:text-accent-hover">
              {m.pendingApplications} to review →
            </Link>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Pending applications" value={String(m.pendingApplications)} />
          <Metric label="Active members" value={String(m.activeMembers)} />
          <Metric label="Runs (7d)" value={String(m.runs7d)} />
          <Metric label="Run success rate" value={m.successRate === null ? "—" : `${m.successRate}%`} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-line bg-surface p-5">
          <h3 className="text-h3">Top tools (7d)</h3>
          {m.topTools.length === 0 ? (
            <p className="mt-3 text-small text-text-faint">No runs yet this week.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {m.topTools.map((t) => (
                <li key={t.name} className="flex items-center justify-between text-small">
                  <span className="text-text">{t.name}</span>
                  <span className="tabular text-mono text-text-muted">{t.runs}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-md border border-line bg-surface p-5">
          <h3 className="text-h3">Signups (14d)</h3>
          <div className="mt-4 flex items-end justify-between gap-4">
            <div className="tabular font-display text-[26px] font-semibold leading-tight">
              {m.signupTrend.reduce((a, b) => a + b, 0)}
            </div>
            <Sparkline data={m.signupTrend} />
          </div>
        </div>
      </section>
    </div>
  );
}
