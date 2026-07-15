import { FilesystemPolicyError, resolveApprovedMediaDirectory } from "@/lib/security/filesystem-policy";
import {
  createMediaLibrary,
  findMediaLibraryByName,
  findMediaLibraryPathByIdForUser,
  findMediaLibraryPathByUserPath,
  updateMediaLibraryPath,
  type MediaLibraryPathRecord,
} from "@/modules/media-library/repositories/media-library-repository";
import {
  type UpdateLibraryPathInput,
  updateLibraryPathInputSchema,
} from "@/modules/media-library/schemas/library-path";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export class UpdateLibraryPathCommandError extends Error {
  constructor(
    message: string,
    public readonly code: "folder_not_found" | "path_already_exists" | "path_not_found" | "path_not_allowed",
  ) {
    super(message);
    this.name = "UpdateLibraryPathCommandError";
  }
}

export async function updateLibraryPathCommand(
  userId: string,
  input: UpdateLibraryPathInput,
): Promise<MediaLibraryPathRecord> {
  const parsed = updateLibraryPathInputSchema.parse(input);
  const existingPath = await findMediaLibraryPathByIdForUser(userId, parsed.pathId);

  if (!existingPath) {
    throw new UpdateLibraryPathCommandError("Library folder was not found.", "path_not_found");
  }

  let canonicalPath: string;
  try {
    canonicalPath = resolveApprovedMediaDirectory(parsed.path);
  } catch (error) {
    if (error instanceof FilesystemPolicyError) {
      throw new UpdateLibraryPathCommandError(error.message, "path_not_allowed");
    }
    throw error;
  }

  const duplicatePath = await findMediaLibraryPathByUserPath(userId, canonicalPath);

  if (duplicatePath && duplicatePath.id !== parsed.pathId) {
    throw new UpdateLibraryPathCommandError(
      "That folder is already attached to your library.",
      "path_already_exists",
    );
  }

  const library = await findMediaLibraryByName(userId, parsed.mediaType, parsed.libraryName)
    ?? await createMediaLibrary({
      userId,
      mediaType: parsed.mediaType,
      name: parsed.libraryName,
      isDefault: true,
    });
  const updatedPath = await updateMediaLibraryPath({
    id: parsed.pathId,
    userId,
    libraryId: library.id,
    path: canonicalPath,
    label: parsed.label || parsed.libraryName,
    status: parsed.status,
  });

  if (!updatedPath) {
    throw new UpdateLibraryPathCommandError("Library folder was not found.", "path_not_found");
  }

  await recordAuditEvent({
    actorUserId: userId,
    eventType: "media-library.path.updated",
    subjectType: "media-library-path",
    subjectId: updatedPath.id,
    payload: {
      mediaType: parsed.mediaType,
      libraryId: library.id,
      previousLibraryId: existingPath.libraryId,
      path: canonicalPath,
      previousPath: existingPath.path,
      status: parsed.status,
    },
  });

  return updatedPath;
}
