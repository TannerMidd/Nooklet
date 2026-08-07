import { unlink } from "node:fs/promises";

import { resolveApprovedMediaFile } from "@/lib/security/filesystem-policy";
import { type MediaFilePathForCleanup } from "./list-files";

export type FileDeletionOutcome = {
    filePath: string;
    status: "deleted" | "missing" | "failed";
    error?: string;
};

/**
 * Best-effort removal of on-disk media files. Missing files are treated as
 * already-deleted; other failures are surfaced in the outcome list so callers
 * can audit them without aborting the workflow.
 */
export async function deleteFilesOnDisk(
    files: readonly MediaFilePathForCleanup[],
): Promise<FileDeletionOutcome[]> {
    const outcomes: FileDeletionOutcome[] = [];

    for (const file of files) {
        try {
            const approvedFilePath = resolveApprovedMediaFile(file.filePath, file.libraryRootPath);

            await unlink(approvedFilePath);
            outcomes.push({ filePath: file.filePath, status: "deleted" });
        } catch (error) {
            if (isNotFoundError(error)) {
                outcomes.push({ filePath: file.filePath, status: "missing" });
                continue;
            }

            outcomes.push({
                filePath: file.filePath,
                status: "failed",
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return outcomes;
}

function isNotFoundError(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code: unknown }).code === "ENOENT"
    );
}
