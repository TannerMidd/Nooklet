import { QueueIndexerResultWorkflowError } from "./errors";
import { type ResolvedQueueIndexerResult } from "./result-resolution";

export function ensureSabnzbdCompatibleResult(resolvedResult: ResolvedQueueIndexerResult) {
  if (resolvedResult.indexerProtocol !== "newznab") {
    throw new QueueIndexerResultWorkflowError(
      "unsupported_protocol",
      "Torrent releases are not supported yet. Use a usenet (Newznab) indexer to download this release.",
    );
  }
}
