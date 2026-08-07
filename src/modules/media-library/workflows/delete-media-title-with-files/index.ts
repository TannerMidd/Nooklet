import { type MediaTitleRecord } from "@/modules/media-library/repositories/media-library-repository";
import { hasActiveDownloadAssociationForTitle } from "@/modules/downloads/queries/has-active-download-association";

import { auditTitleRemoval } from "./audit";
import { deleteFilesOnDisk, type FileDeletionOutcome } from "./delete-files-on-disk";
import { deleteTitleRecord } from "./delete-title-record";
import { listFilesForTitleCleanup } from "./list-files";
import {
    deleteMediaTitleWithFilesInputSchema,
    validateDeleteMediaTitleWithFilesRequest,
    type DeleteMediaTitleWithFilesInput,
} from "./request-validation";

export { deleteMediaTitleWithFilesInputSchema };
export type { DeleteMediaTitleWithFilesInput };

export class DeleteMediaTitleWithFilesError extends Error {
    constructor(
        message: string,
        public readonly code: "title_not_found" | "active_download",
    ) {
        super(message);
        this.name = "DeleteMediaTitleWithFilesError";
    }
}

export type DeleteMediaTitleWithFilesResult = {
    removedTitle: MediaTitleRecord;
    fileOutcomes: FileDeletionOutcome[];
    filesRequestedForDeletion: boolean;
};

export async function deleteMediaTitleWithFilesWorkflow(
    userId: string,
    input: DeleteMediaTitleWithFilesInput,
): Promise<DeleteMediaTitleWithFilesResult> {
    const request = validateDeleteMediaTitleWithFilesRequest(input);

    if (await hasActiveDownloadAssociationForTitle(userId, request.titleId)) {
        throw new DeleteMediaTitleWithFilesError(
            "This title still has an active season plan, download, or import. Stop it in Activity before removing the title.",
            "active_download",
        );
    }

    const files = await listFilesForTitleCleanup(userId, request.titleId);
    const fileOutcomes = request.deleteFiles ? await deleteFilesOnDisk(files) : [];
    const removedTitle = await deleteTitleRecord(userId, request.titleId);

    if (!removedTitle) {
        throw new DeleteMediaTitleWithFilesError("Library title was not found.", "title_not_found");
    }

    await auditTitleRemoval({
        userId,
        title: removedTitle,
        fileOutcomes,
        filesRequestedForDeletion: request.deleteFiles,
    });

    return {
        removedTitle,
        fileOutcomes,
        filesRequestedForDeletion: request.deleteFiles,
    };
}
