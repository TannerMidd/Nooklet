import {
  listMonitoredMissingMovieTitles,
  listMonitoredMissingTvEpisodes,
} from "@/modules/media-library/repositories/media-library-repository";

export const MISSING_SEARCH_CANDIDATE_LIMIT = 5;

export type MissingContentCandidate =
  | {
      kind: "movie";
      titleId: string;
      episodeId: null;
      label: string;
    }
  | {
      kind: "episode";
      titleId: string;
      episodeId: string;
      label: string;
    };

export async function selectMissingContentCandidates(
  userId: string,
  limit: number = MISSING_SEARCH_CANDIDATE_LIMIT,
): Promise<MissingContentCandidate[]> {
  const [movies, episodes] = await Promise.all([
    listMonitoredMissingMovieTitles(userId, limit),
    listMonitoredMissingTvEpisodes(userId, limit),
  ]);

  const movieCandidates: MissingContentCandidate[] = movies.map((title) => ({
    kind: "movie",
    titleId: title.id,
    episodeId: null,
    label: title.title,
  }));
  const episodeCandidates: MissingContentCandidate[] = episodes.map((entry) => ({
    kind: "episode",
    titleId: entry.title.id,
    episodeId: entry.episode.id,
    label: `${entry.title.title} S${String(entry.episode.seasonNumber).padStart(2, "0")}E${String(entry.episode.episodeNumber).padStart(2, "0")}`,
  }));

  const interleaved: MissingContentCandidate[] = [];
  const longest = Math.max(movieCandidates.length, episodeCandidates.length);

  for (let index = 0; index < longest; index += 1) {
    const movie = movieCandidates[index];
    const episode = episodeCandidates[index];

    if (movie) {
      interleaved.push(movie);
    }

    if (episode) {
      interleaved.push(episode);
    }
  }

  return interleaved.slice(0, limit);
}
