import { recordLibraryScanAudit } from "./audit";
import { mergeLibraryScanFiles } from "./merge-deduplication";
import { normalizeLibraryFiles } from "./normalization";
import {
  validateScanMediaLibraryRequest,
  type ScanMediaLibraryInput,
} from "./request-validation";
import { persistLibraryScanMetadata } from "./scan-metadata-persistence";
import { fetchLibrarySourceFiles } from "./source-fetch";
import { validateScanSources } from "./source-validation";

export async function scanMediaLibraryWorkflow(userId: string, input: ScanMediaLibraryInput = {}) {
  const request = validateScanMediaLibraryRequest(input);
  const validatedSources = await validateScanSources(userId, request);
  const fetchedSources = await fetchLibrarySourceFiles(validatedSources);
  const normalizedFiles = normalizeLibraryFiles(fetchedSources);
  const mergedFiles = await mergeLibraryScanFiles(userId, normalizedFiles);
  const persisted = await persistLibraryScanMetadata(userId, mergedFiles);

  await recordLibraryScanAudit(userId, persisted);

  return persisted;
}

export { scanMediaLibraryInputSchema } from "./request-validation";
export { ScanMediaLibraryWorkflowError } from "./errors";
export type { PersistedLibraryScan } from "./scan-metadata-persistence";
export type { ScanMediaLibraryInput } from "./request-validation";
