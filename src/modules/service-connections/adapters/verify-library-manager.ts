import { fetchJsonWithTimeout, trimTrailingSlash } from "@/lib/integrations/http-helpers";
import {
  buildLibraryManagerVerificationResult,
  normalizeLibraryManagerMetadata,
  type LibraryManagerQualityProfileResponse,
  type LibraryManagerRootFolderResponse,
  type LibraryManagerTagResponse,
} from "@/modules/service-connections/adapters/verify-service-connection-helpers";

import type {
  VerifyServiceConnectionInput,
  VerifyServiceConnectionResult,
} from "./verify-service-connection-types";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";

export async function verifyLibraryManager(
  input: VerifyServiceConnectionInput,
): Promise<VerifyServiceConnectionResult> {
  const headers = {
    "X-Api-Key": input.secret,
  };

  try {
    await fetchJsonWithTimeout<Record<string, unknown>>(
      `${trimTrailingSlash(input.baseUrl)}/api/v3/system/status`,
      {
        headers,
        cache: "no-store",
      },
      SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
    );

    const [rootFolders, qualityProfiles, tags] = await Promise.all([
      fetchJsonWithTimeout<LibraryManagerRootFolderResponse>(
        `${trimTrailingSlash(input.baseUrl)}/api/v3/rootfolder`,
        {
          headers,
          cache: "no-store",
        },
        SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
      ),
      fetchJsonWithTimeout<LibraryManagerQualityProfileResponse>(
        `${trimTrailingSlash(input.baseUrl)}/api/v3/qualityprofile`,
        {
          headers,
          cache: "no-store",
        },
        SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
      ),
      fetchJsonWithTimeout<LibraryManagerTagResponse>(
        `${trimTrailingSlash(input.baseUrl)}/api/v3/tag`,
        {
          headers,
          cache: "no-store",
        },
        SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS,
      ),
    ]);
    const metadata = normalizeLibraryManagerMetadata({
      rootFolders,
      qualityProfiles,
      tags,
    });

    return buildLibraryManagerVerificationResult(metadata);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Connection verification failed unexpectedly.",
    };
  }
}
