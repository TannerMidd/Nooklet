import { getBackgroundWorkerReadiness } from "@/lib/jobs/worker-readiness";
import { listIndexerSettings } from "@/modules/indexers/queries/list-indexer-settings";
import { listNotificationChannels } from "@/modules/notifications/queries/list-notification-channels";
import { listConnectionSummaries } from "@/modules/service-connections/workflows/list-connection-summaries";
import { getStorageOverview } from "@/modules/storage/queries/get-storage-overview";
import { getWatchHistoryOverview } from "@/modules/watch-history/queries/get-watch-history-overview";

import { evaluateReadiness } from "../evaluate-readiness";

export async function getReadiness(userId: string) {
  const [services, indexers, storage, watchHistory, notifications] = await Promise.all([
    listConnectionSummaries(userId),
    listIndexerSettings(userId),
    getStorageOverview(userId),
    getWatchHistoryOverview(userId),
    listNotificationChannels(userId),
  ]);
  const worker = getBackgroundWorkerReadiness();

  const evaluation = evaluateReadiness({
    services: services.map(({ serviceType, status }) => ({ serviceType, status })),
    indexers: indexers.map((indexer) => ({
      status: indexer.status,
      isEnabled: indexer.isEnabled,
      mediaTypes: Array.from(new Set(indexer.categories.map((category) => category.mediaType))),
    })),
    destinations: storage.libraryDestinations.map((destination) => ({
      mediaType: destination.mediaType,
      reachable: destination.live && destination.readable,
      writable: destination.writable,
    })),
    downloadWorkspace: {
      reachable: storage.downloadWorkspace.reachable,
      writable: storage.downloadWorkspace.writable,
      availableForNewDownloadsBytes: storage.downloadWorkspace.availableForNewDownloadsBytes,
    },
    worker: {
      responsive: worker.responsive,
      degraded: worker.degraded,
    },
    watchHistory: {
      sourceCount: watchHistory.sources.length,
      itemCount: watchHistory.totalCount,
    },
    notifications: {
      configuredCount: notifications.length,
      enabledCount: notifications.filter((channel) => channel.isEnabled).length,
    },
  });

  return {
    evaluation,
    storage,
    services,
    indexers,
    watchHistory,
    notifications,
    worker,
  };
}
