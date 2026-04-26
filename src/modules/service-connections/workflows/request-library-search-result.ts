import { type AddLibrarySearchRequestInput } from "@/modules/service-connections/schemas/add-library-search-request";

import { requestLibraryItem, type RequestLibraryItemResult } from "./request-library-item";

function getLibraryManagerLabel(serviceType: AddLibrarySearchRequestInput["serviceType"]) {
  return serviceType === "sonarr" ? "Sonarr" : "Radarr";
}

export async function requestLibrarySearchResult(
  userId: string,
  input: AddLibrarySearchRequestInput,
): Promise<RequestLibraryItemResult> {
  const serviceLabel = getLibraryManagerLabel(input.serviceType);

  return requestLibraryItem(
    userId,
    {
      serviceType: input.serviceType,
      title: input.title,
      year: input.year,
      rootFolderPath: input.rootFolderPath,
      qualityProfileId: input.qualityProfileId,
      seasonSelectionMode: input.seasonSelectionMode,
      seasonNumbers: input.seasonNumbers,
      tagIds: input.tagIds,
    },
    {
      availableSeasonNumbers: input.availableSeasonNumbers,
      subjectType: "service-connection",
      eventTypePrefix: "service-connections.library-search-request",
      configureMessage: `Configure ${serviceLabel} before requesting titles directly.`,
      verifyMessage: `Verify ${serviceLabel} before requesting titles directly.`,
      auditPayload: {
        requestSource: "direct-search",
      },
    },
  );
}