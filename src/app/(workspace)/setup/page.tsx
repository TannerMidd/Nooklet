import { auth } from "@/auth";
import { SetupCenter } from "@/components/setup/setup-center";
import { PageHeader } from "@/components/ui/page-header";
import { getReadiness } from "@/modules/readiness/queries/get-readiness";
import { buildSetupChecklist, parseSetupCapability } from "@/components/setup/setup-checklist";
import { getYouTubeToolDiagnostics } from "@/modules/youtube/public";

export const dynamic = "force-dynamic";

export default async function SetupPage({
    searchParams,
}: { searchParams?: Promise<{ capability?: string; checkTools?: string }> } = {}) {
    const session = await auth();

    if (!session?.user?.id) {
        return null;
    }

    const params = await searchParams;
    const capability = parseSetupCapability(params?.capability);
    const [readiness, youtubeTools] = await Promise.all([
        getReadiness(session.user.id),
        capability === "youtube" && params?.checkTools === "1"
            ? getYouTubeToolDiagnostics()
            : Promise.resolve(null),
    ]);

    return (
        <div className="nk-enter space-y-7">
            <PageHeader
                eyebrow="Resumable setup"
                title="Setup Center"
                description="One place to verify what works, understand what is optional, and continue exactly where you left off."
            />
            <SetupCenter
                evaluation={readiness.evaluation}
                canManageInstance={session.user.role === "admin"}
                capability={capability}
                steps={buildSetupChecklist(readiness, capability, youtubeTools?.ready ?? null)}
            />
        </div>
    );
}
