import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AccessMatrix } from "@/components/admin/access-matrix";
import { UserControls } from "@/components/admin/user-controls";
import { StatusPill } from "@/components/tools/status-pill";
import { requireAdmin } from "@/lib/access";
import { getUserDetail } from "@/lib/admin-users";
import { isMembershipActive } from "@/lib/member";
import { formatShipDate } from "@/lib/format";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const detail = await getUserDetail(id);
  if (!detail) notFound();

  const { profile, membership, plan, application, tools } = detail;
  const active = isMembershipActive(membership);
  const isAdmin = profile.role === "admin";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-2 text-small text-text-muted transition-colors duration-micro ease-default hover:text-text"
        >
          <ArrowLeft aria-hidden className="size-4" strokeWidth={1.5} />
          All users
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-h1">{profile.full_name ?? profile.email}</h1>
          {isAdmin && <StatusPill label="admin" tone="accent" dot={false} />}
          {profile.is_suspended && (
            <StatusPill label="suspended" tone="danger" dot={false} />
          )}
          {active ? (
            <StatusPill label="active member" tone="live" dot={false} />
          ) : membership ? (
            <StatusPill label={membership.status} tone="faint" dot={false} />
          ) : (
            <span className="text-small text-text-faint">applicant</span>
          )}
        </div>
        <p className="text-mono mt-1 text-text-faint">{profile.email}</p>
      </div>

      {/* Two columns on desktop: controls + application on the left, the access
          matrix on the right (it's the important one, so it gets the room). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        <div className="flex flex-col gap-6">
          <UserControls
            userId={profile.id}
            email={profile.email}
            hasActiveMembership={active}
            suspended={profile.is_suspended}
          />

          <div className="rounded-md border border-line bg-surface p-5">
            <h2 className="text-h3">Membership</h2>
            <dl className="mt-3 flex flex-col gap-2 text-small">
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Plan</dt>
                <dd className="text-text">{plan?.name ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Source</dt>
                <dd className="text-text">{membership?.source ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-text-muted">Expires</dt>
                <dd className="text-text">
                  {membership?.expires_at
                    ? formatShipDate(membership.expires_at)
                    : membership
                      ? "never"
                      : "—"}
                </dd>
              </div>
            </dl>
          </div>

          {application && (
            <div className="rounded-md border border-line bg-surface p-5">
              <h2 className="text-h3">Application</h2>
              <p className="mt-2 text-small text-text-muted">
                {application.use_case}
              </p>
              <dl className="mt-3 flex flex-col gap-1 text-small">
                {application.willingness_to_pay && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-text-muted">Would pay</dt>
                    <dd className="text-mono text-text">
                      {application.willingness_to_pay}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-text-muted">Status</dt>
                  <dd className="text-text">{application.status}</dd>
                </div>
              </dl>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-h2">Tool access</h2>
          <p className="mt-1 text-small text-text-muted">
            {tools.length} tools. Flip a switch to grant one to this user.
          </p>
          <div className="mt-4">
            <AccessMatrix
              userId={profile.id}
              tools={tools}
              isAdmin={isAdmin}
              suspended={profile.is_suspended}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
