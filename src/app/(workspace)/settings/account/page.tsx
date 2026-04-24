import { auth } from "@/auth";
import { Panel } from "@/components/ui/panel";
import { findUserById } from "@/modules/users/repositories/user-repository";

import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const user = await findUserById(session.user.id);

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          User settings
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            Account
          </h1>
          <p className="text-base leading-7 text-muted">
            Self-service account changes stay separate from admin-owned user
            management. This route now supports a scoped password change flow
            with current-password verification.
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Panel
          eyebrow="Password change"
          title="Update your password"
          description="Validation and hashing stay inside the users and identity-access modules rather than inside the route component."
        >
          <ChangePasswordForm />
        </Panel>

        <div className="space-y-6">
          <Panel
            eyebrow="Signed-in account"
            title={user?.displayName ?? session.user.name ?? "Account"}
            description="This view is intentionally narrow. Admin role changes, account disabling, and user listing stay on the admin surface."
          >
            <div className="space-y-3 text-sm leading-6 text-foreground">
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Email:</span> {user?.email ?? session.user.email}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Role:</span> {session.user.role}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Status:</span> {user?.isDisabled ? "Disabled" : "Active"}
              </div>
            </div>
          </Panel>

          <Panel
            eyebrow="Boundary"
            title="What stays out of this route"
          >
            <ul className="space-y-3 text-sm leading-6 text-foreground">
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Admin-owned role changes and user lifecycle controls.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Service setup and provider credentials.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Preference and history-filter management.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
