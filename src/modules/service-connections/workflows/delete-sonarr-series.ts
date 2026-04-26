import { decryptSecret } from "@/lib/security/secret-box";
import { deleteSonarrSeries } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type DeleteSonarrSeriesInput } from "@/modules/service-connections/schemas/delete-sonarr-series";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type DeleteSonarrSeriesWorkflowInput = Omit<DeleteSonarrSeriesInput, "returnTo">;

export type DeleteSonarrSeriesResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function deleteSonarrSeriesForUser(
  userId: string,
  input: DeleteSonarrSeriesWorkflowInput,
): Promise<DeleteSonarrSeriesResult> {
  const definition = getServiceConnectionDefinition("sonarr");
  const connection = await findServiceConnectionByType(userId, "sonarr");

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before deleting a series.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before deleting a series.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  const adapterResult = await deleteSonarrSeries({
    baseUrl,
    apiKey,
    seriesId: input.seriesId,
    deleteFiles: input.deleteFiles,
  });

  if (!adapterResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.sonarr.series-delete.failed",
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        sonarrSeriesId: input.seriesId,
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
    eventType: "service-connections.sonarr.series-delete.succeeded",
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      sonarrSeriesId: input.seriesId,
      deleteFiles: input.deleteFiles,
    }),
  });

  return {
    ok: true,
    message: input.deleteFiles
      ? `Deleted series and files from ${definition.displayName}.`
      : `Removed series from ${definition.displayName}; files were kept on disk.`,
  };
}
