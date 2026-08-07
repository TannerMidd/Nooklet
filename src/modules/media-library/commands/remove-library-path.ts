import {
    deleteMediaLibraryPath,
    type MediaLibraryPathRecord,
} from "@/modules/media-library/repositories/media-library-repository";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import {
    type RemoveLibraryPathInput,
    removeLibraryPathInputSchema,
} from "@/modules/media-library/schemas/library-path";
import { hasAnyActiveDownloadAssociationForLibraryPath } from "@/modules/downloads/queries/has-active-download-association";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export class RemoveLibraryPathCommandError extends Error {
    constructor(
        message: string,
        public readonly code: "path_not_found" | "active_download",
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
    const ownerUserId = await resolveInstanceConfigurationOwnerId(userId);

    if (await hasAnyActiveDownloadAssociationForLibraryPath(parsed.pathId)) {
        throw new RemoveLibraryPathCommandError(
            "This library folder is being used by an active download or import. Let it finish or cancel it in Activity before removing the folder.",
            "active_download",
        );
    }

    const removedPath = await deleteMediaLibraryPath(ownerUserId, parsed.pathId);

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
