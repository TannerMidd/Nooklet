import { type MediaQualityProfile } from "@/lib/database/schema";

import { releaseMatchesQualityProfile } from "./quality";
import { releaseMatchesSelectionTarget, type ReleaseSelectionTarget } from "./target-matching";

export type ReleaseCandidate = {
  id: string;
  title: string;
  normalizedTitle: string;
  indexerGuid: string;
  qualityLabel: string | null;
  sizeBytes: number | null;
  publishedAt: Date | null;
  seeders: number | null;
  grabs: number | null;
};

export type ReleaseSelectionOptions = {
  qualityProfile: MediaQualityProfile;
  target?: ReleaseSelectionTarget | null;
  excludedResultIds?: string[];
  excludedReleaseKeys?: string[];
};

export function releaseExclusionKeys(
  result: Pick<ReleaseCandidate, "indexerGuid" | "normalizedTitle">,
) {
  return [`guid:${result.indexerGuid}`, `title:${result.normalizedTitle}`];
}

function resultTime(value: Date | null) {
  return value?.getTime() ?? 0;
}

export function selectReleaseCandidates<T extends ReleaseCandidate>(
  results: T[],
  options: ReleaseSelectionOptions,
): T[] {
  const excludedResultIds = new Set(options.excludedResultIds ?? []);
  const excludedReleaseKeys = new Set(options.excludedReleaseKeys ?? []);
  const target = options.target ?? null;

  return results
    .filter((result) => releaseMatchesQualityProfile(options.qualityProfile, result)
      && releaseMatchesSelectionTarget(result, target)
      && !excludedResultIds.has(result.id)
      && releaseExclusionKeys(result).every((key) => !excludedReleaseKeys.has(key)))
    .sort((left, right) => {
      const seeders = (right.seeders ?? -1) - (left.seeders ?? -1);

      if (seeders !== 0) {
        return seeders;
      }

      const grabs = (right.grabs ?? 0) - (left.grabs ?? 0);

      if (grabs !== 0) {
        return grabs;
      }

      const publishedAt = resultTime(right.publishedAt) - resultTime(left.publishedAt);

      if (publishedAt !== 0) {
        return publishedAt;
      }

      return (right.sizeBytes ?? 0) - (left.sizeBytes ?? 0);
    });
}
