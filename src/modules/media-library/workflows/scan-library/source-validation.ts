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
  const sources = await listActiveMediaLibraryPaths(userId);

  if (sources.length === 0) {
    throw new ScanMediaLibraryWorkflowError("no_paths", "Attach a library folder before scanning.");
  }

  return { request, sources };
}
