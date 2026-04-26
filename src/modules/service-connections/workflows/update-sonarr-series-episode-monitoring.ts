import { decryptSecret } from "@/lib/security/secret-box";
import { applySonarrEpisodeMonitoring } from "@/modules/service-connections/workflows/apply-sonarr-episode-monitoring";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type UpdateSonarrSeriesEpisodeMonitoringInput } from "@/modules/service-connections/schemas/update-sonarr-series-episode-monitoring";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

export type UpdateSonarrSeriesEpisodeMonitoringResult =
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

export async function updateSonarrSeriesEpisodeMonitoringForUser(
  userId: string,
  input: UpdateSonarrSeriesEpisodeMonitoringInput,
): Promise<UpdateSonarrSeriesEpisodeMonitoringResult> {
  const definition = getServiceConnectionDefinition("sonarr");
  const connection = await findServiceConnectionByType(userId, "sonarr");

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before updating monitored episodes.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before updating monitored episodes.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  const requestedEpisodeIds = Array.from(
    new Set(input.episodeIds.filter((value) => Number.isInteger(value) && value > 0)),
  );

  const applyResult = await applySonarrEpisodeMonitoring({
    baseUrl,
    apiKey,
    seriesId: input.seriesId,
    requestedEpisodeIds,
  });

  if (!applyResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.sonarr.episode-monitoring.failed",
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        sonarrSeriesId: input.seriesId,
        stage: applyResult.stage,
        message: applyResult.message,
        requestedEpisodeIds,
      }),
    });

    return {
      ok: false,
      message: `Failed to update ${definition.displayName} monitoring: ${applyResult.message}`,
      field: applyResult.field,
    };
  }

  await createAuditEvent({
    actorUserId: userId,
    eventType: "service-connections.sonarr.episode-monitoring.succeeded",
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      sonarrSeriesId: input.seriesId,
      monitoredEpisodeCount: applyResult.monitoredEpisodeCount,
      unmonitoredEpisodeCount: applyResult.unmonitoredEpisodeCount,
      searchTriggered: applyResult.searchTriggered,
      searchWarning: applyResult.searchWarning,
    }),
  });

  const monitoredCount = applyResult.monitoredEpisodeCount;

  return {
    ok: true,
    monitoredEpisodeCount: monitoredCount,
    searchTriggered: applyResult.searchTriggered,
    searchWarning: applyResult.searchWarning,
    message:
      monitoredCount === 0
        ? `Updated ${definition.displayName}: no episodes monitored.`
        : `Updated ${definition.displayName}: monitoring ${monitoredCount} ${monitoredCount === 1 ? "episode" : "episodes"}.`,
  };
}
