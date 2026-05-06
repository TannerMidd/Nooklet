import {
  deleteMediaLibraryPath,
  type MediaLibraryPathRecord,
} from "@/modules/media-library/repositories/media-library-repository";
import {
  type RemoveLibraryPathInput,
  removeLibraryPathInputSchema,
} from "@/modules/media-library/schemas/library-path";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export class RemoveLibraryPathCommandError extends Error {
  constructor(
    message: string,
    public readonly code: "path_not_found",
  ) {
    super(message);
    this.name = "RemoveLibraryPathCommandError";
  }
}

export async function removeLibraryPathCommand(
  userId: string,
  input: RemoveLibraryPathInput,
): Promise<MediaLibraryPathRecord> {
  const parsed = removeLibraryPathInputSchema.parse(input);
  const removedPath = await deleteMediaLibraryPath(userId, parsed.pathId);

  if (!removedPath) {
    throw new RemoveLibraryPathCommandError("Library folder was not found.", "path_not_found");
  }

  await recordAuditEvent({
    actorUserId: userId,
    eventType: "media-library.path.removed",
    subjectType: "media-library-path",
    subjectId: removedPath.id,
    payload: {
      libraryId: removedPath.libraryId,
      path: removedPath.path,
    },
  });

  return removedPath;
}
