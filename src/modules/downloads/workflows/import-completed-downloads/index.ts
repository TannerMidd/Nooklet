import { recordCompletedDownloadImportAudit } from "./audit";
import { resolveImportSabnzbdClient } from "./client-resolution";
import { resolveCompletedDownloadDestinations } from "./destination-resolution";
import { fetchFinishedSabnzbdHistory } from "./history-fetch";
import { inspectCompletedDownloadFiles } from "./file-inspection";
import { organizeCompletedDownloadFiles } from "./file-organization";
import { matchFinishedHistoryToDownloads } from "./request-matching";
import { dispatchCompletedDownloadNotifications } from "./notifications";
import { persistCompletedDownloadImports } from "./persistence";
import { retryFailedCompletedDownloads } from "./retry-handling";
import {
  validateImportCompletedDownloadsRequest,
  type ImportCompletedDownloadsInput,
} from "./request-validation";
import { triggerCompletedDownloadDiscovery } from "./scan-trigger";
import { withCompletedImportLock } from "../completed-import-lock";

async function runImportCompletedDownloadsWorkflow(
  userId: string,
  input: ImportCompletedDownloadsInput = {},
) {
  const request = validateImportCompletedDownloadsRequest(input);
  const client = await resolveImportSabnzbdClient(userId);
  const history = await fetchFinishedSabnzbdHistory(client, request);
  const matches = await matchFinishedHistoryToDownloads(userId, client, history);
  const resolved = await resolveCompletedDownloadDestinations(userId, matches);
  const inspected = await inspectCompletedDownloadFiles(resolved);
  const organized = await organizeCompletedDownloadFiles(inspected);
  const persisted = await persistCompletedDownloadImports(userId, organized);
  const retry = await retryFailedCompletedDownloads(userId, organized);
  const discovery = await triggerCompletedDownloadDiscovery(userId, persisted);

  await recordCompletedDownloadImportAudit({ userId, persisted, retry, discovery });
  await dispatchCompletedDownloadNotifications(userId, organized);

  return { ...persisted, retry, discovery };
}

export async function importCompletedDownloadsWorkflow(
  userId: string,
  input: ImportCompletedDownloadsInput = {},
) {
  return withCompletedImportLock(userId, () => runImportCompletedDownloadsWorkflow(userId, input));
}

export { importCompletedDownloadsInputSchema } from "./request-validation";
export { ImportCompletedDownloadsWorkflowError } from "./errors";
export type { ImportCompletedDownloadsInput } from "./request-validation";
