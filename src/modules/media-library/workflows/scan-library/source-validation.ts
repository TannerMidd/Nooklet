import {
  listActiveMediaLibraryPaths,
  type ActiveMediaLibraryPathRecord,
} from "@/modules/media-library/repositories/media-library-repository";

import { ScanMediaLibraryWorkflowError } from "./errors";
import { type ScanMediaLibraryInput } from "./request-validation";

export type ValidatedScanSources = {
  request: ScanMediaLibraryInput;
  sources: ActiveMediaLibraryPathRecord[];
};

export async function validateScanSources(
  userId: string,
  request: ScanMediaLibraryInput,
): Promise<ValidatedScanSources> {
  const activeSources = await listActiveMediaLibraryPaths(userId);
  const requestedPathIds = request.pathIds ? new Set(request.pathIds) : null;
  const sources = requestedPathIds
    ? activeSources.filter((source) => requestedPathIds.has(source.path.id))
    : activeSources;

  if (sources.length === 0) {
    throw new ScanMediaLibraryWorkflowError(
      "no_paths",
      requestedPathIds
        ? "The selected library folders are no longer active."
        : "Attach a library folder before scanning.",
    );
  }

  return { request, sources };
}
