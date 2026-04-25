import { type RecommendationMediaType } from "@/lib/database/schema";

export const recommendationGenreValues = [
  "action",
  "animation",
  "comedy",
  "crime",
  "documentary",
  "drama",
  "fantasy",
  "horror",
  "mystery",
  "romance",
  "science-fiction",
  "thriller",
] as const;

export type RecommendationGenre = (typeof recommendationGenreValues)[number];

type RecommendationGenreOption = {
  value: RecommendationGenre;
  label: string;
  mediaTypes: RecommendationMediaType[];
};

export const recommendationGenreOptions: RecommendationGenreOption[] = [
  { value: "action", label: "Action", mediaTypes: ["tv", "movie"] },
  { value: "animation", label: "Animation", mediaTypes: ["tv", "movie"] },
  { value: "comedy", label: "Comedy", mediaTypes: ["tv", "movie"] },
  { value: "crime", label: "Crime", mediaTypes: ["tv", "movie"] },
  { value: "documentary", label: "Documentary", mediaTypes: ["tv", "movie"] },
  { value: "drama", label: "Drama", mediaTypes: ["tv", "movie"] },
  { value: "fantasy", label: "Fantasy", mediaTypes: ["tv", "movie"] },
  { value: "horror", label: "Horror", mediaTypes: ["tv", "movie"] },
  { value: "mystery", label: "Mystery", mediaTypes: ["tv", "movie"] },
  { value: "romance", label: "Romance", mediaTypes: ["tv", "movie"] },
  { value: "science-fiction", label: "Sci-Fi", mediaTypes: ["tv", "movie"] },
  { value: "thriller", label: "Thriller", mediaTypes: ["tv", "movie"] },
];

export function getRecommendationGenreOptions(mediaType: RecommendationMediaType) {
  return recommendationGenreOptions.filter((option) => option.mediaTypes.includes(mediaType));
}

export function normalizeRecommendationGenres(values: readonly string[]) {
  const allowedValues = new Set<string>(recommendationGenreValues);
  const selectedValues: RecommendationGenre[] = [];
  const seenValues = new Set<string>();

  for (const value of values) {
    if (!allowedValues.has(value) || seenValues.has(value)) {
      continue;
    }

    seenValues.add(value);
    selectedValues.push(value as RecommendationGenre);
  }

  return selectedValues;
}

export function formatRecommendationGenres(values: readonly RecommendationGenre[]) {
  const labelsByValue = new Map(
    recommendationGenreOptions.map((option) => [option.value, option.label]),
  );

  return values.map((value) => labelsByValue.get(value) ?? value);
}

export function parseRecommendationGenresJson(value: string | null | undefined) {
  if (!value) {
    return [] as RecommendationGenre[];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed)
      ? normalizeRecommendationGenres(
          parsed.filter((entry): entry is string => typeof entry === "string"),
        )
      : [];
  } catch {
    return [] as RecommendationGenre[];
  }
}

export function serializeRecommendationGenres(values: readonly RecommendationGenre[]) {
  return JSON.stringify(normalizeRecommendationGenres(values));
}