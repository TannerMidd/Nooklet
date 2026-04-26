import { decryptSecret } from "@/lib/security/secret-box";
import { listSonarrEpisodes } from "@/modules/service-connections/adapters/sonarr-episodes";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type SonarrEpisode } from "@/modules/service-connections/types/sonarr-episodes";

export type ListSonarrSeriesEpisodesForUserResult =
  | { ok: true; episodes: SonarrEpisode[] }
  | {
      ok: false;
      message: string;
      reason: "not-configured" | "not-verified" | "request-failed";
    };

export async function listSonarrSeriesEpisodesForUser(
  userId: string,
  seriesId: number,
): Promise<ListSonarrSeriesEpisodesForUserResult> {
  const definition = getServiceConnectionDefinition("sonarr");
  const connection = await findServiceConnectionByType(userId, "sonarr");

  if (!connection?.secret) {
    return {
      ok: false,
      reason: "not-configured",
      message: `Configure ${definition.displayName} before browsing episodes.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      reason: "not-verified",
      message: `Verify ${definition.displayName} before browsing episodes.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  const result = await listSonarrEpisodes({ baseUrl, apiKey, seriesId });

  if (!result.ok) {
    return { ok: false, reason: "request-failed", message: result.message };
  }

  return { ok: true, episodes: result.episodes };
}
