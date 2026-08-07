import {
    resolveDefaultMediaLibraryDownloadTarget,
    resolveMediaLibraryDownloadTarget,
} from "@/modules/media-library/queries/list-media-library-path-options";

import { QueueIndexerResultWorkflowError } from "./errors";
import { type QueueIndexerResultInput } from "./request-validation";
import { type ResolvedQueueIndexerResult } from "./result-resolution";

export type ResolvedQueueIndexerResultTarget = NonNullable<
    Awaited<ReturnType<typeof resolveMediaLibraryDownloadTarget>>
>;

export async function resolveQueueIndexerResultTarget(
    userId: string,
    request: QueueIndexerResultInput,
    resolvedResult: ResolvedQueueIndexerResult,
): Promise<ResolvedQueueIndexerResultTarget> {
    if (!request.targetLibraryPathId) {
        const target = await resolveDefaultMediaLibraryDownloadTarget(userId, {
            mediaType: resolvedResult.result.mediaType,
            libraryId: request.targetLibraryId ?? null,
        });

        if (!target) {
            throw new QueueIndexerResultWorkflowError(
                "target_path_not_found",
                "Configure a default matching library folder before queueing releases.",
            );
        }

        return target;
    }

    const target = await resolveMediaLibraryDownloadTarget(userId, {
        pathId: request.targetLibraryPathId,
        mediaType: resolvedResult.result.mediaType,
        libraryId: request.targetLibraryId ?? null,
    });

    if (!target) {
        throw new QueueIndexerResultWorkflowError(
            "target_path_not_found",
            "Choose a matching active library folder before queueing releases.",
        );
    }

    return target;
}
