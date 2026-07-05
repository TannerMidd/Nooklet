import { type RequestTitleWithReleaseSearchInput } from "./request-validation";

/**
 * Stable fingerprint for a TV/movie request used as the idempotency key.
 *
 * Combines media type, the target title identifier (tmdbId preferred over
 * raw title text), and a deterministic encoding of the season/episode
 * selection so repeated identical clicks collide but distinct requests do
 * not.
 */
export function buildRequestAttemptKey(
  request: RequestTitleWithReleaseSearchInput,
  options: { titleId?: string } = {},
): string {
  const identity =
    typeof request.tmdbId === "number"
      ? `tmdb:${request.tmdbId}`
      : options.titleId
        ? `titleId:${options.titleId}`
        : `title:${request.title.trim().toLocaleLowerCase()}:${request.year ?? "?"}`;

  const selection = encodeSelections(request);

  return `${request.mediaType}|${identity}|${selection}`;
}

function encodeSelections(request: RequestTitleWithReleaseSearchInput): string {
  if (request.mediaType !== "tv" || !request.selections) {
    return "all";
  }

  const selections = request.selections;

  if (selections.mode === "all") {
    return "tv:all";
  }

  if (selections.mode === "seasons") {
    const sorted = [...selections.seasons].sort((a, b) => a - b).join(",");
    return `tv:seasons:${sorted}`;
  }

  const sortedEpisodes = [...selections.episodes].sort((a, b) => a - b).join(",");
  return `tv:season:${selections.season}:episodes:${sortedEpisodes}`;
}
