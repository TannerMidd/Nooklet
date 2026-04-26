import { decryptSecret } from "@/lib/security/secret-box";
import {
  searchLibraryItems,
  type LibraryManagerServiceType,
  type LibrarySearchResult,
} from "@/modules/service-connections/adapters/add-library-item";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";

type SearchLibraryItemsForUserInput = {
  serviceType: LibraryManagerServiceType;
  query: string;
  limit?: number;
};

type SearchLibraryItemsForUserResult =
  | { ok: true; items: LibrarySearchResult[] }
  | { ok: false; message: string };

export async function searchLibraryItemsForUser(
  userId: string,
  input: SearchLibraryItemsForUserInput,
): Promise<SearchLibraryItemsForUserResult> {
  const normalizedQuery = input.query.trim();

  if (normalizedQuery.length < 2) {
    return {
      ok: true,
      items: [],
    };
  }

  const definition = getServiceConnectionDefinition(input.serviceType);
  const connection = await findServiceConnectionByType(userId, input.serviceType);

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before searching from this page.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before searching from this page.`,
    };
  }

  return searchLibraryItems({
    serviceType: input.serviceType,
    baseUrl: connection.connection.baseUrl ?? "",
    apiKey: decryptSecret(connection.secret.encryptedValue),
    query: normalizedQuery,
    limit: input.limit,
  });
}