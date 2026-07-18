import { type SabnzbdHistoryItem } from "@/lib/integrations/sabnzbd";
import { type DownloadFailureKind } from "@/modules/downloads/workflows/download-failure-classification";
import {
  listTrackedSabnzbdHistory,
} from "@/modules/downloads/workflows/targeted-sabnzbd-history";

import { ImportCompletedDownloadsWorkflowError } from "./errors";
import { type ResolvedImportSabnzbdClient } from "./client-resolution";
import { type ImportCompletedDownloadsRequest } from "./request-validation";

export type FinishedSabnzbdHistoryItem = SabnzbdHistoryItem & {
  statusKind: "completed" | "failed";
  failureKind?: DownloadFailureKind | null;
  /**
   * Bytes the transfer actually moved; only the built-in engine reports this.
   * Zero-byte content failures are budget-free for auto-retry (attempt-cost.ts).
   */
  downloadedBytes?: number | null;
};

export type FinishedSabnzbdHistory = {
  items: FinishedSabnzbdHistoryItem[];
};

function statusKind(status: string): FinishedSabnzbdHistoryItem["statusKind"] | null {
  const normalized = status.trim().toLowerCase();

  if (normalized === "completed" || normalized === "complete") {
    return "completed";
  }

  if (
    normalized === "failed"
    || normalized === "failure"
    || normalized === "aborted"
    || normalized === "deleted"
    || normalized === "removed"
  ) {
    return "failed";
  }

  return null;
}

export async function fetchFinishedSabnzbdHistory(
  userId: string,
  client: ResolvedImportSabnzbdClient,
  request: ImportCompletedDownloadsRequest,
): Promise<FinishedSabnzbdHistory> {
  try {
    const snapshot = await listTrackedSabnzbdHistory(userId, client, {
      // This is now a bounded request batch size, not a recency cutoff.
      // Every active Nooklet job is targeted across as many batches as needed.
      batchSize: request.historyLimit,
      timeoutMs: 20_000,
      ...(request.requestId ? { requestId: request.requestId } : {}),
    });

    return {
      items: snapshot.items.flatMap((item) => {
        const kind = statusKind(item.status);

        return kind ? [{ ...item, statusKind: kind }] : [];
      }),
    };
  } catch (error) {
    throw new ImportCompletedDownloadsWorkflowError(
      "history_fetch_failed",
      error instanceof Error ? error.message : "Nooklet could not read SABnzbd history.",
    );
  }
}
