"use client";

import { ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reviewApplication } from "@/actions/applications";
import { StatusPill } from "@/components/tools/status-pill";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { formatShipDate } from "@/lib/format";
import type { Application, ApplicationStatus } from "@/lib/applications";
import { cn } from "@/lib/utils";

const STATUS_PILL: Record<
  ApplicationStatus,
  { label: string; tone: "warn" | "live" | "faint" | "danger" }
> = {
  pending: { label: "pending", tone: "warn" },
  approved: { label: "approved", tone: "live" },
  waitlisted: { label: "waitlisted", tone: "faint" },
  rejected: { label: "rejected", tone: "danger" },
};

function Answer({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-eyebrow text-text-faint">{label}</dt>
      <dd className="mt-1 text-small text-text">{value}</dd>
    </div>
  );
}

export function ApplicationRow({ application: a }: { application: Application }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const pill = STATUS_PILL[a.status];

  const review = (status: Exclude<ApplicationStatus, "pending">) => {
    setError(null);
    startTransition(async () => {
      const res = await reviewApplication(a.id, status);
      if ("error" in res) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <Panel flush>
      {/* Collapsed header — always visible, always the click target */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-4 px-5 py-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-body-strong text-text">
              {a.full_name}
            </span>
            <StatusPill label={pill.label} tone={pill.tone} dot={false} />
          </div>
          <p className="text-mono mt-0.5 truncate text-text-faint">{a.email}</p>
        </div>

        {a.willingness_to_pay && (
          <span className="text-mono hidden shrink-0 text-text-muted sm:inline">
            {a.willingness_to_pay}
          </span>
        )}
        <span className="text-mono hidden shrink-0 text-text-faint md:inline">
          {formatShipDate(a.created_at)}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 shrink-0 text-text-muted transition-transform duration-micro ease-default",
            open && "rotate-180",
          )}
          strokeWidth={1.5}
        />
      </button>

      {/* Expanded body — GPU-cheap height via grid-rows (DESIGN.md §7) */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-layout ease-default",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line px-5 py-5">
            <p className="text-eyebrow text-text-faint">What they&apos;d automate</p>
            <p className="mt-1 whitespace-pre-wrap text-body text-text">
              {a.use_case}
            </p>

            <dl className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Answer
                label="Tools wanted"
                value={a.tools_wanted?.length ? a.tools_wanted.join(", ") : null}
              />
              <Answer label="Heard from" value={a.heard_from} />
              <Answer label="Role" value={a.role_title} />
              <Answer label="Company" value={a.company} />
              <Answer
                label="Website"
                value={
                  a.website_url ? (
                    <a
                      href={a.website_url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-accent hover:text-accent-hover"
                    >
                      {a.website_url}
                    </a>
                  ) : null
                }
              />
              <Answer label="Socials" value={a.socials} />
            </dl>

            {a.reviewed_at && (
              <p className="text-mono mt-5 text-text-faint">
                reviewed {formatShipDate(a.reviewed_at)}
              </p>
            )}

            {error && (
              <p className="mt-4 text-small text-danger" role="alert">
                {error}
              </p>
            )}

            {/* Phase 3: setting status only. Membership on approval is Phase 4. */}
            {a.status === "pending" ? (
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  pending={pending}
                  onClick={() => review("approved")}
                >
                  Approve
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  pending={pending}
                  onClick={() => review("waitlisted")}
                >
                  Waitlist
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  pending={pending}
                  onClick={() => review("rejected")}
                >
                  Reject
                </Button>
              </div>
            ) : (
              <p className="mt-5 text-small text-text-muted">
                Reviewed. Re-deciding lands with the fuller admin tools in a later
                phase.
              </p>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
