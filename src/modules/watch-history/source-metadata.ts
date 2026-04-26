export function parseWatchHistorySourceMetadataJson(metadataJson: string | null | undefined) {
  if (!metadataJson) {
    return null;
  }

  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch (error) {
    console.error("[watch-history/source-metadata] failed to parse metadataJson", error);
    return null;
  }
}