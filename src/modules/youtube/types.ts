import type {
    YoutubeDownloadFailureKind,
    YoutubeDownloadStatus,
    YoutubeQualityProfile,
    YoutubeSourceKind,
    YoutubeSourceStatus,
    YoutubeVideoAvailability,
    YoutubeVideoContentKind,
} from "@/lib/database/schema";

export type YouTubeClassifiedUrl =
    | {
          kind: "video";
          videoId: string;
          canonicalUrl: string;
      }
    | {
          kind: YoutubeSourceKind;
          sourceId: string;
          canonicalUrl: string;
      };

export type YouTubeVideoDTO = {
    id?: string;
    youtubeVideoId: string;
    title: string;
    channelId: string | null;
    channelTitle: string | null;
    description: string | null;
    publishedAt: Date | null;
    durationSeconds: number | null;
    thumbnailUrl: string | null;
    webpageUrl: string;
    contentKind: YoutubeVideoContentKind;
    availability: YoutubeVideoAvailability;
    eligible: boolean;
};

export type YouTubeSourceSummaryDTO = {
    kind: YoutubeSourceKind;
    youtubeSourceId: string;
    canonicalUrl: string;
    title: string;
    channelId: string | null;
    channelTitle: string | null;
    thumbnailUrl: string | null;
};

export type YouTubeEnumerationDTO = {
    complete: boolean;
    source: YouTubeSourceSummaryDTO;
    videos: YouTubeVideoDTO[];
};

export type YouTubeSearchResultDTO =
    { kind: "video"; video: YouTubeVideoDTO } | { kind: "source"; source: YouTubeSourceSummaryDTO };

export type YouTubeSourceDTO = YouTubeSourceSummaryDTO & {
    id: string;
    libraryPathId: string;
    destinationLabel: string;
    destinationPath: string;
    qualityProfile: YoutubeQualityProfile;
    status: YoutubeSourceStatus;
    baselineCompletedAt: Date | null;
    lastSyncedAt: Date | null;
    lastError: string | null;
    videoCount: number;
    presentVideoCount: number;
    createdAt: Date;
    updatedAt: Date;
};

export type YouTubeVideoPageItemDTO = YouTubeVideoDTO & {
    id: string;
    remotePresent: boolean | null;
    sourceId: string | null;
    downloadId: string | null;
    downloadStatus: YoutubeDownloadStatus | null;
    finalPath: string | null;
};

export type YouTubeVideoPage = {
    videos: YouTubeVideoPageItemDTO[];
    pagination: {
        page: number;
        pageSize: number;
        pageCount: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
        firstItem: number;
        lastItem: number;
        total: number;
    };
};

export type YouTubeQueueOutcome =
    "queued" | "already_queued" | "completed" | "failed" | "cancelled";

export type YouTubeQueueSummary = {
    totalCount: number;
    queuedCount: number;
    alreadyQueuedCount: number;
    completedCount: number;
    failedCount: number;
    cancelledCount: number;
};

export type YouTubeDownloadActivityDTO = {
    kind: "youtube";
    id: string;
    userId: string;
    videoId: string;
    youtubeVideoId: string;
    sourceId: string | null;
    sourceTitle: string | null;
    title: string;
    channelTitle: string | null;
    thumbnailUrl: string | null;
    libraryPathId: string;
    destinationLabel: string;
    destinationPath: string;
    qualityProfile: YoutubeQualityProfile;
    status: YoutubeDownloadStatus;
    progressPercent: number;
    downloadedBytes: number;
    totalBytes: number | null;
    bytesPerSecond: number | null;
    etaSeconds: number | null;
    attemptCount: number;
    nextAttemptAt: Date | null;
    failureKind: YoutubeDownloadFailureKind | null;
    errorMessage: string | null;
    finalPath: string | null;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
};

export type YouTubeRequestOptionsDTO = {
    qualityProfiles: Array<{ value: YoutubeQualityProfile; label: string }>;
    destinations: Array<{ id: string; label: string; path: string; isDefault: boolean }>;
};

export type YouTubeDownloadProgress = {
    status: string;
    progressPercent: number | null;
    downloadedBytes: number | null;
    totalBytes: number | null;
    bytesPerSecond: number | null;
    etaSeconds: number | null;
};

export type YouTubeRunnerProgress =
    | ({ phase: "downloading"; downloadId: string } & YouTubeDownloadProgress)
    | {
          phase: "importing";
          downloadId: string;
          copiedBytes: number;
          totalBytes: number;
      };

export type YouTubeToolDiagnosticsDTO = {
    ready: boolean;
    ytDlp: { available: boolean; version: string | null; error: string | null };
    ffmpeg: { available: boolean; version: string | null; error: string | null };
    node: { available: boolean; version: string | null; error: string | null };
    ejs: { available: boolean; detail: string | null; error: string | null };
    workDirectory: {
        writable: boolean;
        path: string;
        error: string | null;
    };
};

export type YouTubeHealthDTO = {
    ready: boolean;
    degraded: boolean;
    tools: YouTubeToolDiagnosticsDTO;
    sourcesWithErrors: number;
    queuedDownloads: number;
    activeDownloads: number;
    retryingDownloads: number;
    lastRunnerHeartbeatAt: Date | null;
    runnerStalled: boolean;
};

export type YouTubeAutomationSettingsDTO = {
    enabled: boolean;
    scheduleMinutes: number;
    nextRunAt: Date | null;
    lastStartedAt: Date | null;
    lastCompletedAt: Date | null;
    lastStatus: "idle" | "running" | "succeeded" | "failed";
    lastError: string | null;
};
