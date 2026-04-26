import { decryptSecret } from "@/lib/security/secret-box";
import { triggerRadarrMovieSearch } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { type TriggerRadarrMovieSearchInput } from "@/modules/service-connections/schemas/trigger-radarr-movie-search";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type TriggerRadarrMovieSearchWorkflowInput = Omit<TriggerRadarrMovieSearchInput, "returnTo">;

export type TriggerRadarrMovieSearchResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function triggerRadarrMovieSearchForUser(
  userId: string,
  input: TriggerRadarrMovieSearchWorkflowInput,
): Promise<TriggerRadarrMovieSearchResult> {
  const definition = getServiceConnectionDefinition("radarr");
  const connection = await findServiceConnectionByType(userId, "radarr");

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before triggering a movie search.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before triggering a movie search.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  const adapterResult = await triggerRadarrMovieSearch({
    baseUrl,
    apiKey,
    movieId: input.movieId,
  });

  if (!adapterResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.radarr.movie-search.failed",
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        radarrMovieId: input.movieId,
        message: adapterResult.message,
      }),
    });

    return {
      ok: false,
      message: `Failed to trigger ${definition.displayName} search: ${adapterResult.message}`,
    };
  }

  await createAuditEvent({
    actorUserId: userId,
    eventType: "service-connections.radarr.movie-search.succeeded",
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      radarrMovieId: input.movieId,
    }),
  });

  return {
    ok: true,
    message: `Triggered ${definition.displayName} search for this movie.`,
  };
}