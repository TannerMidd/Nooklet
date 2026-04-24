import Link from "next/link";
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
            This route is available only until the first admin account exists.
            After bootstrap completes, the flow closes and the application falls
            back to local login.
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <Panel
          eyebrow="Bootstrap workflow"
          title="One-time setup"
          description="Administrator creation is validated server-side, written to SQLite through Drizzle, and recorded in the audit log."
        >
          <BootstrapForm />
        </Panel>

        <div className="space-y-6">
          <Panel
            eyebrow="Acceptance"
            title="Rules locked by the behavior matrix"
          >
            <ul className="space-y-3 text-sm leading-6 text-foreground">
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Fresh installs expose an explicit bootstrap flow once.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                The route closes immediately after the first admin account exists.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                No default password or hidden fallback path exists.
              </li>
            </ul>
          </Panel>

          <Panel
            eyebrow="Next route"
            title="What happens after bootstrap"
            description="Once the first admin exists, this page redirects to local login and the authenticated workspace becomes available."
          >
            <Link
              href="/login"
              className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
            >
              Go to local login
            </Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}

