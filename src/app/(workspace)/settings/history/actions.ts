"use server";

import { revalidatePath } from "next/cache";

import {
  type ManualWatchHistoryActionState,
  type PlexWatchHistoryActionState,
  type TautulliWatchHistoryActionState,
  type WatchHistoryScheduleActionState,
} from "@/app/(workspace)/settings/history/action-state";
import { auth } from "@/auth";
import { manualWatchHistorySyncInputSchema } from "@/modules/watch-history/schemas/manual-watch-history-sync";
import { plexWatchHistorySyncInputSchema } from "@/modules/watch-history/schemas/plex-watch-history-sync";
import { watchHistoryScheduleInputSchema } from "@/modules/watch-history/schemas/watch-history-schedule";
import { tautulliWatchHistorySyncInputSchema } from "@/modules/watch-history/schemas/tautulli-watch-history-sync";
import { configureWatchHistorySchedule } from "@/modules/watch-history/workflows/configure-watch-history-schedule";
import { syncManualWatchHistory } from "@/modules/watch-history/workflows/sync-manual-watch-history";
import { syncPlexWatchHistory } from "@/modules/watch-history/workflows/sync-plex-watch-history";
import { syncTautulliWatchHistory } from "@/modules/watch-history/workflows/sync-tautulli-watch-history";

export async function submitManualWatchHistorySyncAction(
  _previousState: ManualWatchHistoryActionState,
  formData: FormData,
): Promise<ManualWatchHistoryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const parsedInput = manualWatchHistorySyncInputSchema.safeParse({
    mediaType: formData.get("mediaType"),
    entriesText: formData.get("entriesText"),
  });

  if (!parsedInput.success) {
    const flattenedErrors = parsedInput.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the watch-history fields and try again.",
      fieldErrors: {
        mediaType: flattenedErrors.mediaType?.[0],
        entriesText: flattenedErrors.entriesText?.[0],
      },
    };
  }

  const result = await syncManualWatchHistory(session.user.id, parsedInput.data);

  revalidatePath("/settings/history");
  revalidatePath("/settings/preferences");
  revalidatePath("/tv");
  revalidatePath("/movies");

  return {
    status: result.ok ? "success" : "error",
    message: result.message,
    fieldErrors:
      !result.ok && result.field
        ? {
            [result.field]: result.message,
          }
        : undefined,
  };
}

export async function submitTautulliWatchHistorySyncAction(
  _previousState: TautulliWatchHistoryActionState,
  formData: FormData,
): Promise<TautulliWatchHistoryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const parsedInput = tautulliWatchHistorySyncInputSchema.safeParse({
    mediaType: formData.get("mediaType"),
    tautulliUserId: formData.get("tautulliUserId"),
    importLimit: formData.get("importLimit"),
  });

  if (!parsedInput.success) {
    const flattenedErrors = parsedInput.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the Tautulli sync fields and try again.",
      fieldErrors: {
        mediaType: flattenedErrors.mediaType?.[0],
        tautulliUserId: flattenedErrors.tautulliUserId?.[0],
        importLimit: flattenedErrors.importLimit?.[0],
      },
    };
  }

  const result = await syncTautulliWatchHistory(session.user.id, parsedInput.data);

  revalidatePath("/settings/history");
  revalidatePath("/settings/preferences");
  revalidatePath("/tv");
  revalidatePath("/movies");

  return {
    status: result.ok ? "success" : "error",
    message: result.message,
    fieldErrors:
      !result.ok && result.field
        ? {
            [result.field]: result.message,
          }
        : undefined,
  };
}

export async function submitPlexWatchHistorySyncAction(
  _previousState: PlexWatchHistoryActionState,
  formData: FormData,
): Promise<PlexWatchHistoryActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const parsedInput = plexWatchHistorySyncInputSchema.safeParse({
    mediaType: formData.get("mediaType"),
    plexUserId: formData.get("plexUserId"),
    importLimit: formData.get("importLimit"),
  });

  if (!parsedInput.success) {
    const flattenedErrors = parsedInput.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the Plex sync fields and try again.",
      fieldErrors: {
        mediaType: flattenedErrors.mediaType?.[0],
        plexUserId: flattenedErrors.plexUserId?.[0],
        importLimit: flattenedErrors.importLimit?.[0],
      },
    };
  }

  const result = await syncPlexWatchHistory(session.user.id, parsedInput.data);

  revalidatePath("/settings/history");
  revalidatePath("/settings/preferences");
  revalidatePath("/tv");
  revalidatePath("/movies");

  return {
    status: result.ok ? "success" : "error",
    message: result.message,
    fieldErrors:
      !result.ok && result.field
        ? {
            [result.field]: result.message,
          }
        : undefined,
  };
}

export async function submitWatchHistoryScheduleAction(
  _previousState: WatchHistoryScheduleActionState,
  formData: FormData,
): Promise<WatchHistoryScheduleActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const parsedInput = watchHistoryScheduleInputSchema.safeParse({
    sourceType: formData.get("sourceType"),
    intervalHours: formData.get("intervalHours"),
    enabled: formData.get("enabled") === "on",
  });

  if (!parsedInput.success) {
    const flattenedErrors = parsedInput.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the schedule fields and try again.",
      fieldErrors: {
        sourceType: flattenedErrors.sourceType?.[0],
        intervalHours: flattenedErrors.intervalHours?.[0],
      },
    };
  }

  const result = await configureWatchHistorySchedule(session.user.id, parsedInput.data);

  revalidatePath("/settings/history");

  return {
    status: result.ok ? "success" : "error",
    message: result.message,
    fieldErrors:
      !result.ok && result.field
        ? {
            [result.field]: result.message,
          }
        : undefined,
  };
}
