import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
import { listUsersOverview } from "@/modules/admin/queries/list-users-overview";
import { requireAdminSession } from "@/modules/identity-access/workflows/require-admin-session";

import { CreateUserForm } from "./create-user-form";
import { UserManagementRow } from "./user-management-row";

function formatDate(value: Date | null) {
  if (!value) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const [session, users] = await Promise.all([
    requireAdminSession(),
    listUsersOverview(),
  ]);

  const activeUsers = users.filter((user) => !user.isDisabled).length;
  const administrators = users.filter((user) => user.role === "admin" && !user.isDisabled).length;

  return (
    <div className="nk-enter space-y-7">
      <PageHeader
        eyebrow="Administration"
        title="Users & access"
        description="Create accounts and review exactly who can change shared Nooklet configuration."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total accounts" value={users.length} />
        <StatCard label="Active accounts" value={activeUsers} />
        <StatCard label="Active administrators" value={administrators} />
      </div>

      <div className="rounded-2xl border border-accent/20 bg-accent/[0.06] p-5 text-sm leading-6 text-foreground">
        <p className="font-semibold">Shared configuration is instance-wide</p>
        <p className="mt-1 text-muted">
          Administrators can change storage, download clients, indexers, and every user account.
          Keep at least one active administrator, and grant this role only to people you trust.
        </p>
      </div>

      <Panel
        eyebrow="Create account"
        title="Invite someone to Nooklet"
        description="Create an account with a temporary password. You can change its role or disable it later without deleting its history."
      >
        <CreateUserForm />
      </Panel>

      <Panel
        eyebrow="Access inventory"
        title="Accounts"
        description="Open an account to review role, sign-in access, or reset its password. Your own account settings stay separate."
      >
        <ul className="grid gap-4 lg:grid-cols-2">
          {users.map((user) => {
            const isCurrentAdmin = user.id === session.user.id;

            return (
              <li
                key={user.id}
                className="flex min-w-0 flex-col rounded-2xl border border-cream/[0.08] bg-cream/[0.025] p-4 sm:p-5"
              >
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-heading text-[21px] text-foreground">
                        {user.displayName}
                      </h3>
                      {isCurrentAdmin ? <Badge variant="accent-cool">You</Badge> : null}
                    </div>
                    <p className="mt-1 break-all text-sm text-muted">{user.email}</p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Badge variant={user.role === "admin" ? "accent" : "neutral"}>
                      {user.role === "admin" ? "Administrator" : "User"}
                    </Badge>
                    <Badge variant={user.isDisabled ? "wine" : "accent-cool"}>
                      {user.isDisabled ? "Disabled" : "Active"}
                    </Badge>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-6 text-muted">
                  {user.role === "admin"
                    ? "Can manage all shared instance settings and user access."
                    : "Can browse, request media, and manage personal preferences."}
                </p>

                <details className="mt-3 text-xs leading-5 text-muted">
                  <summary className="cursor-pointer rounded py-1 font-semibold text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
                    Account dates
                  </summary>
                  <dl className="mt-2 grid gap-1 rounded-lg border border-cream/[0.08] bg-cream/[0.02] p-3 sm:grid-cols-2">
                    <div>
                      <dt className="font-semibold text-foreground">Created</dt>
                      <dd>{formatDate(user.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-foreground">Last updated</dt>
                      <dd>{formatDate(user.updatedAt)}</dd>
                    </div>
                  </dl>
                </details>

                <div className="mt-auto pt-4">
                  <UserManagementRow currentAdminUserId={session.user.id} user={user} />
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
