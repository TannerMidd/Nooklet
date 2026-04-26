import { decryptSecret } from "@/lib/security/secret-box";
import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import {
  findRecommendationItemForUser,
  markRecommendationItemExistingInLibrary,
  updateRecommendationItemProviderMetadata,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { type FinalizeRecommendationEpisodeSelectionInput } from "@/modules/recommendations/schemas/finalize-episode-selection";
import {
  listSonarrEpisodes,
  searchSonarrEpisodes,
  setSonarrEpisodesMonitored,
  type SonarrEpisode,
} from "@/modules/service-connections/adapters/sonarr-episodes";
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

type Dependencies = {
  listEpisodes?: typeof listSonarrEpisodes;
  setMonitored?: typeof setSonarrEpisodesMonitored;
  searchEpisodes?: typeof searchSonarrEpisodes;
};

export async function finalizeRecommendationEpisodeSelection(
  userId: string,
  input: FinalizeRecommendationEpisodeSelectionInput,
  dependencies: Dependencies = {},
): Promise<FinalizeRecommendationEpisodeSelectionResult> {
  const listEpisodes = dependencies.listEpisodes ?? listSonarrEpisodes;
  const setMonitored = dependencies.setMonitored ?? setSonarrEpisodesMonitored;
  const searchEpisodes = dependencies.searchEpisodes ?? searchSonarrEpisodes;

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

  const listResult = await listEpisodes({
    baseUrl,
    apiKey,
    seriesId: itemMetadata.sonarrSeriesId,
  });

  if (!listResult.ok) {
    await emitFailureAudit(userId, item.itemId, input, {
      stage: "list",
      message: listResult.message,
    });
    return {
      ok: false,
      message: `Failed to load episodes from ${definition.displayName}: ${listResult.message}`,
    };
  }

  const availableIds = new Set(listResult.episodes.map((episode: SonarrEpisode) => episode.id));
  const requestedIds = Array.from(new Set(input.episodeIds));

  if (requestedIds.some((episodeId) => !availableIds.has(episodeId))) {
    return {
      ok: false,
      message: "Select only episodes returned by Sonarr for this series.",
      field: "episodeIds",
    };
  }

  const monitoredIdsToDisable = listResult.episodes
    .filter((episode) => episode.monitored && !requestedIds.includes(episode.id))
    .map((episode) => episode.id);

  if (monitoredIdsToDisable.length > 0) {
    const disableResult = await setMonitored({
      baseUrl,
      apiKey,
      episodeIds: monitoredIdsToDisable,
      monitored: false,
    });

    if (!disableResult.ok) {
      await emitFailureAudit(userId, item.itemId, input, {
        stage: "unmonitor",
        message: disableResult.message,
      });
      return {
        ok: false,
        message: `Failed to update ${definition.displayName} monitoring: ${disableResult.message}`,
      };
    }
  }

  const enableResult = await setMonitored({
    baseUrl,
    apiKey,
    episodeIds: requestedIds,
    monitored: true,
  });

  if (!enableResult.ok) {
    await emitFailureAudit(userId, item.itemId, input, {
      stage: "monitor",
      message: enableResult.message,
    });
    return {
      ok: false,
      message: `Failed to update ${definition.displayName} monitoring: ${enableResult.message}`,
    };
  }

  const searchResult = await searchEpisodes({
    baseUrl,
    apiKey,
    episodeIds: requestedIds,
  });

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
      unmonitoredEpisodeCount: monitoredIdsToDisable.length,
      searchTriggered: searchResult.ok,
      searchWarning: searchResult.ok ? undefined : searchResult.message,
    }),
  });

  return {
    ok: true,
    message: `Updated ${definition.displayName}: monitoring ${requestedIds.length} ${requestedIds.length === 1 ? "episode" : "episodes"}.`,
    monitoredEpisodeCount: requestedIds.length,
    searchTriggered: searchResult.ok,
    searchWarning: searchResult.ok ? undefined : searchResult.message,
  };
}

async function emitFailureAudit(
  userId: string,
  itemId: string,
  input: FinalizeRecommendationEpisodeSelectionInput,
  failure: { stage: "list" | "monitor" | "unmonitor"; message: string },
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
