import Link from "next/link";

import { auth } from "@/auth";
import { LibraryBrowserGrid } from "@/components/library/library-browser-grid";
import { LibrarySearchWorkspace } from "@/components/library/library-search-workspace";
import { LibraryTabs, type LibraryTabsTab } from "@/components/library/library-tabs";
import { Panel } from "@/components/ui/panel";
import { type LibraryManagerServiceType } from "@/modules/service-connections/adapters/add-library-item";
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
};

export async function LibraryBrowserWorkspace({
  serviceType,
  routePath,
  title,
  description,
  directSearchTitle,
  directSearchDescription,
  searchQuery,
}: LibraryBrowserWorkspaceProps) {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const serviceLabel = serviceType === "sonarr" ? "Sonarr" : "Radarr";
  const collectionLabel = serviceType === "sonarr" ? "series" : "movies";

  const [connectionSummaries, libraryResult] = await Promise.all([
    listConnectionSummaries(session.user.id),
    listLibraryCollectionForUser(session.user.id, serviceType),
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
            className="inline-flex rounded-2xl border border-line bg-panel-strong px-4 py-3 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panel"
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
            ? "Filter the full series list, then open a series to toggle which seasons Sonarr should monitor."
            : "Filter the full movie list to confirm coverage; per-item Radarr controls land in a follow-up."
        }
      >
        {libraryResult.serviceType === "sonarr" ? (
          <LibraryBrowserGrid
            serviceType="sonarr"
            items={libraryResult.items}
            returnTo={routePath}
          />
        ) : (
          <LibraryBrowserGrid
            serviceType="radarr"
            items={libraryResult.items}
            returnTo={routePath}
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
  ];

  const defaultTabId = searchQuery && searchQuery.trim().length > 0 ? "search" : "library";

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] border border-line/80 bg-panel/90 px-6 py-8 shadow-soft backdrop-blur md:px-8 xl:px-10">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-accent">
          {serviceLabel} workspace
        </p>
        <div className="mt-4 max-w-4xl space-y-3">
          <h1 className="font-heading text-4xl leading-tight text-foreground md:text-5xl">
            {title}
          </h1>
          <p className="max-w-3xl text-base leading-7 text-muted">{description}</p>
        </div>
        {connectionSummary?.status === "verified" ? null : (
          <p className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {connectionSummary?.statusMessage ?? `Configure ${serviceLabel} from the connections page to use this workspace.`}
          </p>
        )}
      </header>

      <LibraryTabs tabs={tabs} defaultTabId={defaultTabId} />
    </div>
  );
}
