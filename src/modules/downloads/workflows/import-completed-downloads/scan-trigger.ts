import { scanMediaLibraryWorkflow } from "@/modules/media-library/workflows/scan-library";

import { type PersistedCompletedDownloadImports } from "./persistence";

export type CompletedDownloadDiscoveryResult = {
  attempted: boolean;
  ok: boolean;
  message: string | null;
};

export async function triggerCompletedDownloadDiscovery(
  userId: string,
  persisted: PersistedCompletedDownloadImports,
): Promise<CompletedDownloadDiscoveryResult> {
  if (persisted.importedFileCount === 0) {
    return { attempted: false, ok: true, message: null };
  }

  try {
    await scanMediaLibraryWorkflow(userId, {
      pathIds: persisted.affectedLibraryPathIds,
    });

    return { attempted: true, ok: true, message: null };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      message: error instanceof Error ? error.message : "Media discovery failed after import.",
    };
  }
}
