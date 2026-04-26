import { type RecommendationMediaType } from "@/lib/database/schema";
import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { listRecommendationTasteProfileRows } from "@/modules/recommendations/repositories/recommendation-repository";

type TasteProfileItem = {
  title: string;
  year: number | null;
};

export type RecommendationTasteProfile = {
  likeCount: number;
  dislikeCount: number;
  hiddenCount: number;
  addedCount: number;
  likedItems: TasteProfileItem[];
  dislikedItems: TasteProfileItem[];
  addedItems: TasteProfileItem[];
  preferredGenres: string[];
  avoidedGenres: string[];
};

function formatGenreKey(value: string) {
  return value.trim().toLowerCase();
}

function incrementGenre(map: Map<string, { label: string; count: number }>, genre: string) {
  const trimmedGenre = genre.trim();

  if (!trimmedGenre) {
    return;
  }

  const key = formatGenreKey(trimmedGenre);
  const current = map.get(key);

  if (current) {
    current.count += 1;
    return;
  }

  map.set(key, { label: trimmedGenre, count: 1 });
}

function topGenres(map: Map<string, { label: string; count: number }>) {
  return Array.from(map.values())
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 6)
    .map((entry) => entry.label);
}

function toTasteItem(row: { title: string; year: number | null }) {
  return {
    title: row.title,
    year: row.year,
  } satisfies TasteProfileItem;
}

export async function getRecommendationTasteProfile(
  userId: string,
  mediaType?: RecommendationMediaType,
): Promise<RecommendationTasteProfile> {
  const rows = await listRecommendationTasteProfileRows(userId, mediaType);
  const preferredGenreCounts = new Map<string, { label: string; count: number }>();
  const avoidedGenreCounts = new Map<string, { label: string; count: number }>();
  const likedItems: TasteProfileItem[] = [];
  const dislikedItems: TasteProfileItem[] = [];
  const addedItems: TasteProfileItem[] = [];
  let likeCount = 0;
  let dislikeCount = 0;
  let hiddenCount = 0;
  let addedCount = 0;

  for (const row of rows) {
    const providerMetadata = parseRecommendationProviderMetadata(row.providerMetadataJson);
    const genres = providerMetadata?.tmdbDetails?.genres ?? [];

    if (row.feedback === "like") {
      likeCount += 1;
      if (likedItems.length < 8) {
        likedItems.push(toTasteItem(row));
      }
      genres.forEach((genre) => incrementGenre(preferredGenreCounts, genre));
    }

    if (row.feedback === "dislike") {
      dislikeCount += 1;
      if (dislikedItems.length < 8) {
        dislikedItems.push(toTasteItem(row));
      }
      genres.forEach((genre) => incrementGenre(avoidedGenreCounts, genre));
    }

    if (row.isHidden) {
      hiddenCount += 1;
      genres.forEach((genre) => incrementGenre(avoidedGenreCounts, genre));
    }

    if (row.existingInLibrary) {
      addedCount += 1;
      if (addedItems.length < 8) {
        addedItems.push(toTasteItem(row));
      }
      genres.forEach((genre) => incrementGenre(preferredGenreCounts, genre));
    }
  }

  return {
    likeCount,
    dislikeCount,
    hiddenCount,
    addedCount,
    likedItems,
    dislikedItems,
    addedItems,
    preferredGenres: topGenres(preferredGenreCounts),
    avoidedGenres: topGenres(avoidedGenreCounts),
  };
}