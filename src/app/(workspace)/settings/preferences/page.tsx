import { auth } from "@/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { formatLanguagePreference } from "@/modules/preferences/language-preferences";
import { getUserPreferences } from "@/modules/preferences/queries/get-user-preferences";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";
import {
  getWatchHistorySourceDefinition,
  watchHistorySourceDefinitions,
} from "@/modules/watch-history/source-definitions";
import { getWatchHistoryOverview } from "@/modules/watch-history/queries/get-watch-history-overview";

import { PreferencesForm } from "./preferences-form";

export const dynamic = "force-dynamic";

type PreferencesSettingsPageProps = {
  searchParams?: Promise<{
    updated?: string;
  }>;
};

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

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
  const hasPersistedUpdate = preferences.updatedAt.getTime() > 0;
  const selectedSourceNames = preferences.watchHistorySourceTypes
    .map((sourceType) => getWatchHistorySourceDefinition(sourceType).displayName)
    .join(", ");
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
        : connectionSummaryByType.get(definition.sourceType) ?? null;

    return {
      sourceType: definition.sourceType,
      label: definition.displayName,
      description: definition.description,
      statusMessage:
        syncedSource?.statusMessage ??
        (definition.sourceType === "manual"
          ? "Manual imports stay available even when no provider-backed history source is configured yet."
          : connectionSummary?.statusMessage ?? "Not connected or synced yet."),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="User preferences" title="Preferences" />

      {wasUpdated ? (
        <p className="rounded-[24px] border border-accent/20 bg-accent/10 px-5 py-4 text-sm leading-6 text-foreground">
          Preferences saved. Current values and recommendation defaults have been refreshed.
        </p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.12fr,0.88fr]">
        <Panel
          eyebrow="Saved defaults"
          title="Preference controls"
          description="These settings control the defaults used for new recommendation requests and history browsing."
        >
          <PreferencesForm
            preferences={preferences}
            availableWatchHistorySources={availableWatchHistorySources}
          />
        </Panel>

        <div className="space-y-6">
          <Panel
            eyebrow="Current settings"
            title="Saved values"
          >
            <div className="space-y-3 text-sm leading-6 text-foreground">
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Default media mode:</span> {preferences.defaultMediaMode}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Default result count:</span> {preferences.defaultResultCount}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Library sample size:</span> {preferences.libraryTasteSampleSize}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Language preference:</span> {formatLanguagePreference(preferences.languagePreference)}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Watch-history only:</span> {preferences.watchHistoryOnly ? "Enabled" : "Disabled"}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Selected history sources:</span> {selectedSourceNames}
              </div>
              <div className="rounded-2xl border border-line/70 bg-panel-strong/70 px-4 py-3">
                <span className="font-medium">Last updated:</span>{" "}
                {hasPersistedUpdate ? formatDate(preferences.updatedAt) : "Never"}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
