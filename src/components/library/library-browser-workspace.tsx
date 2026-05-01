import Link from "next/link";

import { auth } from "@/auth";
import { ArrIndexersPanel } from "@/components/library/arr-indexers-panel";
import { LibraryBrowserGrid } from "@/components/library/library-browser-grid";
import { LibrarySearchWorkspace } from "@/components/library/library-search-workspace";
import { LibraryTabs, type LibraryTabsTab } from "@/components/library/library-tabs";
import { PageHeader } from "@/components/ui/page-header";
import { Panel } from "@/components/ui/panel";
import { listArrIndexerSchemasForUser } from "@/modules/service-connections/queries/list-arr-indexer-schemas";
import { listArrIndexersForUser } from "@/modules/service-connections/queries/list-arr-indexers";
import { type LibraryManagerServiceType } from "@/modules/service-connections/types/library-manager";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";
import { listLibraryCollectionForUser } from "@/modules/service-connections/workflows/list-library-collection";

type LibraryBrowserWorkspaceProps = {
  serviceType: LibraryManagerServiceType;
  routePath: "/sonarr" | "/radarr";
  title: string;
  description: string;
  directSearchTitle: string;
  directSearchDescription: string;
  searchQuery?: string;
  autoOpenSeriesId?: number | null;
  autoOpenMode?: "season" | "episode";
};

export async function LibraryBrowserWorkspace({
  serviceType,
  routePath,
  title,
  description,
  directSearchTitle,
  directSearchDescription,
  searchQuery,
  autoOpenSeriesId,
  autoOpenMode,
}: LibraryBrowserWorkspaceProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const serviceLabel = serviceType === "sonarr" ? "Sonarr" : "Radarr";
  const collectionLabel = serviceType === "sonarr" ? "series" : "movies";

  const [connectionSummaries, libraryResult, indexersResult, indexerSchemasResult] = await Promise.all([
    listConnectionSummaries(session.user.id),
    listLibraryCollectionForUser(session.user.id, serviceType),
    listArrIndexersForUser(session.user.id, serviceType),
    listArrIndexerSchemasForUser(session.user.id, serviceType),
  ]);

  const connectionSummary =
    connectionSummaries.find((summary) => summary.serviceType === serviceType) ?? null;

  const libraryTabContent = (() => {
    if (!libraryResult.ok) {
      return (
        <Panel
          eyebrow={`${serviceLabel} library`}
          title={`Connect ${serviceLabel} to browse your ${collectionLabel}`}
          description={libraryResult.message}
        >
          <Link
            href="/settings/connections"
            className="inline-flex rounded-lg border border-line/70 bg-panel-strong/70 px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel-raised/70"
          >
            Manage connections
          </Link>
        </Panel>
      );
    }

    return (
      <Panel
        eyebrow={`${serviceLabel} library`}
        title={`Browse your ${serviceLabel} ${collectionLabel}`}
        description={
          serviceType === "sonarr"
            ? "Filter your series and open a show to adjust monitoring."
            : "Filter your movies and open a title for library actions."
        }
      >
        {libraryResult.serviceType === "sonarr" ? (
          <LibraryBrowserGrid
            serviceType="sonarr"
            items={libraryResult.items}
            returnTo={routePath}
            qualityProfiles={connectionSummary?.qualityProfiles ?? []}
            autoOpenSeriesId={autoOpenSeriesId ?? null}
            autoOpenMode={autoOpenMode ?? "season"}
          />
        ) : (
          <LibraryBrowserGrid
            serviceType="radarr"
            items={libraryResult.items}
            returnTo={routePath}
            qualityProfiles={connectionSummary?.qualityProfiles ?? []}
          />
        )}
      </Panel>
    );
  })();

  const tabs: LibraryTabsTab[] = [
    {
      id: "library",
      label: `${serviceLabel} library`,
      content: libraryTabContent,
    },
    {
      id: "search",
      label: "Direct search",
      content: (
        <LibrarySearchWorkspace
          serviceType={serviceType}
          routePath={routePath}
          title={directSearchTitle}
          description={directSearchDescription}
          searchQuery={searchQuery}
          omitHeader
        />
      ),
    },
    {
      id: "indexers",
      label: "Indexers",
      content: (
        <Panel
          eyebrow={`${serviceLabel} indexers`}
          title={`Manage ${serviceLabel} indexers`}
          description={`View, configure, and test the indexers attached to your ${serviceLabel} instance.`}
        >
          <ArrIndexersPanel
            serviceType={serviceType}
            serviceLabel={serviceLabel}
            routePath={routePath}
            indexers={indexersResult.ok ? indexersResult.items : []}
            schemas={indexerSchemasResult.ok ? indexerSchemasResult.items : []}
            loadError={indexersResult.ok ? undefined : indexersResult.message}
            schemaError={indexerSchemasResult.ok ? undefined : indexerSchemasResult.message}
          />
        </Panel>
      ),
    },
  ];

  const defaultTabId = searchQuery && searchQuery.trim().length > 0 ? "search" : "library";
  // Auto-opening a series modal implies the user wants the library tab regardless of any leftover query.
  const resolvedDefaultTabId =
    autoOpenSeriesId !== null && autoOpenSeriesId !== undefined ? "library" : defaultTabId;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${serviceLabel} workspace`} title={title} description={description}>
        {connectionSummary?.status === "verified" ? null : (
          <p className="mt-4 rounded-lg border border-highlight/25 bg-highlight/10 px-4 py-3 text-sm text-highlight">
            {connectionSummary?.statusMessage ?? `Configure ${serviceLabel} from the connections page to use this workspace.`}
          </p>
        )}
      </PageHeader>

      <LibraryTabs tabs={tabs} defaultTabId={resolvedDefaultTabId} />
    </div>
  );
}
