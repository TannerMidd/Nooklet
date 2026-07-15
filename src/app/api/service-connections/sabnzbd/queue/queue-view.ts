import "server-only";

import { getEngineQueueSnapshot } from "@/modules/download-engine/queries/get-engine-queue-snapshot";
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";
import {
  getActiveSabnzbdQueue,
} from "@/modules/service-connections/workflows/get-active-sabnzbd-queue";

import {
  type ActiveDownloadQueueState,
  type DownloadQueueSourceState,
} from "./contract";
import { combineQueueSnapshots } from "./queue-view-core";

const legacyQueueDeadlineMs = 3_000;

function aggregateConnectionStatus(sources: DownloadQueueSourceState[]) {
  if (sources.some((source) => source.connectionStatus === "verified")) {
    return "verified" as const;
  }

  if (sources.some((source) => source.connectionStatus === "error")) {
    return "error" as const;
  }

  if (sources.some((source) => source.connectionStatus === "configured")) {
    return "configured" as const;
  }

  return "disconnected" as const;
}

export async function getActiveDownloadQueueView(userId: string): Promise<ActiveDownloadQueueState> {
  const [engineSource, sabnzbdState] = await Promise.all([
    findServiceConnectionByType(userId, "usenet-server").then(async (usenetServer) => {
      if (!usenetServer?.connection.baseUrl) {
        return null;
      }

      const snapshot = await getEngineQueueSnapshot(userId);
      return {
        source: "engine",
        label: "Built-in downloader",
        connectionStatus: usenetServer.connection.status === "error" ? "error" : "verified",
        statusMessage: usenetServer.connection.status === "error"
          ? usenetServer.connection.statusMessage ?? "The built-in downloader needs attention."
          : snapshot.activeQueueCount > 0
            ? `${snapshot.activeQueueCount} active built-in download${snapshot.activeQueueCount === 1 ? "" : "s"}.`
            : "No active built-in downloads right now.",
        snapshot,
      } satisfies DownloadQueueSourceState;
    }),
    getActiveSabnzbdQueue(userId, { timeoutMs: legacyQueueDeadlineMs }),
  ]);
  const sources: DownloadQueueSourceState[] = [];

  if (engineSource) {
    sources.push(engineSource);
  }

  if (sabnzbdState.connectionStatus !== "disconnected") {
    sources.push({
      source: "sabnzbd",
      label: "Legacy SABnzbd",
      ...sabnzbdState,
    });
  }

  if (sources.length === 0) {
    return {
      connectionStatus: "disconnected",
      statusMessage:
        "Add a usenet server under Settings → Connections to download releases with the built-in downloader.",
      snapshot: null,
      sources: [],
    };
  }

  return {
    connectionStatus: aggregateConnectionStatus(sources),
    statusMessage: sources.map((source) => `${source.label}: ${source.statusMessage}`).join(" "),
    snapshot: combineQueueSnapshots(sources),
    sources,
  };
}
