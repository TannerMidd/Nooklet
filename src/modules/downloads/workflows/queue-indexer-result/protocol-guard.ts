import { QueueIndexerResultWorkflowError } from "./errors";
import { type ResolvedQueueIndexerResult } from "./result-resolution";

export function ensureSabnzbdCompatibleResult(resolvedResult: ResolvedQueueIndexerResult) {
  if (resolvedResult.indexerProtocol !== "newznab") {
    throw new QueueIndexerResultWorkflowError(
      "unsupported_protocol",
      "Torrent releases are not supported yet. Connect a usenet (Newznab) indexer with SABnzbd to download this release.",
    );
  }
}
