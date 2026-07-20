import {
  IsolatedFilesystemPolicyError,
  resolveApprovedMediaDirectoryIsolated,
} from "@/lib/security/isolated-filesystem-policy";
import { type MediaLibraryPathRecord } from "@/modules/media-library/repositories/media-library-repository";
import {
  addMediaLibraryPath,
  createMediaLibrary,
  findMediaLibraryByName,
  findMediaLibraryPathByUserPath,
} from "@/modules/media-library/repositories/media-library-repository";
import {
  addLibraryPathInputSchema,
  type AddLibraryPathInput,
} from "@/modules/media-library/schemas/library-path";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

export class LibraryPathCommandError extends Error {
  constructor(
    message: string,
    public readonly code: "folder_not_found" | "path_already_exists" | "path_not_allowed",
  ) {
    super(message);
    this.name = "LibraryPathCommandError";
  }
}

export async function addLibraryPathCommand(
  userId: string,
  input: AddLibraryPathInput,
): Promise<MediaLibraryPathRecord> {
  const parsed = addLibraryPathInputSchema.parse(input);

  let canonicalPath: string;
  try {
    canonicalPath = await resolveApprovedMediaDirectoryIsolated(parsed.path);
  } catch (error) {
    if (error instanceof IsolatedFilesystemPolicyError) {
      throw new LibraryPathCommandError(error.message, "path_not_allowed");
    }
    throw error;
  }

  const existingPath = await findMediaLibraryPathByUserPath(userId, canonicalPath);

  if (existingPath) {
    throw new LibraryPathCommandError(
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
  const libraryPath = await addMediaLibraryPath({
    libraryId: library.id,
    userId,
    path: canonicalPath,
    label: parsed.label || parsed.libraryName,
  });

  await createAuditEvent({
    actorUserId: userId,
    eventType: "media-library.path.created",
    subjectType: "media-library-path",
    subjectId: libraryPath.id,
    payload: {
      mediaType: parsed.mediaType,
      libraryId: library.id,
      path: canonicalPath,
    },
  });

  return libraryPath;
}
