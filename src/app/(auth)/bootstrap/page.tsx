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
        eyebrow="Welcome in"
        title="Create the first administrator"
        description="Set up the first account for this Nooklet install — you'll use it to sign in and invite anyone else."
      />

      <div>
        <Panel
          eyebrow="First account"
          title="One-time setup"
          description="Pick the admin account you'll use to sign in."
        >
          <BootstrapForm />
        </Panel>
      </div>
    </div>
  );
}

