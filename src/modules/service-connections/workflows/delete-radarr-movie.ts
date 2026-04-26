import { decryptSecret } from "@/lib/security/secret-box";
import { deleteRadarrMovie } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type DeleteRadarrMovieInput } from "@/modules/service-connections/schemas/delete-radarr-movie";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type DeleteRadarrMovieWorkflowInput = Omit<DeleteRadarrMovieInput, "returnTo">;

export type DeleteRadarrMovieResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function deleteRadarrMovieForUser(
  userId: string,
  input: DeleteRadarrMovieWorkflowInput,
): Promise<DeleteRadarrMovieResult> {
  const definition = getServiceConnectionDefinition("radarr");
  const connection = await findServiceConnectionByType(userId, "radarr");

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before deleting a movie.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before deleting a movie.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  const adapterResult = await deleteRadarrMovie({
    baseUrl,
    apiKey,
    movieId: input.movieId,
    deleteFiles: input.deleteFiles,
  });

  if (!adapterResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.radarr.movie-delete.failed",
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        radarrMovieId: input.movieId,
        deleteFiles: input.deleteFiles,
        message: adapterResult.message,
      }),
    });

    return {
      ok: false,
      message: `Failed to delete from ${definition.displayName}: ${adapterResult.message}`,
    };
  }

  await createAuditEvent({
    actorUserId: userId,
    eventType: "service-connections.radarr.movie-delete.succeeded",
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      radarrMovieId: input.movieId,
      deleteFiles: input.deleteFiles,
    }),
  });

  return {
    ok: true,
    message: input.deleteFiles
      ? `Deleted movie and files from ${definition.displayName}.`
      : `Removed movie from ${definition.displayName}; files were kept on disk.`,
  };
}
