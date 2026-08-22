import { ensureDatabaseReady } from "@/lib/database/client";
import { engineDownloads } from "@/lib/database/schema";

/**
 * Minimal per-row state the startup artifact sweep needs to decide which
 * on-disk directories are still owned by a live download. The queue table
 * stays small, so an unfiltered read is fine.
 */
export async function listEngineDownloadArtifactStates() {
    return ensureDatabaseReady()
        .select({
            id: engineDownloads.id,
            state: engineDownloads.state,
            outputPath: engineDownloads.outputPath,
            importedAt: engineDownloads.importedAt,
        })
        .from(engineDownloads)
        .all();
}
