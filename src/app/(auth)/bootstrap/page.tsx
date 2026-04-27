import { redirect } from "next/navigation";

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
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Identity foundation
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            Create the first administrator
          </h1>
          <p className="text-base leading-7 text-muted">
            Set up the first account for this Recommendarr install.
          </p>
        </div>
      </header>

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

