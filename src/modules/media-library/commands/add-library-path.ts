import fs from "node:fs";

import { type MediaLibraryPathRecord } from "@/modules/media-library/repositories/media-library-repository";
import {
  addMediaLibraryPath,
  createMediaLibrary,
  findMediaLibraryByName,
} from "@/modules/media-library/repositories/media-library-repository";
import {
  addLibraryPathInputSchema,
  type AddLibraryPathInput,
} from "@/modules/media-library/schemas/library-path";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

export class LibraryPathCommandError extends Error {
  constructor(
    message: string,
    public readonly code: "folder_not_found",
  ) {
    super(message);
    this.name = "LibraryPathCommandError";
  }
}

function isReadableDirectory(folderPath: string) {
  try {
    return fs.existsSync(folderPath) && fs.statSync(folderPath).isDirectory();
  } catch {
    return false;
  }
}

export async function addLibraryPathCommand(
  userId: string,
  input: AddLibraryPathInput,
): Promise<MediaLibraryPathRecord> {
  const parsed = addLibraryPathInputSchema.parse(input);

  if (!isReadableDirectory(parsed.path)) {
    throw new LibraryPathCommandError(
      "Library folder does not exist or is not readable by Nooklet.",
      "folder_not_found",
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
    path: parsed.path,
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
      path: parsed.path,
    },
  });

  return libraryPath;
}
