import { auth } from "@/auth";
import { SetupCenter } from "@/components/setup/setup-center";
import { PageHeader } from "@/components/ui/page-header";
import { getReadiness } from "@/modules/readiness/queries/get-readiness";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { evaluation } = await getReadiness(session.user.id);

  return (
    <div className="nk-enter space-y-7">
      <PageHeader
        eyebrow="Resumable setup"
        title="Setup Center"
        description="One place to verify what works, understand what is optional, and continue exactly where you left off."
      />
      <SetupCenter evaluation={evaluation} canManageInstance={session.user.role === "admin"} />
    </div>
  );
}
