import { decryptSecret } from "@/lib/security/secret-box";
import {
  listRadarrLibraryMovies,
  listSonarrLibrarySeries,
  type RadarrLibraryMovie,
  type SonarrLibrarySeries,
} from "@/modules/service-connections/adapters/library-collections";
import { type LibraryManagerServiceType } from "@/modules/service-connections/adapters/add-library-item";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";

export type ListLibraryCollectionForUserResult =
  | {
      ok: true;
      serviceType: "sonarr";
      items: SonarrLibrarySeries[];
    }
  | {
      ok: true;
      serviceType: "radarr";
      items: RadarrLibraryMovie[];
    }
  | { ok: false; message: string; reason: "not-configured" | "not-verified" | "request-failed" };

export async function listLibraryCollectionForUser(
  userId: string,
  serviceType: LibraryManagerServiceType,
): Promise<ListLibraryCollectionForUserResult> {
  const definition = getServiceConnectionDefinition(serviceType);
  const connection = await findServiceConnectionByType(userId, serviceType);

  if (!connection?.secret) {
    return {
      ok: false,
      reason: "not-configured",
      message: `Configure ${definition.displayName} before browsing the library.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      reason: "not-verified",
      message: `Verify ${definition.displayName} before browsing the library.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);

  if (serviceType === "sonarr") {
    const result = await listSonarrLibrarySeries({ baseUrl, apiKey });

    if (!result.ok) {
      return { ok: false, reason: "request-failed", message: result.message };
    }

    return { ok: true, serviceType: "sonarr", items: result.items };
  }

  const result = await listRadarrLibraryMovies({ baseUrl, apiKey });

  if (!result.ok) {
    return { ok: false, reason: "request-failed", message: result.message };
  }

  return { ok: true, serviceType: "radarr", items: result.items };
}
