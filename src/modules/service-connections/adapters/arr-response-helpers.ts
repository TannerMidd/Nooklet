import { trimTrailingSlash } from "@/lib/integrations/http-helpers";

/**
 * Shared response helpers for Sonarr/Radarr (and lookalike) adapters.
 *
 * Previously, `extractErrorMessage`, image-URL resolution, and small scalar
 * readers were duplicated across `add-library-item-helpers.ts`,
 * `library-collections.ts`, `sonarr-episodes.ts`, `tmdb.ts`, and a few other
 * spots. They now live here.
 */

/**
 * Best-effort extraction of an error message from a non-OK arr response.
 *
 * Handles the three payload shapes Sonarr/Radarr (and friends) return:
 * - a JSON string body
 * - an array of `{ errorMessage?, message? }` objects (or strings)
 * - a single `{ message?, errorMessage? }` object
 *
 * Falls through to a generic `${serviceLabel} request failed with status N.`
 * message when the body cannot be parsed or no usable text is found.
 */
export async function extractArrErrorMessage(
  response: Response,
  serviceLabel: string = "Library manager",
) {
  try {
    const payload = (await response.json()) as unknown;

    if (typeof payload === "string" && payload.trim()) {
      return payload;
    }

    if (Array.isArray(payload)) {
      const messages = payload
        .map((entry) => {
          if (typeof entry === "string") {
            return entry;
          }

          if (typeof entry === "object" && entry !== null) {
            const errorMessage = (entry as { errorMessage?: unknown }).errorMessage;
            const message = (entry as { message?: unknown }).message;

            if (typeof errorMessage === "string" && errorMessage.trim()) {
              return errorMessage;
            }

            if (typeof message === "string" && message.trim()) {
              return message;
            }
          }

          return null;
        })
        .filter((entry): entry is string => Boolean(entry));

      if (messages.length > 0) {
        return messages.join(" ");
      }
    }

    if (typeof payload === "object" && payload !== null) {
      const message = (payload as { message?: unknown }).message;
      const errorMessage = (payload as { errorMessage?: unknown }).errorMessage;

      if (typeof message === "string" && message.trim()) {
        return message;
      }

      if (typeof errorMessage === "string" && errorMessage.trim()) {
        return errorMessage;
      }
    }
  } catch {
    // Ignore JSON parsing errors and fall through to the generic message.
  }

  return `${serviceLabel} request failed with status ${response.status}.`;
}

/**
 * Resolve a possibly-relative image URL string against the arr base URL.
 * Returns null when the value is not a non-empty string or cannot be parsed.
 */
export function resolveArrImageUrl(baseUrl: string, value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    return new URL(trimmedValue).toString();
  } catch {
    try {
      return new URL(trimmedValue, `${trimTrailingSlash(baseUrl)}/`).toString();
    } catch {
      return null;
    }
  }
}

/**
 * Extract the best poster URL from an arr `images` array, preferring
 * `coverType: "poster"`, then `coverType: "cover"`, falling back to the first
 * image with a resolvable URL.
 */
export function extractArrPosterUrl(baseUrl: string, images: unknown) {
  const imagesArray = Array.isArray(images) ? images : [];
  const normalizedImages = imagesArray
    .filter((image): image is Record<string, unknown> => typeof image === "object" && image !== null)
    .map((image) => ({
      coverType: typeof image.coverType === "string" ? image.coverType.trim().toLowerCase() : "",
      url: resolveArrImageUrl(baseUrl, image.remoteUrl) ?? resolveArrImageUrl(baseUrl, image.url),
    }))
    .filter((image): image is { coverType: string; url: string } => Boolean(image.url));

  return (
    normalizedImages.find((image) => image.coverType === "poster")?.url ??
    normalizedImages.find((image) => image.coverType === "cover")?.url ??
    normalizedImages[0]?.url ??
    null
  );
}

/** Returns the trimmed string when value is a non-empty string, otherwise null. */
export function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Returns value when it is an integer number, otherwise null. */
export function readInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/** Returns value when it is a finite number, otherwise null. */
export function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Strict boolean check — only returns true when value === true. */
export function readBoolean(value: unknown): boolean {
  return value === true;
}
