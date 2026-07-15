import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";

import { StatusPill } from "@/components/tools/status-pill";
import { Input } from "@/components/ui/input";
import { requireAdmin } from "@/lib/access";
import { getUsersForAdmin } from "@/lib/admin-users";
import { isMembershipActive } from "@/lib/member";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { q } = await searchParams;
  const users = await getUsersForAdmin(q);

  return (
    <div className="flex flex-col gap-6">
      {/* Search (GET form so it's shareable + back-button friendly) */}
      <form className="relative max-w-md">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-faint"
          strokeWidth={1.5}
        />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search name or email…"
          className="pl-9"
          aria-label="Search users"
        />
      </form>

      {users.length === 0 ? (
        <p className="text-small text-text-faint">
          {q ? `No users match "${q}".` : "No users yet."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border border-line">
          {/* Header — hidden on mobile, where rows become cards (§9) */}
          <div className="hidden grid-cols-[1fr_auto_auto_auto] gap-4 border-b border-line bg-surface px-5 py-3 md:grid">
            <span className="text-eyebrow text-text-faint">User</span>
            <span className="text-eyebrow text-text-faint">Role</span>
            <span className="text-eyebrow text-text-faint">Membership</span>
            <span className="w-4" />
          </div>

          {users.map(({ profile, membership }) => {
            const active = isMembershipActive(membership);
            return (
              <Link
                key={profile.id}
                href={`/admin/users/${profile.id}`}
                className="flex items-center gap-4 border-b border-line px-5 py-4 transition-colors duration-micro ease-default last:border-0 hover:bg-elevated md:grid md:grid-cols-[1fr_auto_auto_auto]"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-body-strong text-text">
                      {profile.full_name ?? "—"}
                    </span>
                    {profile.is_suspended && (
                      <StatusPill label="suspended" tone="danger" dot={false} />
                    )}
                  </div>
                  <p className="text-mono truncate text-text-faint">{profile.email}</p>
                </div>

                <span className="text-mono hidden self-center text-text-muted md:inline">
                  {profile.role}
                </span>

                <span className="hidden self-center md:inline">
                  {active ? (
                    <StatusPill label="active" tone="live" dot={false} />
                  ) : membership ? (
                    <StatusPill label={membership.status} tone="faint" dot={false} />
                  ) : (
                    <span className="text-small text-text-faint">applicant</span>
                  )}
                </span>

                <ChevronRight
                  aria-hidden
                  className="hidden size-4 self-center text-text-faint md:inline"
                  strokeWidth={1.5}
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
