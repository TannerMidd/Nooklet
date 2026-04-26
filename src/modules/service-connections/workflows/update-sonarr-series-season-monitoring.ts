import { decryptSecret } from "@/lib/security/secret-box";
import { setSonarrSeriesSeasonMonitoring } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type UpdateSonarrSeriesSeasonMonitoringInput } from "@/modules/service-connections/schemas/update-sonarr-series-season-monitoring";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type UpdateSonarrSeriesSeasonMonitoringWorkflowInput = Omit<
  UpdateSonarrSeriesSeasonMonitoringInput,
  "returnTo"
>;

export type UpdateSonarrSeriesSeasonMonitoringResult =
  | {
      ok: true;
      message: string;
      monitoredSeasonCount: number;
    }
  | {
      ok: false;
      message: string;
    };

export async function updateSonarrSeriesSeasonMonitoringForUser(
  userId: string,
  input: UpdateSonarrSeriesSeasonMonitoringWorkflowInput,
): Promise<UpdateSonarrSeriesSeasonMonitoringResult> {
  const definition = getServiceConnectionDefinition("sonarr");
  const connection = await findServiceConnectionByType(userId, "sonarr");

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before updating monitored seasons.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before updating monitored seasons.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  // De-duplicate season numbers and reject negative values.
  const normalizedSeasonNumbers = Array.from(
    new Set(input.monitoredSeasonNumbers.filter((value) => Number.isInteger(value) && value >= 0)),
  ).sort((left, right) => left - right);

  const adapterResult = await setSonarrSeriesSeasonMonitoring({
    baseUrl,
    apiKey,
    seriesId: input.seriesId,
    monitoredSeasonNumbers: normalizedSeasonNumbers,
  });

  if (!adapterResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.sonarr.season-monitoring.failed",
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        sonarrSeriesId: input.seriesId,
        monitoredSeasonNumbers: normalizedSeasonNumbers,
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
    eventType: "service-connections.sonarr.season-monitoring.succeeded",
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      sonarrSeriesId: input.seriesId,
      monitoredSeasonNumbers: normalizedSeasonNumbers,
      monitoredSeasonCount: adapterResult.monitoredSeasonCount,
    }),
  });

  const monitoredCount = adapterResult.monitoredSeasonCount;

  return {
    ok: true,
    monitoredSeasonCount: monitoredCount,
    message:
      monitoredCount === 0
        ? `Updated ${definition.displayName}: no seasons monitored.`
        : `Updated ${definition.displayName}: monitoring ${monitoredCount} ${monitoredCount === 1 ? "season" : "seasons"}.`,
  };
}
