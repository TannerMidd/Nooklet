import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

import { type FileDeletionOutcome } from "./delete-files-on-disk";

export async function auditTitleRemoval(input: {
    userId: string;
    title: {
        id: string;
        mediaType: string;
        libraryId: string | null;
        title: string;
        year: number | null;
    };
    fileOutcomes: readonly FileDeletionOutcome[];
    filesRequestedForDeletion: boolean;
}): Promise<void> {
    const { userId, title, fileOutcomes, filesRequestedForDeletion } = input;

    await recordAuditEvent({
        actorUserId: userId,
        eventType: "media-library.title.removed",
        subjectType: "media-title",
        subjectId: title.id,
        payload: {
            mediaType: title.mediaType,
            libraryId: title.libraryId,
            title: title.title,
            year: title.year,
            filesRequestedForDeletion,
            filesDeleted: fileOutcomes.filter((outcome) => outcome.status === "deleted").length,
            filesMissing: fileOutcomes.filter((outcome) => outcome.status === "missing").length,
            filesFailed: fileOutcomes
                .filter((outcome) => outcome.status === "failed")
                .map((outcome) => ({ filePath: outcome.filePath, error: outcome.error ?? null })),
        },
    });
}
