import { decryptSecret } from "@/lib/security/secret-box";
import { setRadarrMovieQualityProfile } from "@/modules/service-connections/adapters/library-collections";
import { parseLibraryManagerMetadata } from "@/modules/service-connections/library-manager-metadata";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { type UpdateRadarrMovieQualityProfileInput } from "@/modules/service-connections/schemas/update-radarr-movie-quality-profile";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type UpdateRadarrMovieQualityProfileWorkflowInput = Omit<
  UpdateRadarrMovieQualityProfileInput,
  "returnTo"
>;

export type UpdateRadarrMovieQualityProfileResult =
  | { ok: true; message: string; qualityProfileId: number; qualityProfileName: string }
  | { ok: false; message: string; field?: "qualityProfileId" };

export async function updateRadarrMovieQualityProfileForUser(
  userId: string,
  input: UpdateRadarrMovieQualityProfileWorkflowInput,
): Promise<UpdateRadarrMovieQualityProfileResult> {
  const definition = getServiceConnectionDefinition("radarr");
  const connection = await findServiceConnectionByType(userId, "radarr");

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before changing movie quality profiles.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before changing movie quality profiles.`,
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
      message: "Select a valid Radarr quality profile.",
      field: "qualityProfileId",
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  const adapterResult = await setRadarrMovieQualityProfile({
    baseUrl,
    apiKey,
    movieId: input.movieId,
    qualityProfileId: input.qualityProfileId,
  });

  if (!adapterResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: "service-connections.radarr.movie-quality-profile.failed",
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        radarrMovieId: input.movieId,
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
    eventType: "service-connections.radarr.movie-quality-profile.succeeded",
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      radarrMovieId: input.movieId,
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