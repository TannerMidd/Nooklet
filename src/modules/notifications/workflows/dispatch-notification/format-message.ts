import { type NotificationEventType } from "@/lib/database/schema";
import { type NotificationMessage } from "@/modules/notifications/adapters/notification-channel-adapter";

export type NotificationEventPayload =
    | {
          eventType: "recommendation_run_succeeded";
          runId: string;
          mediaType: "tv" | "movie";
          itemCount: number;
      }
    | {
          eventType: "recommendation_run_failed";
          runId: string;
          mediaType: "tv" | "movie";
          message: string;
      }
    | {
          eventType: "library_add_failed";
          title: string;
          message: string;
      }
    | {
          eventType: "watch_history_sync_failed";
          sourceLabel: string;
          message: string;
      }
    | {
          eventType: "download_import_succeeded";
          title: string;
          mediaType: "tv" | "movie";
          fileCount: number;
      }
    | {
          eventType: "download_failed";
          title: string;
          mediaType: "tv" | "movie";
          message: string;
      }
    | {
          eventType: "download_import_failed";
          title: string;
          mediaType: "tv" | "movie";
          message: string;
      };

export function formatNotificationMessage(
    payload: NotificationEventPayload,
): NotificationMessage & {
    eventType: NotificationEventType;
} {
    if (payload.eventType === "recommendation_run_succeeded") {
        return {
            eventType: payload.eventType,
            title: `Recommendation run ready (${payload.mediaType.toUpperCase()})`,
            body: `Your latest ${payload.mediaType === "tv" ? "TV" : "movie"} run produced ${payload.itemCount} new picks.`,
        };
    }

    if (payload.eventType === "recommendation_run_failed") {
        return {
            eventType: payload.eventType,
            title: `Recommendation run failed (${payload.mediaType.toUpperCase()})`,
            body: payload.message,
        };
    }

    if (payload.eventType === "library_add_failed") {
        return {
            eventType: payload.eventType,
            title: `Adding "${payload.title}" failed`,
            body: payload.message,
        };
    }

    if (payload.eventType === "download_import_succeeded") {
        return {
            eventType: payload.eventType,
            title: `\"${payload.title}\" is ready`,
            body: `The ${payload.mediaType === "tv" ? "TV" : "movie"} download finished and Nooklet imported ${payload.fileCount} ${payload.fileCount === 1 ? "file" : "files"} into your library.`,
        };
    }

    if (payload.eventType === "download_failed") {
        return {
            eventType: payload.eventType,
            title: `Download failed: \"${payload.title}\"`,
            body: `${payload.message} No automatic retry is active.`,
        };
    }

    if (payload.eventType === "download_import_failed") {
        return {
            eventType: payload.eventType,
            title: `Import failed: \"${payload.title}\"`,
            body: `${payload.message} The download completed, but Nooklet could not make it available in the library.`,
        };
    }

    return {
        eventType: payload.eventType,
        title: `Watch history sync failed (${payload.sourceLabel})`,
        body: payload.message,
    };
}
