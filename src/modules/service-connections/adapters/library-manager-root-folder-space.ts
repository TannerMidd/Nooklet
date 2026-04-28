import { fetchJsonWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";

import {
  mergeLibraryManagerRootFolderFreeSpace,
  type LibraryManagerRootFolderResponse,
} from "./verify-service-connection-helpers";
import { type LibraryManagerMetadata } from "../library-manager-metadata";

type RefreshLibraryManagerRootFolderFreeSpaceInput = {
  baseUrl: string;
  apiKey: string;
  rootFolders: LibraryManagerMetadata["rootFolders"];
};

export async function refreshLibraryManagerRootFolderFreeSpace(
  input: RefreshLibraryManagerRootFolderFreeSpaceInput,
) {
  try {
    const rootFolders = await fetchJsonWithTimeout<LibraryManagerRootFolderResponse>(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/rootfolder`,
      {
        headers: {
          "X-Api-Key": input.apiKey,
        },
        cache: "no-store",
      },
    );

    return mergeLibraryManagerRootFolderFreeSpace(input.rootFolders, rootFolders);
  } catch {
    return input.rootFolders;
  }
}