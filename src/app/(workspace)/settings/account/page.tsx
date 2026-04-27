import { auth } from "@/auth";
import { Panel } from "@/components/ui/panel";
import { getAccountUser } from "@/modules/users/queries/get-account-user";

import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function AccountSettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const user = await getAccountUser(session.user.id);

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
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Panel
          eyebrow="Password change"
          title="Update your password"
          description="Use your current password to set a new one for this account."
        >
          <ChangePasswordForm />
        </Panel>

        <div className="space-y-6">
          <Panel
            eyebrow="Signed-in account"
            title={user?.displayName ?? session.user.name ?? "Account"}
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
        </div>
      </div>
    </div>
  );
}
