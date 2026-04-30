import { redirect } from "next/navigation";

import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getBootstrapStatus } from "@/modules/identity-access/workflows/bootstrap-status";

import { BootstrapForm } from "./bootstrap-form";

export const dynamic = "force-dynamic";

export default async function BootstrapPage() {
  const bootstrapStatus = await getBootstrapStatus();

  if (!bootstrapStatus.isOpen) {
    redirect("/login");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Identity foundation"
        title="Create the first administrator"
        description="Set up the first account for this Nooklet install."
      />

      <div>
        <Panel
          eyebrow="First account"
          title="One-time setup"
          description="Create the admin account you will use to sign in."
        >
          <BootstrapForm />
        </Panel>
      </div>
    </div>
  );
}

