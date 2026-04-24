import { Panel } from "@/components/ui/panel";
import { requireAdminSession } from "@/modules/identity-access/workflows/require-admin-session";
import { listUsersOverview } from "@/modules/admin/queries/list-users-overview";

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

  const disabledUsers = users.filter((user) => user.isDisabled).length;

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Operations
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            Admin
          </h1>
          <p className="text-base leading-7 text-muted">
            This route is now server-guarded for administrators and exposes the
            first operational view: current user inventory and account state.
          </p>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel eyebrow="Active admin" title={session.user.name ?? session.user.email ?? "Admin"}>
          <div className="space-y-3 text-sm leading-6 text-foreground">
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Role:</span> {session.user.role}
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Total users:</span> {users.length}
            </div>
            <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              <span className="font-medium">Disabled users:</span> {disabledUsers}
            </div>
          </div>
        </Panel>

        <Panel
          eyebrow="Current scope"
          title="Operational foundation"
          description="This slice establishes the protected surface and a typed user listing. Role mutation, resets, and audit browsing can layer on next without reshaping the route."
          className="lg:col-span-2"
        >
          <ul className="grid gap-3 text-sm leading-6 text-foreground md:grid-cols-3">
            <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              Admin-only access is enforced on the server.
            </li>
            <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              User inventory is read from the normalized users table.
            </li>
            <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
              Sensitive account changes already emit audit events.
            </li>
          </ul>
        </Panel>
      </div>

      <Panel
        eyebrow="User inventory"
        title="Accounts"
        description="This view stays admin-owned. Self-service profile and password changes remain on the account route."
      >
        <div className="overflow-hidden rounded-[24px] border border-line/70">
          <table className="min-w-full border-collapse text-left text-sm text-foreground">
            <thead className="bg-panel-strong/80 text-xs uppercase tracking-[0.2em] text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">User</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-t border-line/60 bg-panel/80">
                  <td className="px-4 py-4 align-top">
                    <p className="font-medium text-foreground">{user.displayName}</p>
                    <p className="mt-1 text-muted">{user.email}</p>
                  </td>
                  <td className="px-4 py-4 align-top">{user.role}</td>
                  <td className="px-4 py-4 align-top">
                    {user.isDisabled ? "Disabled" : "Active"}
                  </td>
                  <td className="px-4 py-4 align-top text-muted">
                    {formatDate(user.createdAt)}
                  </td>
                  <td className="px-4 py-4 align-top text-muted">
                    {formatDate(user.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}