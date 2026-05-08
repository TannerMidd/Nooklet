import { findActiveDownloadRequestForItem } from "@/modules/downloads/repositories/download-repository";

import { QueueIndexerResultWorkflowError } from "./errors";
import { type QueueIndexerResultInput } from "./request-validation";

export async function ensureNoActiveDownloadRequest(userId: string, request: QueueIndexerResultInput) {
  if (!request.mediaTitleId) {
    return;
  }

  const activeRequest = await findActiveDownloadRequestForItem({
    userId,
    mediaTitleId: request.mediaTitleId,
    episodeId: request.episodeId ?? null,
  });

  if (activeRequest) {
    throw new QueueIndexerResultWorkflowError(
      "active_download_exists",
      "This library item already has an active download in progress.",
    );
  }
}