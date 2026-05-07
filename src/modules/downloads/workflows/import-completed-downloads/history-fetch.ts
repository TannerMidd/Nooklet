import { listSabnzbdHistory, type SabnzbdHistoryItem } from "@/lib/integrations/sabnzbd";

import { ImportCompletedDownloadsWorkflowError } from "./errors";
import { type ResolvedImportSabnzbdClient } from "./client-resolution";
import { type ImportCompletedDownloadsRequest } from "./request-validation";

export type FinishedSabnzbdHistoryItem = SabnzbdHistoryItem & {
  statusKind: "completed" | "failed";
};

export type FinishedSabnzbdHistory = {
  items: FinishedSabnzbdHistoryItem[];
};

function statusKind(status: string): FinishedSabnzbdHistoryItem["statusKind"] | null {
  const normalized = status.trim().toLowerCase();

  if (normalized === "completed" || normalized === "complete") {
    return "completed";
  }

  if (normalized === "failed" || normalized === "failure") {
    return "failed";
  }

  return null;
}

export async function fetchFinishedSabnzbdHistory(
  client: ResolvedImportSabnzbdClient,
  request: ImportCompletedDownloadsRequest,
): Promise<FinishedSabnzbdHistory> {
  try {
    const snapshot = await listSabnzbdHistory({
      baseUrl: client.baseUrl,
      apiKey: client.apiKey,
      limit: request.historyLimit,
      timeoutMs: 20_000,
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
