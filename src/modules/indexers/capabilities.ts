import { type IndexerProtocol } from "@/lib/database/schema";

/**
 * Protocols with a complete search and download path in this release. Keeping
 * this predicate next to the indexer domain prevents readiness, search, and
 * later workflows from silently drifting apart.
 */
export function isSupportedIndexerProtocol(
    protocol: IndexerProtocol | string,
): protocol is "newznab" {
    return protocol === "newznab";
}
