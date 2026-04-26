import { decryptSecret } from "@/lib/security/secret-box";
import { setRadarrMovieMonitoring } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type UpdateRadarrMovieMonitoringInput } from "@/modules/service-connections/schemas/update-radarr-movie-monitoring";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type UpdateRadarrMovieMonitoringWorkflowInput = Omit<
  UpdateRadarrMovieMonitoringInput,
  "returnTo"
>;

export type UpdateRadarrMovieMonitoringResult =
  | { ok: true; message: string; monitored: boolean }
  | { ok: false; message: string };

export async function updateRadarrMovieMonitoringForUser(
  userId: string,
  input: UpdateRadarrMovieMonitoringWorkflowInput,
): Promise<UpdateRadarrMovieMonitoringResult> {
  const definition = getServiceConnectionDefinition("radarr");
  const connection = await findServiceConnectionByType(userId, "radarr");

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before updating movie monitoring.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before updating movie monitoring.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  const adapterResult = await setRadarrMovieMonitoring({
    baseUrl,
    apiKey,
    movieId: input.movieId,
    monitored: input.monitored,
  });

  if (!adapterResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.radarr.movie-monitoring.failed",
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        radarrMovieId: input.movieId,
        monitored: input.monitored,
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
    eventType: "service-connections.radarr.movie-monitoring.succeeded",
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      radarrMovieId: input.movieId,
      monitored: adapterResult.monitored,
    }),
  });

  return {
    ok: true,
    monitored: adapterResult.monitored,
    message: adapterResult.monitored
      ? `Updated ${definition.displayName}: monitoring this movie.`
      : `Updated ${definition.displayName}: ignoring this movie.`,
  };
}
