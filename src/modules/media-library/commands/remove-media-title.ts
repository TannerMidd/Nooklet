import {
    deleteMediaTitleByIdForUser,
    findMediaTitleByIdForUser,
    type MediaTitleRecord,
} from "@/modules/media-library/repositories/media-library-repository";
import {
    removeMediaTitleInputSchema,
    type RemoveMediaTitleInput,
} from "@/modules/media-library/schemas/remove-media-title";
import { hasActiveDownloadAssociationForTitle } from "@/modules/downloads/queries/has-active-download-association";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

export class RemoveMediaTitleCommandError extends Error {
    constructor(
        message: string,
        public readonly code: "title_not_found" | "active_download",
    ) {
        super(message);
        this.name = "RemoveMediaTitleCommandError";
    }
}

export async function removeMediaTitleCommand(
    userId: string,
    input: RemoveMediaTitleInput,
): Promise<MediaTitleRecord> {
    const parsed = removeMediaTitleInputSchema.parse(input);
    const existingTitle = await findMediaTitleByIdForUser(userId, parsed.titleId);

    if (!existingTitle) {
        throw new RemoveMediaTitleCommandError("Library title was not found.", "title_not_found");
    }

    if (await hasActiveDownloadAssociationForTitle(userId, parsed.titleId)) {
        throw new RemoveMediaTitleCommandError(
            "This title still has an active season plan, download, or import. Stop it in Activity before removing the title.",
            "active_download",
        );
    }

    const removedTitle = await deleteMediaTitleByIdForUser(userId, parsed.titleId);

    if (!removedTitle) {
        throw new RemoveMediaTitleCommandError("Library title was not found.", "title_not_found");
    }

    await recordAuditEvent({
        actorUserId: userId,
        eventType: "media-library.title.removed",
        subjectType: "media-title",
        subjectId: removedTitle.id,
        payload: {
            mediaType: removedTitle.mediaType,
            libraryId: removedTitle.libraryId,
            title: removedTitle.title,
            year: removedTitle.year,
            filesRequestedForDeletion: false,
        },
    });

    return removedTitle;
}
