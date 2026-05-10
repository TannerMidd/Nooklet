import { listMediaFilePathsForTitle } from "@/modules/media-library/repositories/media-library-repository";

export type MediaFilePathForCleanup = {
  id: string;
  filePath: string;
};

/**
 * Loads the on-disk file paths recorded for a title. The list is captured
 * up-front so it survives the cascading DB delete that runs later in the
 * workflow.
 */
export async function listFilesForTitleCleanup(
  userId: string,
  titleId: string,
): Promise<MediaFilePathForCleanup[]> {
  return listMediaFilePathsForTitle(userId, titleId);
}
