import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Panel } from "@/components/ui/panel";
import { getBootstrapStatus } from "@/modules/identity-access/workflows/bootstrap-status";

import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams?: Promise<{
    bootstrapped?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const [session, bootstrapStatus, resolvedSearchParams] = await Promise.all([
    auth(),
    getBootstrapStatus(),
    searchParams,
  ]);

  if (session?.user) {
    redirect("/tv");
  }

  if (bootstrapStatus.isOpen) {
    redirect("/bootstrap");
  }

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          Identity foundation
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            Local login
          </h1>
          <p className="text-base leading-7 text-muted">
            Credentials auth now sits behind a dedicated workflow, backed by the
            SQLite user store and clean route guards for the workspace.
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Panel
          eyebrow="Auth.js credentials"
          title="Sign in"
          description="Local sessions are handled through Auth.js using the user records created during bootstrap."
        >
          <LoginForm showBootstrapSuccess={resolvedSearchParams?.bootstrapped === "1"} />
        </Panel>

        <div className="space-y-6">
          <Panel
            eyebrow="Guardrails"
            title="What this slice covers"
          >
            <ul className="space-y-3 text-sm leading-6 text-foreground">
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Local sign-in is separate from account settings, admin actions, and service setup.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Workspace routes reject unauthenticated access cleanly.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Password verification stays inside the identity-access and users modules.
              </li>
            </ul>
          </Panel>

          <Panel
            eyebrow="Next steps"
            title="What builds on top of this"
            description="The next slice can layer admin role guards, account password changes, and connection setup on this foundation without reshaping the routes."
          />
        </div>
      </div>
    </div>
  );
}

