import { decryptSecret } from "@/lib/security/secret-box";
import { triggerSonarrSeriesSearch } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { type TriggerSonarrSeriesSearchInput } from "@/modules/service-connections/schemas/trigger-sonarr-series-search";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type TriggerSonarrSeriesSearchWorkflowInput = Omit<TriggerSonarrSeriesSearchInput, "returnTo">;

export type TriggerSonarrSeriesSearchResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function triggerSonarrSeriesSearchForUser(
  userId: string,
  input: TriggerSonarrSeriesSearchWorkflowInput,
): Promise<TriggerSonarrSeriesSearchResult> {
  const definition = getServiceConnectionDefinition("sonarr");
  const connection = await findServiceConnectionByType(userId, "sonarr");

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before triggering a series search.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before triggering a series search.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  const adapterResult = await triggerSonarrSeriesSearch({
    baseUrl,
    apiKey,
    seriesId: input.seriesId,
  });

  if (!adapterResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.sonarr.series-search.failed",
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        sonarrSeriesId: input.seriesId,
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
    eventType: "service-connections.sonarr.series-search.succeeded",
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      sonarrSeriesId: input.seriesId,
    }),
  });

  return {
    ok: true,
    message: `Triggered ${definition.displayName} search for this series.`,
  };
}