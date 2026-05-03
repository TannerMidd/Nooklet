import { type DeleteSonarrSeriesBulkInput } from "@/modules/service-connections/schemas/delete-sonarr-series-bulk";
import { deleteSonarrSeriesForUser } from "@/modules/service-connections/workflows/delete-sonarr-series";

type DeleteSonarrSeriesBulkWorkflowInput = Omit<DeleteSonarrSeriesBulkInput, "returnTo">;

export type DeleteSonarrSeriesBulkResult =
  | { ok: true; message: string; deletedCount: number }
  | { ok: false; message: string; deletedCount: number; failedCount: number };

export async function deleteSonarrSeriesBulkForUser(
  userId: string,
  input: DeleteSonarrSeriesBulkWorkflowInput,
): Promise<DeleteSonarrSeriesBulkResult> {
  const failures: Array<{ seriesId: number; message: string }> = [];
  let deletedCount = 0;

  for (const seriesId of input.seriesIds) {
    const result = await deleteSonarrSeriesForUser(userId, {
      seriesId,
      deleteFiles: input.deleteFiles,
    });

    if (result.ok) {
      deletedCount += 1;
    } else {
      failures.push({ seriesId, message: result.message });
    }
  }

  const totalCount = input.seriesIds.length;

  if (failures.length > 0) {
    const firstFailure = failures[0];
    const prefix =
      deletedCount > 0
        ? `Deleted ${deletedCount} of ${totalCount} Sonarr series.`
        : `Could not delete ${totalCount} Sonarr series.`;

    return {
      ok: false,
      deletedCount,
      failedCount: failures.length,
      message: `${prefix} ${failures.length} failed; first error for series ${firstFailure.seriesId}: ${firstFailure.message}`,
    };
  }

  return {
    ok: true,
    deletedCount,
    message: input.deleteFiles
      ? `Deleted ${totalCount} series and files from Sonarr.`
      : `Removed ${totalCount} series from Sonarr; files were kept on disk.`,
  };
}