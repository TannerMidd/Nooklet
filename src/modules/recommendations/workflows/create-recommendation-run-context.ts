import { type RecommendationMediaType } from "@/lib/database/schema";
import { type RecommendationRequestInput } from "@/modules/recommendations/schemas/recommendation-request";
import { sampleLibraryTasteFromTitles } from "@/modules/media-library/queries/sample-library-taste";
import { type SampledLibraryTasteItem } from "@/modules/recommendations/library-taste-key";
import { parseAiProviderFlavor } from "@/modules/service-connections/ai-provider-endpoints";
import { findServiceConnectionByType } from "@/modules/service-connections/public";
import { verifyConfiguredServiceConnection } from "@/modules/service-connections/workflows/verify-configured-service-connection";

export type RecommendationLibraryTasteContext = {
  totalCount: number;
  sampledItems: SampledLibraryTasteItem[];
  normalizedKeys: string[];
};

/**
 * Loads a sampled view of the user's local library so the recommendation
 * prompt can include taste context and the duplicate suppression layer has
 * known-existing-item keys to exclude. Reads directly from the local
 * `mediaTitles` table — no external service calls.
 */
export async function loadSampledLibraryTasteContext(
  userId: string,
  mediaType: RecommendationMediaType,
  _selectedGenres: RecommendationRequestInput["selectedGenres"],
  sampleSize: number,
) {
  const context = await sampleLibraryTasteFromTitles(userId, mediaType, sampleSize);

  return {
    ok: true as const,
    context,
  };
}

/**
 * Resolves the AI provider connection that should service the run. Re-verifies
 * the connection when its status is unverified or its persisted metadata
 * predates the AI-provider flavor seam (so we don't know whether chat
 * completions need the LM Studio /api/v1 -> /v1 rewrite). Returns the base
 * URL, encrypted secret, and resolved flavor on success.
 */
export async function ensureVerifiedAiProviderConnection(userId: string) {
  let aiProvider = await findServiceConnectionByType(userId, "ai-provider");

  if (!aiProvider?.secret) {
    return {
      ok: false as const,
      message: "Configure the AI provider connection before requesting recommendations.",
    };
  }

  // Re-verify when the connection is unverified, or when its persisted
  // metadata predates the AI-provider flavor seam so we don't know whether
  // chat completions need the LM Studio /api/v1 -> /v1 rewrite. The flavor
  // migration only fires when verification has previously stored
  // `availableModels` (i.e. a real verify happened) but no `aiProviderFlavor`
  // yet, so we don't loop for bare-metadata fixtures or fresh installs.
  const metadata = aiProvider.metadata;
  const hasLegacyVerifiedMetadata =
    metadata !== null &&
    Array.isArray(metadata.availableModels) &&
    parseAiProviderFlavor(metadata) === null;
  const needsReverify =
    aiProvider.connection.status !== "verified" || hasLegacyVerifiedMetadata;

  if (needsReverify) {
    const verificationResult = await verifyConfiguredServiceConnection(userId, "ai-provider");

    if (!verificationResult.ok) {
      return {
        ok: false as const,
        message: verificationResult.message,
      };
    }

    aiProvider = await findServiceConnectionByType(userId, "ai-provider");
  }

  if (
    !aiProvider?.secret ||
    aiProvider.connection.status !== "verified" ||
    !aiProvider.connection.baseUrl
  ) {
    return {
      ok: false as const,
      message: "The AI provider could not be verified automatically. Re-save the connection and try again.",
    };
  }

  return {
    ok: true as const,
    baseUrl: aiProvider.connection.baseUrl,
    encryptedSecret: aiProvider.secret.encryptedValue,
    flavor: parseAiProviderFlavor(aiProvider.metadata) ?? "openai-compatible",
  };
}
