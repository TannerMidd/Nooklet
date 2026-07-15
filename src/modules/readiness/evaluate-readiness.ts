import { type RecommendationMediaType, type ServiceConnectionType } from "@/lib/database/schema";

export const readinessCapabilityIds = [
  "discover",
  "recommendations",
  "movie-downloads",
  "tv-downloads",
  "storage",
  "worker",
  "watch-history",
  "notifications",
] as const;

export type ReadinessCapabilityId = (typeof readinessCapabilityIds)[number];
export type ReadinessStatus = "ready" | "needs-attention" | "optional";

export type ReadinessCapability = {
  id: ReadinessCapabilityId;
  title: string;
  status: ReadinessStatus;
  required: boolean;
  summary: string;
  details: string[];
  remediationHref: string;
  remediationLabel: string;
};

export type ReadinessEvaluationInput = {
  services: Array<{
    serviceType: ServiceConnectionType;
    status: "disconnected" | "configured" | "verified" | "error";
  }>;
  indexers: Array<{
    status: "configured" | "verified" | "error" | "disabled";
    isEnabled: boolean;
    mediaTypes: RecommendationMediaType[];
  }>;
  destinations: Array<{
    mediaType: RecommendationMediaType;
    reachable: boolean;
    writable: boolean;
  }>;
  downloadWorkspace: {
    reachable: boolean;
    writable: boolean;
    availableForNewDownloadsBytes: number | null;
  };
  worker: {
    responsive: boolean;
    degraded: boolean;
  };
  watchHistory: {
    sourceCount: number;
    itemCount: number;
  };
  notifications: {
    configuredCount: number;
    enabledCount: number;
  };
};

export type ReadinessEvaluation = {
  capabilities: ReadinessCapability[];
  readyForFirstRequest: boolean;
  setupComplete: boolean;
  completedCoreChecks: number;
  totalCoreChecks: number;
  progressPercent: number;
};

function capability(input: Omit<ReadinessCapability, "details"> & { details?: string[] }) {
  return { ...input, details: input.details ?? [] } satisfies ReadinessCapability;
}

