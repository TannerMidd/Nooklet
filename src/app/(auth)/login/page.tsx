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
          Welcome back
        </p>
        <div className="mt-4 max-w-3xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            Sign in
          </h1>
          <p className="text-base leading-7 text-muted">
            Use your Recommendarr account to access saved recommendations,
            service connections, and library actions.
          </p>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.05fr,0.95fr]">
        <Panel
          eyebrow="Account access"
          title="Local sign in"
          description="Sign in with the account created during bootstrap or by an administrator."
        >
          <LoginForm showBootstrapSuccess={resolvedSearchParams?.bootstrapped === "1"} />
        </Panel>

        <div className="space-y-6">
          <Panel
            eyebrow="Security"
            title="What happens here"
          >
            <ul className="space-y-3 text-sm leading-6 text-foreground">
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                This screen only handles sign-in and session creation.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Protected workspace routes reject unauthenticated access cleanly.
              </li>
              <li className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                Password verification happens on the server and never leaves the login flow.
              </li>
            </ul>
          </Panel>

          <Panel
            eyebrow="Workspace access"
            title="After you sign in"
            description="The authenticated workspace gives you recommendation flows, history browsing, account settings, connections, and admin tools when your role allows it."
          />
        </div>
      </div>
    </div>
  );
}

