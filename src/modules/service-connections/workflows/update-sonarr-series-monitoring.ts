import { decryptSecret } from "@/lib/security/secret-box";
import { setSonarrSeriesMonitoring } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type UpdateSonarrSeriesMonitoringInput } from "@/modules/service-connections/schemas/update-sonarr-series-monitoring";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type UpdateSonarrSeriesMonitoringWorkflowInput = Omit<
  UpdateSonarrSeriesMonitoringInput,
  "returnTo"
>;

export type UpdateSonarrSeriesMonitoringResult =
  | {
      ok: true;
      message: string;
      monitored: boolean;
      monitoredSeasonCount: number;
    }
  | {
      ok: false;
      message: string;
    };

export async function updateSonarrSeriesMonitoringForUser(
  userId: string,
  input: UpdateSonarrSeriesMonitoringWorkflowInput,
): Promise<UpdateSonarrSeriesMonitoringResult> {
  const definition = getServiceConnectionDefinition("sonarr");
  const connection = await findServiceConnectionByType(userId, "sonarr");

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before updating series monitoring.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before updating series monitoring.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  const adapterResult = await setSonarrSeriesMonitoring({
    baseUrl,
    apiKey,
    seriesId: input.seriesId,
    monitored: input.monitored,
    applyToAllSeasons: input.applyToAllSeasons,
  });

  if (!adapterResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.sonarr.series-monitoring.failed",
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        sonarrSeriesId: input.seriesId,
        monitored: input.monitored,
        applyToAllSeasons: input.applyToAllSeasons,
        message: adapterResult.message,
      }),
    });

    return {
      ok: false,
      message: `Failed to update ${definition.displayName} monitoring: ${adapterResult.message}`,
    };
  }

  await createAuditEvent({
    actorUserId: userId,
    eventType: "service-connections.sonarr.series-monitoring.succeeded",
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      sonarrSeriesId: input.seriesId,
      monitored: adapterResult.monitored,
      applyToAllSeasons: input.applyToAllSeasons,
      monitoredSeasonCount: adapterResult.monitoredSeasonCount,
    }),
  });

  const seriesLabel = adapterResult.monitored ? "monitoring" : "ignoring";
  const seasonsLabel = input.applyToAllSeasons
    ? ` (${adapterResult.monitoredSeasonCount} ${adapterResult.monitoredSeasonCount === 1 ? "season" : "seasons"} monitored)`
    : "";

  return {
    ok: true,
    monitored: adapterResult.monitored,
    monitoredSeasonCount: adapterResult.monitoredSeasonCount,
    message: `Updated ${definition.displayName}: ${seriesLabel} this series${seasonsLabel}.`,
  };
}
