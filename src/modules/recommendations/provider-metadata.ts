export type RecommendationProviderMetadata = {
  source?: string;
  model?: string;
  posterUrl?: string;
  posterLookupService?: "sonarr" | "radarr";
};

export function parseRecommendationProviderMetadata(
  metadataJson: string | null,
): RecommendationProviderMetadata | null {
  if (!metadataJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(metadataJson) as unknown;

    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    const metadata = parsed as Record<string, unknown>;
    const posterLookupService =
      metadata.posterLookupService === "sonarr" || metadata.posterLookupService === "radarr"
        ? metadata.posterLookupService
        : undefined;

    return {
      source: typeof metadata.source === "string" ? metadata.source : undefined,
      model: typeof metadata.model === "string" ? metadata.model : undefined,
      posterUrl:
        typeof metadata.posterUrl === "string" && metadata.posterUrl.trim().length > 0
          ? metadata.posterUrl.trim()
          : undefined,
      posterLookupService,
    } satisfies RecommendationProviderMetadata;
  } catch {
    return null;
  }
}