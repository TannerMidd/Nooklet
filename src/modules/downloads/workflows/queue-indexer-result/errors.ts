export type QueueIndexerResultErrorCode =
  | "result_not_found"
  | "sabnzbd_not_connected"
  | "sabnzbd_not_verified"
  | "sabnzbd_enqueue_failed"
  | "download_request_failed";

export class QueueIndexerResultWorkflowError extends Error {
  constructor(
    public readonly code: QueueIndexerResultErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "QueueIndexerResultWorkflowError";
  }
}
