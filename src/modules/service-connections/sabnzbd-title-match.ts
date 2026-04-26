import { type SabnzbdQueueItem, type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";
import { type RecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";

type SabnzbdTitleMatchInput = {
  title: string;
  year?: number | null;
  providerMetadata?: RecommendationProviderMetadata | null;
};

const minimumMatchScore = 55;

function normalizeTitleKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function buildTitleCandidates(input: SabnzbdTitleMatchInput) {
  const candidates = [
    input.title,
    input.providerMetadata?.tmdbDetails?.title,
    input.providerMetadata?.tmdbDetails?.originalTitle,
  ];
  const seen = new Set<string>();

  return candidates.flatMap((candidate) => {
    if (!candidate) {
      return [];
    }

    const normalizedCandidate = normalizeTitleKey(candidate);

    if (normalizedCandidate.length < 4 || seen.has(normalizedCandidate)) {
      return [];
    }

    seen.add(normalizedCandidate);

    return [normalizedCandidate];
  });
}

function scoreQueueItem(item: SabnzbdQueueItem, input: SabnzbdTitleMatchInput) {
  const queueKey = normalizeTitleKey(item.title);
  const queueTokens = new Set(queueKey.split(" ").filter(Boolean));
  const yearToken = input.year ? String(input.year) : null;

  return buildTitleCandidates(input).reduce((bestScore, candidateKey) => {
    let score = 0;

    if (queueKey === candidateKey) {
      score = 100;
    } else if (queueKey.startsWith(`${candidateKey} `)) {
      score = 85;
    } else if (queueKey.includes(` ${candidateKey} `)) {
      score = 75;
    } else if (queueKey.includes(candidateKey)) {
      score = 65;
    } else {
      const candidateTokens = candidateKey.split(" ").filter((token) => token.length > 1);

      if (candidateTokens.length >= 2 && candidateTokens.every((token) => queueTokens.has(token))) {
        score = 55;
      }
    }

    if (score > 0 && yearToken && queueTokens.has(yearToken)) {
      score += 12;
    }

    return Math.max(bestScore, score);
  }, 0);
}

export function findSabnzbdQueueItemForTitle(
  snapshot: SabnzbdQueueSnapshot | null | undefined,
  input: SabnzbdTitleMatchInput,
) {
  if (!snapshot?.items.length) {
    return null;
  }

  const rankedMatches = snapshot.items
    .map((item) => ({
      item,
      score: scoreQueueItem(item, input),
    }))
    .filter((match) => match.score >= minimumMatchScore)
    .sort((left, right) => right.score - left.score);

  return rankedMatches[0]?.item ?? null;
}
