import { decryptSecret } from "@/lib/security/secret-box";
import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import {
  findRecommendationItemForUser,
  markRecommendationItemExistingInLibrary,
  updateRecommendationItemProviderMetadata,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { type FinalizeRecommendationEpisodeSelectionInput } from "@/modules/recommendations/schemas/finalize-episode-selection";
import {
  applySonarrEpisodeMonitoring,
  type ApplySonarrEpisodeMonitoringDependencies,
} from "@/modules/service-connections/workflows/apply-sonarr-episode-monitoring";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

export type FinalizeRecommendationEpisodeSelectionResult =
  | {
      ok: true;
      message: string;
      monitoredEpisodeCount: number;
      searchTriggered: boolean;
      searchWarning?: string;
    }
  | {
      ok: false;
      message: string;
      field?: "episodeIds";
    };

type Dependencies = ApplySonarrEpisodeMonitoringDependencies;

export async function finalizeRecommendationEpisodeSelection(
  userId: string,
  input: FinalizeRecommendationEpisodeSelectionInput,
  dependencies: Dependencies = {},
): Promise<FinalizeRecommendationEpisodeSelectionResult> {
  const definition = getServiceConnectionDefinition("sonarr");
  const item = await findRecommendationItemForUser(userId, input.itemId);

  if (!item || item.mediaType !== "tv") {
    return { ok: false, message: "Recommendation item not found." };
  }

  const itemMetadata = parseRecommendationProviderMetadata(item.providerMetadataJson);

  if (!itemMetadata?.pendingEpisodeSelection || !itemMetadata.sonarrSeriesId) {
    return {
      ok: false,
      message:
        "This recommendation is not waiting for episode selection. Add it to Sonarr first.",
    };
  }

  const connection = await findServiceConnectionByType(userId, "sonarr");

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before continuing.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before continuing.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  const applyResult = await applySonarrEpisodeMonitoring(
    {
      baseUrl,
      apiKey,
      seriesId: itemMetadata.sonarrSeriesId,
      requestedEpisodeIds: input.episodeIds,
    },
    dependencies,
  );

  if (!applyResult.ok) {
    await emitFailureAudit(userId, item.itemId, input, {
      stage: applyResult.stage,
      message: applyResult.message,
    });

    if (applyResult.stage === "list") {
      return {
        ok: false,
        message: `Failed to load episodes from ${definition.displayName}: ${applyResult.message}`,
      };
    }

    if (applyResult.field) {
      return {
        ok: false,
        message: applyResult.message,
        field: applyResult.field,
      };
    }

    return {
      ok: false,
      message: `Failed to update ${definition.displayName} monitoring: ${applyResult.message}`,
    };
  }

  const requestedIds = Array.from(new Set(input.episodeIds));

  const nextMetadata: Record<string, unknown> = { ...itemMetadata };
  delete nextMetadata.pendingEpisodeSelection;
  delete nextMetadata.pendingEpisodeReturnTo;

  await updateRecommendationItemProviderMetadata(
    item.itemId,
    JSON.stringify(nextMetadata),
  );

  await markRecommendationItemExistingInLibrary(item.itemId, true);

  await createAuditEvent({
    actorUserId: userId,
    eventType: "recommendations.item.episode-selection.succeeded",
    subjectType: "recommendation-item",
    subjectId: item.itemId,
    payloadJson: JSON.stringify({
      sonarrSeriesId: itemMetadata.sonarrSeriesId,
      monitoredEpisodeCount: requestedIds.length,
      unmonitoredEpisodeCount: applyResult.unmonitoredEpisodeCount,
      searchTriggered: applyResult.searchTriggered,
      searchWarning: applyResult.searchWarning,
    }),
  });

  return {
    ok: true,
    message: `Updated ${definition.displayName}: monitoring ${requestedIds.length} ${requestedIds.length === 1 ? "episode" : "episodes"}.`,
    monitoredEpisodeCount: requestedIds.length,
    searchTriggered: applyResult.searchTriggered,
    searchWarning: applyResult.searchWarning,
  };
}

async function emitFailureAudit(
  userId: string,
  itemId: string,
  input: FinalizeRecommendationEpisodeSelectionInput,
  failure: { stage: "list" | "monitor" | "unmonitor" | "ensure-seasons"; message: string },
) {
  await createAuditEvent({
    actorUserId: userId,
    eventType: "recommendations.item.episode-selection.failed",
    subjectType: "recommendation-item",
    subjectId: itemId,
    payloadJson: JSON.stringify({
      stage: failure.stage,
      message: failure.message,
      requestedEpisodeIds: input.episodeIds,
    }),
  });
}
