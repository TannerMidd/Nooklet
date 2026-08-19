import path from "node:path";
import { readdir, stat } from "node:fs/promises";

import { resolveApprovedMediaDirectory } from "@/lib/security/filesystem-policy";
import { type ActiveMediaLibraryPathRecord } from "@/modules/media-library/repositories/media-library-repository";
import { type ValidatedScanSources } from "./source-validation";

const mediaExtensions = new Set([
    ".avi",
    ".m4v",
    ".mkv",
    ".mov",
    ".mp4",
    ".mpeg",
    ".mpg",
    ".ts",
    ".wmv",
]);

export type FetchedLibraryFile = {
    source: ActiveMediaLibraryPathRecord;
    filePath: string;
    relativePath: string;
    sizeBytes: number | null;
    modifiedAt: Date | null;
};

type FetchedFileWithoutSource = Omit<FetchedLibraryFile, "source">;

export type FailedLibraryPathScan = {
    source: ActiveMediaLibraryPathRecord;
    errorMessage: string;
};

export type FetchedLibrarySources = {
    sources: ActiveMediaLibraryPathRecord[];
    files: FetchedLibraryFile[];
    failedPaths: FailedLibraryPathScan[];
};

async function walkMediaFiles(rootPath: string): Promise<FetchedFileWithoutSource[]> {
    // A scan is authoritative only when every subtree was read successfully. If
    // an unreadable directory were treated as empty, the merge phase could
    // incorrectly delete every previously recorded file below that directory.
    const files: FetchedFileWithoutSource[] = [];
    const pendingDirectories = [rootPath];

    while (pendingDirectories.length > 0) {
        const currentPath = pendingDirectories.pop()!;
        const entries = await readdir(currentPath, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(currentPath, entry.name);

            if (entry.isDirectory()) {
                pendingDirectories.push(entryPath);
                continue;
            }

            if (!entry.isFile() || !mediaExtensions.has(path.extname(entry.name).toLowerCase())) {
                continue;
            }

            // A media file whose metadata cannot be read is an uncertain
            // observation rather than proof that the file disappeared. Fail the
            // source so its prior inventory remains untouched.
            const fileStat = await stat(entryPath);

            files.push({
                filePath: entryPath,
                relativePath: path.relative(rootPath, entryPath).replaceAll(path.sep, "/"),
                sizeBytes: fileStat.size,
                modifiedAt: fileStat.mtime,
            });
        }
    }

    return files;
}

export async function fetchLibrarySourceFiles(
    validated: ValidatedScanSources,
): Promise<FetchedLibrarySources> {
    const files: FetchedLibraryFile[] = [];
    const failedPaths: FailedLibraryPathScan[] = [];

    for (const source of validated.sources) {
        try {
            const approvedRootPath = resolveApprovedMediaDirectory(source.path.path);
            const rootStat = await stat(approvedRootPath);

            if (!rootStat.isDirectory()) {
                failedPaths.push({ source, errorMessage: "Library path is not a folder." });
                continue;
            }

            const sourceFiles = await walkMediaFiles(approvedRootPath);

            files.push(...sourceFiles.map((file) => ({ ...file, source })));
        } catch (error) {
            failedPaths.push({
                source,
                errorMessage:
                    error instanceof Error ? error.message : "Library path could not be read.",
            });
        }
    }

    return { sources: validated.sources, files, failedPaths };
}
