import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { StatCard } from "@/components/ui/stat-card";
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
      <PageHeader eyebrow="User settings" title="Account" />

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
            <div className="space-y-3">
              <StatCard label="Email" value={user?.email ?? session.user.email} />
              <StatCard label="Role" value={session.user.role} />
              <StatCard label="Status" value={user?.isDisabled ? "Disabled" : "Active"} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
