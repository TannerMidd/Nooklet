import { type RecommendationMediaType } from "../../../lib/database/schema";
import { buildLibraryTasteItemKey } from "../../service-connections/adapters/add-library-item";

type RecommendationIdentity = {
  title: string;
  year: number | null;
};

const defaultRecommendationGenerationAttemptLimit = 3;
const defaultRecommendationGenerationOverfetchBuffer = 6;
const defaultRecommendationGenerationHardCap = 30;
const defaultRecommendationPromptExclusionLimit = 60;

function extractLibraryTitleKey(normalizedKey: string) {
  const separatorIndex = normalizedKey.lastIndexOf("::");

  return separatorIndex === -1 ? normalizedKey : normalizedKey.slice(0, separatorIndex);
}

function extractLibraryYear(normalizedKey: string) {
  const separatorIndex = normalizedKey.lastIndexOf("::");

  if (separatorIndex === -1) {
    return null;
  }

  const rawYear = normalizedKey.slice(separatorIndex + 2);

  if (rawYear === "unknown") {
    return null;
  }

  const parsedYear = Number.parseInt(rawYear, 10);

  return Number.isInteger(parsedYear) ? parsedYear : null;
}

function formatRecommendationTitle(item: RecommendationIdentity) {
  return `${item.title}${item.year ? ` (${item.year})` : ""}`;
}

function buildRecommendationItemKey(item: RecommendationIdentity) {
  return buildLibraryTasteItemKey(item);
}

function buildRecommendationExclusionIndex(excludedNormalizedKeys: string[]) {
  const keySet = new Set<string>();
  const titleYears = new Map<string, Set<number | null>>();

  for (const normalizedKey of excludedNormalizedKeys) {
    keySet.add(normalizedKey);

    const titleKey = extractLibraryTitleKey(normalizedKey);
    const titleYearsForKey = titleYears.get(titleKey) ?? new Set<number | null>();

    titleYearsForKey.add(extractLibraryYear(normalizedKey));
    titleYears.set(titleKey, titleYearsForKey);
  }

  return {
    keySet,
    titleYears,
  };
}

function shouldExcludeRecommendationItem(
  item: RecommendationIdentity,
  exclusionIndex: ReturnType<typeof buildRecommendationExclusionIndex>,
) {
  const normalizedKey = buildRecommendationItemKey(item);

  if (exclusionIndex.keySet.has(normalizedKey)) {
    return true;
  }

  const excludedYears = exclusionIndex.titleYears.get(extractLibraryTitleKey(normalizedKey));

  if (!excludedYears || excludedYears.size === 0) {
    return false;
  }

  if (item.year === null || excludedYears.has(null) || excludedYears.size === 1) {
    return true;
  }

  for (const excludedYear of excludedYears) {
    if (excludedYear !== null && Math.abs(excludedYear - item.year) <= 1) {
      return true;
    }
  }

  return false;
}

export function buildBackfillRequestPrompt(
  basePrompt: string,
  mediaType: RecommendationMediaType,
  remainingCount: number,
  excludedItems: RecommendationIdentity[],
  promptExclusionLimit = defaultRecommendationPromptExclusionLimit,
) {
  if (excludedItems.length === 0) {
    return basePrompt;
  }

  const exclusionBlock = excludedItems
    .slice(0, promptExclusionLimit)
    .map((item) => `- ${formatRecommendationTitle(item)}`)
    .join("\n");

  const promptSections = [basePrompt.trim()].filter((section) => section.length > 0);

  promptSections.push(
    `Backfill requirement: return ${remainingCount} additional ${mediaType === "tv" ? "TV series" : "movies"} that are genuinely new for this user.`,
    `Do not return any title from this exclusion list:\n${exclusionBlock}`,
  );

  return promptSections.join("\n\n");
}

export function dedupeRecommendationItems<T extends RecommendationIdentity>(items: T[]) {
  const seenKeys = new Set<string>();

  return items.filter((item) => {
    const key = buildRecommendationItemKey(item);

    if (seenKeys.has(key)) {
      return false;
    }

    seenKeys.add(key);
    return true;
  });
}

export function filterRecommendationItemsAgainstExclusions<T extends RecommendationIdentity>(
  items: T[],
  excludedNormalizedKeys: string[],
) {
  if (excludedNormalizedKeys.length === 0) {
    return {
      items,
      excludedCount: 0,
    };
  }

  const exclusionIndex = buildRecommendationExclusionIndex(excludedNormalizedKeys);
  const filteredItems = items.filter(
    (item) => !shouldExcludeRecommendationItem(item, exclusionIndex),
  );

  return {
    items: filteredItems,
    excludedCount: items.length - filteredItems.length,
  };
}

type GenerateBackfilledRecommendationItemsInput<T extends RecommendationIdentity> = {
  requestPrompt: string;
  requestedCount: number;
  mediaType: RecommendationMediaType;
  excludedNormalizedKeys: string[];
  generateRecommendations: (input: {
    requestPrompt: string;
    requestedCount: number;
  }) => Promise<T[]>;
  attemptLimit?: number;
  overfetchBuffer?: number;
  hardCap?: number;
  promptExclusionLimit?: number;
};

export async function generateBackfilledRecommendationItems<T extends RecommendationIdentity>(
  input: GenerateBackfilledRecommendationItemsInput<T>,
) {
  const acceptedItems: T[] = [];
  const seenGeneratedKeys = new Set<string>();
  const excludedPromptItems: RecommendationIdentity[] = [];
  let excludedExistingItemCount = 0;
  let attemptCount = 0;

  const attemptLimit = input.attemptLimit ?? defaultRecommendationGenerationAttemptLimit;
  const overfetchBuffer = input.overfetchBuffer ?? defaultRecommendationGenerationOverfetchBuffer;
  const hardCap = input.hardCap ?? defaultRecommendationGenerationHardCap;
  const promptExclusionLimit =
    input.promptExclusionLimit ?? defaultRecommendationPromptExclusionLimit;

  for (
    let attemptIndex = 0;
    attemptIndex < attemptLimit && acceptedItems.length < input.requestedCount;
    attemptIndex += 1
  ) {
    attemptCount += 1;

    const remainingCount = input.requestedCount - acceptedItems.length;
    const requestedCandidateCount = Math.min(
      Math.max(remainingCount * 2, remainingCount + overfetchBuffer),
      hardCap,
    );
    const generatedItems = await input.generateRecommendations({
      requestPrompt: buildBackfillRequestPrompt(
        input.requestPrompt,
        input.mediaType,
        remainingCount,
        excludedPromptItems,
        promptExclusionLimit,
      ),
      requestedCount: requestedCandidateCount,
    });
    const distinctGeneratedItems = dedupeRecommendationItems(generatedItems).filter((item) => {
      const normalizedKey = buildRecommendationItemKey(item);

      if (seenGeneratedKeys.has(normalizedKey)) {
        return false;
      }

      seenGeneratedKeys.add(normalizedKey);
      return true;
    });

    excludedPromptItems.push(
      ...distinctGeneratedItems.map((item) => ({
        title: item.title,
        year: item.year,
      })),
    );

    const filteredItems = filterRecommendationItemsAgainstExclusions(
      distinctGeneratedItems,
      input.excludedNormalizedKeys,
    );

    excludedExistingItemCount += filteredItems.excludedCount;
    acceptedItems.push(...filteredItems.items);
  }

  return {
    items: acceptedItems.slice(0, input.requestedCount),
    excludedExistingItemCount,
    attemptCount,
  };
}