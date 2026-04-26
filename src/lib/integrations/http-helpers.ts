import { safeFetch } from "@/lib/security/safe-fetch";

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Strips one or more trailing slashes from a URL-like string. Used by every
 * integration adapter when stitching paths onto user-configured base URLs so
 * the resulting URL is well-formed regardless of whether the user added a
 * trailing slash.
 */
export function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

/**
 * Thin wrapper around `safeFetch` that applies a default timeout and accepts
 * the same `RequestInfo | URL` shape as `fetch`. Centralizes the
 * fetch-with-timeout pattern previously duplicated across integration
 * adapters.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
) {
  const target = typeof input === "string" || input instanceof URL ? input : input.url;
  return safeFetch(target, { ...init, timeoutMs });
}

/**
 * Fetches a URL via {@link fetchWithTimeout} and parses the response as JSON.
 * Throws when the response status is not OK so callers can rely on the
 * returned value matching the type parameter.
 */
export async function fetchJsonWithTimeout<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
) {
  const response = await fetchWithTimeout(input, init, timeoutMs);

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}
