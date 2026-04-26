import { decryptSecret } from "@/lib/security/secret-box";
import { setSonarrSeriesQualityProfile } from "@/modules/service-connections/adapters/library-collections";
import { parseLibraryManagerMetadata } from "@/modules/service-connections/library-manager-metadata";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { type UpdateSonarrSeriesQualityProfileInput } from "@/modules/service-connections/schemas/update-sonarr-series-quality-profile";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type UpdateSonarrSeriesQualityProfileWorkflowInput = Omit<
  UpdateSonarrSeriesQualityProfileInput,
  "returnTo"
>;

export type UpdateSonarrSeriesQualityProfileResult =
  | { ok: true; message: string; qualityProfileId: number; qualityProfileName: string }
  | { ok: false; message: string; field?: "qualityProfileId" };

export async function updateSonarrSeriesQualityProfileForUser(
  userId: string,
  input: UpdateSonarrSeriesQualityProfileWorkflowInput,
): Promise<UpdateSonarrSeriesQualityProfileResult> {
  const definition = getServiceConnectionDefinition("sonarr");
  const connection = await findServiceConnectionByType(userId, "sonarr");

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before changing series quality profiles.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before changing series quality profiles.`,
    };
  }

  const metadata = parseLibraryManagerMetadata(connection.metadata);

  if (!metadata || metadata.qualityProfiles.length === 0) {
    return {
      ok: false,
      message: `Re-run ${definition.displayName} verification to load quality profiles.`,
      field: "qualityProfileId",
    };
  }

  const selectedProfile = metadata.qualityProfiles.find(
    (profile) => profile.id === input.qualityProfileId,
  );

  if (!selectedProfile) {
    return {
      ok: false,
      message: "Select a valid Sonarr quality profile.",
      field: "qualityProfileId",
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  const adapterResult = await setSonarrSeriesQualityProfile({
    baseUrl,
    apiKey,
    seriesId: input.seriesId,
    qualityProfileId: input.qualityProfileId,
  });

  if (!adapterResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.sonarr.series-quality-profile.failed",
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        sonarrSeriesId: input.seriesId,
        qualityProfileId: input.qualityProfileId,
        message: adapterResult.message,
      }),
    });

    return {
      ok: false,
      message: `Failed to update ${definition.displayName} quality profile: ${adapterResult.message}`,
    };
  }

  const qualityProfileName = adapterResult.qualityProfileName ?? selectedProfile.name;

  await createAuditEvent({
    actorUserId: userId,
    eventType: "service-connections.sonarr.series-quality-profile.succeeded",
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      sonarrSeriesId: input.seriesId,
      qualityProfileId: adapterResult.qualityProfileId,
      qualityProfileName,
    }),
  });

  return {
    ok: true,
    qualityProfileId: adapterResult.qualityProfileId,
    qualityProfileName,
    message: `Updated ${definition.displayName}: quality profile set to ${qualityProfileName}.`,
  };
}