export function evaluateReadiness(input: ReadinessEvaluationInput): ReadinessEvaluation {
  const serviceStatus = new Map(input.services.map((service) => [service.serviceType, service.status]));
  const verified = (serviceType: ServiceConnectionType) => serviceStatus.get(serviceType) === "verified";
  const tmdbReady = verified("tmdb");
  const aiReady = verified("ai-provider");
  const builtInDownloaderReady = verified("usenet-server");
  const legacyDownloaderReady = verified("sabnzbd");
  const downloaderReady = builtInDownloaderReady || legacyDownloaderReady;
  const workspaceReady = input.downloadWorkspace.reachable
    && input.downloadWorkspace.writable
    && input.downloadWorkspace.availableForNewDownloadsBytes !== null
    && input.downloadWorkspace.availableForNewDownloadsBytes > 0;
  const workerReady = input.worker.responsive && !input.worker.degraded;
  const indexerReady = (mediaType: RecommendationMediaType) => input.indexers.some(
    (indexer) => indexer.isEnabled
      && indexer.status === "verified"
      && indexer.mediaTypes.includes(mediaType),
  );
  const destinationReady = (mediaType: RecommendationMediaType) => input.destinations.some(
    (destination) => destination.mediaType === mediaType
      && destination.reachable
      && destination.writable,
  );
  const builtInStorageReady = !builtInDownloaderReady || legacyDownloaderReady || workspaceReady;

  const downloadCapability = (mediaType: RecommendationMediaType): ReadinessCapability => {
    const title = mediaType === "movie" ? "Movie downloads" : "TV downloads";
    const missing: string[] = [];
    if (!downloaderReady) missing.push("Connect either the built-in Usenet downloader or SABnzbd.");
    if (!indexerReady(mediaType)) missing.push(`Verify an indexer with ${mediaType === "movie" ? "movie" : "TV"} categories.`);
    if (!destinationReady(mediaType)) missing.push(`Add a reachable, writable ${mediaType === "movie" ? "movie" : "TV"} library destination.`);
    if (!builtInStorageReady) missing.push("Make the built-in download workspace writable and free enough space.");
    if (!workerReady) missing.push("Restore the background worker so downloads can be processed and imported.");
    const ready = missing.length === 0;
    const remediation = !downloaderReady
      ? { href: "/settings/connections", label: "Connect a downloader" }
      : !indexerReady(mediaType)
        ? { href: "/settings/indexers", label: "Configure indexers" }
        : !destinationReady(mediaType) || !builtInStorageReady
          ? { href: "/settings/storage", label: "Fix storage" }
          : !workerReady
            ? { href: "/health", label: "Diagnose worker" }
            : { href: "/search", label: "Find a title" };

    return capability({
      id: mediaType === "movie" ? "movie-downloads" : "tv-downloads",
      title,
      status: ready ? "ready" : "needs-attention",
      required: false,
      summary: ready
        ? `${title} can be searched, queued, processed, and imported.`
        : `${title} need ${missing.length} configuration ${missing.length === 1 ? "change" : "changes"}.`,
      details: missing,
      remediationHref: remediation.href,
      remediationLabel: remediation.label,
    });
  };

  const movieDownloads = downloadCapability("movie");
  const tvDownloads = downloadCapability("tv");
  const anyDestinationReady = destinationReady("movie") || destinationReady("tv");
  const anyIndexerReady = indexerReady("movie") || indexerReady("tv");
  const finalDestinationsHealthy = input.destinations.length > 0
    && input.destinations.every((destination) => destination.reachable && destination.writable);
  const workspaceRequired = !legacyDownloaderReady;
  const storageReady = (!workspaceRequired || workspaceReady) && finalDestinationsHealthy;

  const capabilities: ReadinessCapability[] = [
    capability({
      id: "discover",
      title: "Discover",
      status: tmdbReady ? "ready" : "needs-attention",
      required: true,
      summary: tmdbReady
        ? "Metadata search, posters, cast, trailers, and discovery rails are ready."
        : "Verify TMDB to browse and identify titles reliably.",
      remediationHref: "/settings/connections",
      remediationLabel: tmdbReady ? "Review metadata connection" : "Connect TMDB",
    }),
    capability({
      id: "recommendations",
      title: "Personal recommendations",
      status: aiReady && workerReady ? "ready" : "optional",
      required: false,
      summary: aiReady && workerReady
        ? "AI recommendations can run in the background."
        : "Optional: connect an AI provider for personalized movie and TV picks.",
      details: [
        ...(!aiReady ? ["No verified AI provider is available."] : []),
        ...(!workerReady ? ["The background worker is not healthy."] : []),
      ],
      remediationHref: "/settings/connections",
      remediationLabel: aiReady ? "Review AI provider" : "Connect AI provider",
    }),
    movieDownloads,
    tvDownloads,
    capability({
      id: "storage",
      title: "Storage",
      status: storageReady ? "ready" : "needs-attention",
      required: true,
      summary: storageReady
        ? "Download staging and final library destinations are reachable and writable."
        : "Download staging and final library storage need attention.",
      details: [
        ...(workspaceRequired && !workspaceReady
          ? ["The built-in download workspace is unreachable, read-only, or below its safety reserve."]
          : []),
        ...(input.destinations.length === 0 ? ["No final library destination is configured."] : []),
        ...(!finalDestinationsHealthy && input.destinations.length > 0
          ? ["One or more final library destinations are unreachable or read-only."]
          : []),
      ],
      remediationHref: "/settings/storage",
      remediationLabel: storageReady ? "Review storage" : "Fix storage",
    }),
    capability({
      id: "worker",
      title: "Background worker",
      status: workerReady ? "ready" : "needs-attention",
      required: true,
      summary: workerReady
        ? "Scheduled work and download processing are responding normally."
        : input.worker.responsive
          ? "The worker is running but its latest maintenance pass reported an error."
          : "The worker is not reporting recent activity.",
      remediationHref: "/health",
      remediationLabel: workerReady ? "View worker health" : "Diagnose worker",
    }),
    capability({
      id: "watch-history",
      title: "Watch history",
      status: input.watchHistory.sourceCount > 0 || input.watchHistory.itemCount > 0 ? "ready" : "optional",
      required: false,
      summary: input.watchHistory.itemCount > 0
        ? `${input.watchHistory.itemCount} watched ${input.watchHistory.itemCount === 1 ? "title is" : "titles are"} available for personalization.`
        : "Optional: import watched titles to avoid repeats and improve recommendations.",
      remediationHref: "/settings/history",
      remediationLabel: "Manage history sources",
    }),
    capability({
      id: "notifications",
      title: "Notifications",
      status: input.notifications.enabledCount > 0 ? "ready" : "optional",
      required: false,
      summary: input.notifications.enabledCount > 0
        ? `${input.notifications.enabledCount} notification ${input.notifications.enabledCount === 1 ? "channel is" : "channels are"} enabled.`
        : "Optional: receive request, download, import, and failure updates outside Nooklet.",
      details: input.notifications.configuredCount > 0 && input.notifications.enabledCount === 0
        ? ["Notification channels exist, but none are enabled."]
        : [],
      remediationHref: "/settings/notifications",
      remediationLabel: "Manage notifications",
    }),
  ];

  const coreChecks = [tmdbReady, workerReady, downloaderReady, anyIndexerReady, anyDestinationReady];
  const completedCoreChecks = coreChecks.filter(Boolean).length;
  const readyForFirstRequest = movieDownloads.status === "ready" || tvDownloads.status === "ready";

  return {
    capabilities,
    readyForFirstRequest,
    setupComplete: tmdbReady && workerReady && readyForFirstRequest,
    completedCoreChecks,
    totalCoreChecks: coreChecks.length,
    progressPercent: Math.round((completedCoreChecks / coreChecks.length) * 100),
  };
}
