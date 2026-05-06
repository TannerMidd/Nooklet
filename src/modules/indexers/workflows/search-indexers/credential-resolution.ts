import { decryptSecret } from "@/lib/security/secret-box";
import { findIndexerSecret } from "@/modules/indexers/repositories/indexer-repository";
import { type SelectedIndexerSearchSource } from "./indexer-selection";

export type ResolvedIndexerSearchSource = SelectedIndexerSearchSource & {
  apiKey: string;
};

export async function resolveIndexerSearchCredentials(
  sources: SelectedIndexerSearchSource[],
): Promise<ResolvedIndexerSearchSource[]> {
  const resolved: ResolvedIndexerSearchSource[] = [];

  for (const source of sources) {
    const secret = await findIndexerSecret(source.indexer.id);

    if (secret) {
      resolved.push({ ...source, apiKey: decryptSecret(secret.encryptedApiKey) });
    }
  }

  return resolved;
}
