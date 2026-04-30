import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        eyebrow="Welcome back"
        title="Sign in"
        description="Settle back in — your saved recommendations, connections, and library actions are right where you left them."
      />

      <div>
        <Panel
          eyebrow="Account access"
          title="Local sign in"
          description="Sign in to pick up where you left off."
        >
          <LoginForm showBootstrapSuccess={resolvedSearchParams?.bootstrapped === "1"} />
        </Panel>
      </div>
    </div>
  );
}

