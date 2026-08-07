import { z } from "zod";

import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import {
  setDefaultDownloadPath,
} from "@/modules/media-library/repositories/media-library-repository";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export const setDefaultDownloadPathInputSchema = z.object({
  pathId: z.string().uuid("Choose a library folder."),
});

export type SetDefaultDownloadPathInput = z.infer<typeof setDefaultDownloadPathInputSchema>;

export class SetDefaultDownloadPathCommandError extends Error {
  constructor(message: string, public readonly code: "path_not_found") {
    super(message);
    this.name = "SetDefaultDownloadPathCommandError";
  }
}

export async function setDefaultDownloadPathCommand(
  userId: string,
  input: SetDefaultDownloadPathInput,
) {
  const parsed = setDefaultDownloadPathInputSchema.parse(input);
  const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);
  const updated = await setDefaultDownloadPath({ userId: ownerUserId, pathId: parsed.pathId });

  if (!updated) {
    throw new SetDefaultDownloadPathCommandError(
      "Choose an active library folder and try again.",
      "path_not_found",
    );
  }

  await recordAuditEvent({
    actorUserId: userId,
    eventType: "media-library.download-default.updated",
    subjectType: "media-library-path",
    subjectId: updated.path.id,
    payload: {
      mediaType: updated.library.mediaType,
      libraryId: updated.library.id,
      path: updated.path.path,
      label: updated.path.label,
    },
  });

  return updated;
}
