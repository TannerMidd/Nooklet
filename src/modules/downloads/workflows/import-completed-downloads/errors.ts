export type ImportCompletedDownloadsErrorCode =
  | "sabnzbd_not_connected"
  | "sabnzbd_not_verified"
  | "download_client_failed"
  | "history_fetch_failed";

export class ImportCompletedDownloadsWorkflowError extends Error {
  constructor(
    public readonly code: ImportCompletedDownloadsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportCompletedDownloadsWorkflowError";
  }
}
