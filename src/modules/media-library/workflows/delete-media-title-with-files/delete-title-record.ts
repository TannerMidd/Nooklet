import {
  deleteMediaTitleByIdForUser,
  type MediaTitleRecord,
} from "@/modules/media-library/repositories/media-library-repository";

/**
 * Deletes the title row. Foreign-key cascades remove mediaFiles, tvSeasons,
 * tvEpisodes, and mediaTitleExternalIds. Returns null when the title does not
 * exist for this user.
 */
export async function deleteTitleRecord(
  userId: string,
  titleId: string,
): Promise<MediaTitleRecord | null> {
  return deleteMediaTitleByIdForUser(userId, titleId);
}
