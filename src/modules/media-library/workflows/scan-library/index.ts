import { recordLibraryScanAudit } from "./audit";
import { mergeLibraryScanFiles } from "./merge-deduplication";
import { normalizeLibraryFiles } from "./normalization";
import { validateScanMediaLibraryRequest, type ScanMediaLibraryInput } from "./request-validation";
import { persistLibraryScanMetadata } from "./scan-metadata-persistence";
import { fetchLibrarySourceFiles } from "./source-fetch";
import { validateScanSources } from "./source-validation";
import { ScanMediaLibraryWorkflowError } from "./errors";

const scanState = globalThis as typeof globalThis & {
    __nookletActiveLibraryScans?: Set<string>;
};
const activeLibraryScans = scanState.__nookletActiveLibraryScans ?? new Set<string>();

scanState.__nookletActiveLibraryScans = activeLibraryScans;

export async function scanMediaLibraryWorkflow(userId: string, input: ScanMediaLibraryInput = {}) {
    if (activeLibraryScans.has(userId)) {
        throw new ScanMediaLibraryWorkflowError(
            "scan_in_progress",
            "A library scan is already running for this account.",
        );
    }

    activeLibraryScans.add(userId);

    try {
        const request = validateScanMediaLibraryRequest(input);
        const validatedSources = await validateScanSources(userId, request);
        const fetchedSources = await fetchLibrarySourceFiles(validatedSources);
        const normalizedFiles = normalizeLibraryFiles(fetchedSources);
        const mergedFiles = await mergeLibraryScanFiles(userId, normalizedFiles);
        const persisted = await persistLibraryScanMetadata(userId, mergedFiles);

        await recordLibraryScanAudit(userId, persisted);

        return persisted;
    } finally {
        activeLibraryScans.delete(userId);
    }
}

export { scanMediaLibraryInputSchema } from "./request-validation";
export { ScanMediaLibraryWorkflowError } from "./errors";
export type { PersistedLibraryScan } from "./scan-metadata-persistence";
export type { ScanMediaLibraryInput } from "./request-validation";
