"use server";

import { revalidatePath } from "next/cache";

import { type ManualWatchHistoryActionState } from "@/app/(workspace)/settings/history/action-state";
import { auth } from "@/auth";
import { manualWatchHistorySyncInputSchema } from "@/modules/watch-history/schemas/manual-watch-history-sync";
import { syncManualWatchHistory } from "@/modules/watch-history/workflows/sync-manual-watch-history";

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
