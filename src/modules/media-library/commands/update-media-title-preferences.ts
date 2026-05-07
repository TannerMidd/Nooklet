import {
  findMediaTitleByIdForUser,
  updateMediaTitlePreferences,
  type MediaTitleRecord,
} from "@/modules/media-library/repositories/media-library-repository";
import {
  type UpdateMediaTitlePreferencesInput,
  updateMediaTitlePreferencesInputSchema,
} from "@/modules/media-library/schemas/media-title-preferences";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export class UpdateMediaTitlePreferencesCommandError extends Error {
  constructor(
    message: string,
    public readonly code: "title_not_found",
  ) {
    super(message);
    this.name = "UpdateMediaTitlePreferencesCommandError";
  }
}

export async function updateMediaTitlePreferencesCommand(
  userId: string,
  input: UpdateMediaTitlePreferencesInput,
): Promise<MediaTitleRecord> {
  const parsed = updateMediaTitlePreferencesInputSchema.parse(input);
  const existingTitle = await findMediaTitleByIdForUser(userId, parsed.titleId);

  if (!existingTitle) {
    throw new UpdateMediaTitlePreferencesCommandError("Library title was not found.", "title_not_found");
  }

  const updatedTitle = await updateMediaTitlePreferences({
    userId,
    titleId: parsed.titleId,
    monitored: parsed.monitored,
    qualityProfile: parsed.qualityProfile,
  });

  if (!updatedTitle) {
    throw new UpdateMediaTitlePreferencesCommandError("Library title was not found.", "title_not_found");
  }

  await recordAuditEvent({
    actorUserId: userId,
    eventType: "media-library.title.preferences.updated",
    subjectType: "media-title",
    subjectId: updatedTitle.id,
    payload: {
      mediaType: updatedTitle.mediaType,
      monitored: parsed.monitored,
      previousMonitored: existingTitle.monitored,
      qualityProfile: parsed.qualityProfile,
      previousQualityProfile: existingTitle.qualityProfile,
    },
  });

  return updatedTitle;
}
