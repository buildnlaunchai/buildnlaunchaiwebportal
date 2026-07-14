/**
 * Phase 7 fills this with real metrics (pending applications, active members,
 * runs over 7d, run success rate). Phase 0 proves the admin shell renders and
 * is visibly distinct from the member app — the ADMIN chip in the top bar is
 * the point, not decoration (DESIGN.md §10).
 */

const PLACEHOLDER_METRICS = [
  { label: "Pending applications", value: "—" },
  { label: "Active members", value: "—" },
  { label: "Runs (7d)", value: "—" },
  { label: "Run success rate", value: "—" },
] as const;

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-10">
      <section>
        <h2 className="text-eyebrow text-text-faint">This week</h2>

        {/* §4: 16px between cards in a grid. */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLACEHOLDER_METRICS.map((metric) => (
            <div
              key={metric.label}
              // §5: cards are a border, not a shadow. §9 Card: 20px padding.
              className="rounded-md border border-line bg-surface p-5"
            >
              <div className="text-small text-text-muted">{metric.label}</div>
              <div className="tabular mt-2 font-display text-[26px] font-semibold leading-tight">
                {metric.value}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-small text-text-faint">
        Metrics arrive in Phase 7. The shell is Phase 0.
      </p>
    </div>
  );
}
