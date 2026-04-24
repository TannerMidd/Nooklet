export function parseWatchHistorySourceMetadataJson(metadataJson: string | null | undefined) {
  if (!metadataJson) {
    return null;
  }

  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}