import { decryptSecret } from "@/lib/security/secret-box";
import {
  applySonarrEpisodeMonitoring,
  type ApplySonarrEpisodeMonitoringDependencies,
} from "@/modules/service-connections/workflows/apply-sonarr-episode-monitoring";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type FinalizeSonarrEpisodeSelectionBySeriesInput } from "@/modules/service-connections/schemas/finalize-sonarr-episode-selection-by-series";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

export type FinalizeSonarrEpisodeSelectionBySeriesResult =
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

export async function finalizeSonarrEpisodeSelectionBySeries(
  userId: string,
  input: FinalizeSonarrEpisodeSelectionBySeriesInput,
  dependencies: Dependencies = {},
): Promise<FinalizeSonarrEpisodeSelectionBySeriesResult> {
  const definition = getServiceConnectionDefinition("sonarr");
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
      seriesId: input.seriesId,
      requestedEpisodeIds: input.episodeIds,
    },
    dependencies,
  );

  if (!applyResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.sonarr.episode-selection.failed",
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        sonarrSeriesId: input.seriesId,
        stage: applyResult.stage,
        message: applyResult.message,
        requestedEpisodeIds: input.episodeIds,
      }),
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

  const requestedCount = applyResult.monitoredEpisodeCount;

  await createAuditEvent({
    actorUserId: userId,
    eventType: "service-connections.sonarr.episode-selection.succeeded",
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      sonarrSeriesId: input.seriesId,
      monitoredEpisodeCount: requestedCount,
      unmonitoredEpisodeCount: applyResult.unmonitoredEpisodeCount,
      searchTriggered: applyResult.searchTriggered,
      searchWarning: applyResult.searchWarning,
    }),
  });

  return {
    ok: true,
    message: `Updated ${definition.displayName}: monitoring ${requestedCount} ${requestedCount === 1 ? "episode" : "episodes"}.`,
    monitoredEpisodeCount: requestedCount,
    searchTriggered: applyResult.searchTriggered,
    searchWarning: applyResult.searchWarning,
  };
}
