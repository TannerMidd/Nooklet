import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { getUserPreferences } from "@/modules/preferences/queries/get-user-preferences";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";
import { watchHistorySourceDefinitions } from "@/modules/watch-history/source-definitions";
import { getWatchHistoryOverview } from "@/modules/watch-history/queries/get-watch-history-overview";

import { PreferencesForm } from "./preferences-form";

export const dynamic = "force-dynamic";

type PreferencesSettingsPageProps = {
    searchParams?: Promise<{
        updated?: string;
    }>;
};

export default async function PreferencesSettingsPage({
    searchParams,
}: PreferencesSettingsPageProps) {
    const [session, resolvedSearchParams] = await Promise.all([auth(), searchParams]);

    if (!session?.user?.id) {
        return null;
    }

    const [preferences, watchHistoryOverview, connectionSummaries] = await Promise.all([
        getUserPreferences(session.user.id),
        getWatchHistoryOverview(session.user.id),
        listConnectionSummaries(session.user.id),
    ]);
    const wasUpdated = resolvedSearchParams?.updated === "1";
    const historySourceByType = new Map(
        watchHistoryOverview.sources.map((source) => [source.sourceType, source]),
    );
    const connectionSummaryByType = new Map(
        connectionSummaries.map((summary) => [summary.serviceType, summary]),
    );
    const availableWatchHistorySources = watchHistorySourceDefinitions.map((definition) => {
        const syncedSource = historySourceByType.get(definition.sourceType) ?? null;
        const connectionSummary =
            definition.sourceType === "manual"
                ? null
                : (connectionSummaryByType.get(definition.sourceType) ?? null);

        return {
            sourceType: definition.sourceType,
            label: definition.displayName,
            description: definition.description,
            statusMessage:
                syncedSource?.statusMessage ??
                (definition.sourceType === "manual"
                    ? "Manual imports stay available even when no provider-backed history source is configured yet."
                    : (connectionSummary?.statusMessage ?? "Not connected or synced yet.")),
        };
    });

    return (
        <div className="nk-enter space-y-7">
            <PageHeader eyebrow="Defaults &amp; filters" title="Preferences" />

            {wasUpdated ? (
                <p className="rounded-lg border border-accent/30 bg-accent/10 px-5 py-4 text-sm leading-6 text-foreground">
                    Preferences saved. Current values and recommendation defaults have been
                    refreshed.
                </p>
            ) : null}

            <Panel
                eyebrow="Personal defaults"
                title="Recommendation and history preferences"
                description="Start with the common choices. Technical AI tuning remains optional and should only be changed deliberately."
            >
                <PreferencesForm
                    preferences={preferences}
                    availableWatchHistorySources={availableWatchHistorySources}
                />
            </Panel>
        </div>
    );
}
