export type QueueIndexerResultErrorCode =
  | "result_not_found"
  | "unsupported_protocol"
  | "sabnzbd_not_connected"
  | "sabnzbd_not_verified"
  | "sabnzbd_enqueue_failed"
  | "active_download_exists"
  | "target_path_not_found"
  | "invalid_media_association"
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
