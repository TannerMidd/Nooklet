import { type DeleteRadarrMovieBulkInput } from "@/modules/service-connections/schemas/delete-radarr-movie-bulk";
import { deleteRadarrMovieForUser } from "@/modules/service-connections/workflows/delete-radarr-movie";

type DeleteRadarrMovieBulkWorkflowInput = Omit<DeleteRadarrMovieBulkInput, "returnTo">;

export type DeleteRadarrMovieBulkResult =
  | { ok: true; message: string; deletedCount: number }
  | { ok: false; message: string; deletedCount: number; failedCount: number };

function formatMovieCount(count: number) {
  return count === 1 ? "1 Radarr movie" : `${count} Radarr movies`;
}

export async function deleteRadarrMovieBulkForUser(
  userId: string,
  input: DeleteRadarrMovieBulkWorkflowInput,
): Promise<DeleteRadarrMovieBulkResult> {
  const failures: Array<{ movieId: number; message: string }> = [];
  let deletedCount = 0;

  for (const movieId of input.movieIds) {
    const result = await deleteRadarrMovieForUser(userId, {
      movieId,
      deleteFiles: input.deleteFiles,
    });

    if (result.ok) {
      deletedCount += 1;
    } else {
      failures.push({ movieId, message: result.message });
    }
  }

  const totalCount = input.movieIds.length;

  if (failures.length > 0) {
    const firstFailure = failures[0];
    const prefix =
      deletedCount > 0
        ? `Deleted ${deletedCount} of ${formatMovieCount(totalCount)}.`
        : `Could not delete ${formatMovieCount(totalCount)}.`;

    return {
      ok: false,
      deletedCount,
      failedCount: failures.length,
      message: `${prefix} ${failures.length} failed; first error for movie ${firstFailure.movieId}: ${firstFailure.message}`,
    };
  }

  return {
    ok: true,
    deletedCount,
    message: input.deleteFiles
      ? `Deleted ${formatMovieCount(totalCount)} and files.`
      : `Removed ${formatMovieCount(totalCount)}; files were kept on disk.`,
  };
}