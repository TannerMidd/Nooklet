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
import { acquireSeasonImportFences } from "./season-import-fence";
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
  const history = await fetchFinishedSabnzbdHistory(userId, client, request);
  const matches = request.requestId
    ? await matchFinishedHistoryToDownloads(
        userId,
        client,
        history,
        { requestId: request.requestId },
      )
    : await matchFinishedHistoryToDownloads(userId, client, history);
  const fences = await acquireSeasonImportFences(userId, matches);
  let organized;
  let persisted;

  try {
    const resolved = await resolveCompletedDownloadDestinations(userId, fences.matches);
    const inspected = await inspectCompletedDownloadFiles(resolved);
    await fences.renew();
    organized = await organizeCompletedDownloadFiles(inspected);
    await fences.renew();
    persisted = fences.workLeases.size > 0
      ? await persistCompletedDownloadImports(userId, organized, {
          workLeases: fences.workLeases,
        })
      : await persistCompletedDownloadImports(userId, organized);
  } finally {
    await fences.release();
  }
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
