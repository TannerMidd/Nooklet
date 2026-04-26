import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/http-helpers", () => ({
  fetchWithTimeout: vi.fn(),
  trimTrailingSlash: (value: string) => value.replace(/\/+$/, ""),
}));

import { fetchWithTimeout } from "@/lib/integrations/http-helpers";

import {
  ensureSonarrSeasonsMonitored,
  listSonarrEpisodes,
  searchSonarrEpisodes,
  setSonarrEpisodesMonitored,
} from "./sonarr-episodes";

const fetchMock = vi.mocked(fetchWithTimeout);

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

const BASE = "https://sonarr.test/";
const KEY = "secret-key";

describe("sonarr-episodes adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listSonarrEpisodes", () => {
    it("calls /api/v3/episode with seriesId and X-Api-Key, normalizes and sorts episodes", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse([
          { id: 2, seasonNumber: 1, episodeNumber: 2, title: "B", monitored: true, hasFile: true },
          { id: 1, seasonNumber: 1, episodeNumber: 1, title: "A", airDate: "2020-01-01" },
          { id: 3, seasonNumber: 0, episodeNumber: 1, title: "" }, // title fallback
          { id: -1, seasonNumber: 1, episodeNumber: 3 }, // dropped
          "junk", // dropped
        ]),
      );

      const result = await listSonarrEpisodes({ baseUrl: BASE, apiKey: KEY, seriesId: 7 });

      const [calledUrl, calledOptions] = fetchMock.mock.calls[0]!;
      expect(String(calledUrl)).toBe("https://sonarr.test/api/v3/episode?seriesId=7");
      expect((calledOptions as RequestInit).headers).toMatchObject({ "X-Api-Key": KEY });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.episodes.map((episode) => episode.id)).toEqual([3, 1, 2]);
        expect(result.episodes[2]).toMatchObject({
          id: 2,
          monitored: true,
          hasFile: true,
        });
        // Title fallback when empty
        expect(result.episodes[0]?.title).toBe("Episode 1");
        // Defaults for missing fields
        expect(result.episodes[1]).toMatchObject({ monitored: false, hasFile: false });
      }
    });

    it("returns the body's message when the response is not ok", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: "not found" }, { status: 404 }));
      const result = await listSonarrEpisodes({ baseUrl: BASE, apiKey: KEY, seriesId: 7 });
      expect(result).toEqual({ ok: false, message: "not found" });
    });

    it("returns a usable-list error when the JSON body is not an array", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ notAnArray: true }));
      const result = await listSonarrEpisodes({ baseUrl: BASE, apiKey: KEY, seriesId: 7 });
      expect(result).toEqual({
        ok: false,
        message: "Sonarr did not return a usable episode list.",
      });
    });

    it("translates Error throws to messages and non-Error throws to a generic message", async () => {
      fetchMock.mockRejectedValueOnce(new Error("network down"));
      expect(await listSonarrEpisodes({ baseUrl: BASE, apiKey: KEY, seriesId: 7 })).toEqual({
        ok: false,
        message: "network down",
      });

      fetchMock.mockRejectedValueOnce("string-error");
      const result = await listSonarrEpisodes({ baseUrl: BASE, apiKey: KEY, seriesId: 7 });
      expect(result).toEqual({
        ok: false,
        message: "Sonarr episode lookup failed unexpectedly.",
      });
      if (!result.ok) {
        expect(result.message).not.toContain(KEY);
      }
    });
  });

  describe("setSonarrEpisodesMonitored", () => {
    it("short-circuits to ok when the id list is empty without any HTTP call", async () => {
      const result = await setSonarrEpisodesMonitored({
        baseUrl: BASE,
        apiKey: KEY,
        episodeIds: [],
        monitored: true,
      });
      expect(result).toEqual({ ok: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("sends a PUT to /api/v3/episode/monitor with the JSON body and headers", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));

      await setSonarrEpisodesMonitored({
        baseUrl: BASE,
        apiKey: KEY,
        episodeIds: [1, 2, 3],
        monitored: false,
      });

      const [url, options] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://sonarr.test/api/v3/episode/monitor");
      const init = options as RequestInit;
      expect(init.method).toBe("PUT");
      expect(init.headers).toMatchObject({
        "Content-Type": "application/json",
        "X-Api-Key": KEY,
      });
      expect(JSON.parse(String(init.body))).toEqual({
        episodeIds: [1, 2, 3],
        monitored: false,
      });
    });

    it("returns the extracted error message on a non-ok response", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: "validation" }, { status: 400 }));
      const result = await setSonarrEpisodesMonitored({
        baseUrl: BASE,
        apiKey: KEY,
        episodeIds: [1],
        monitored: true,
      });
      expect(result).toEqual({ ok: false, message: "validation" });
    });

    it("translates throws and never leaks the api key in the failure message", async () => {
      fetchMock.mockRejectedValueOnce("nope");
      const result = await setSonarrEpisodesMonitored({
        baseUrl: BASE,
        apiKey: KEY,
        episodeIds: [1],
        monitored: true,
      });
      expect(result).toEqual({
        ok: false,
        message: "Sonarr episode monitor update failed unexpectedly.",
      });
      if (!result.ok) {
        expect(result.message).not.toContain(KEY);
      }
    });
  });

  describe("searchSonarrEpisodes", () => {
    it("short-circuits to ok when the id list is empty", async () => {
      const result = await searchSonarrEpisodes({
        baseUrl: BASE,
        apiKey: KEY,
        episodeIds: [],
      });
      expect(result).toEqual({ ok: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("posts an EpisodeSearch command with the requested ids", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));
      await searchSonarrEpisodes({ baseUrl: BASE, apiKey: KEY, episodeIds: [4, 5] });

      const [url, options] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://sonarr.test/api/v3/command");
      const init = options as RequestInit;
      expect(init.method).toBe("POST");
      expect(JSON.parse(String(init.body))).toEqual({
        name: "EpisodeSearch",
        episodeIds: [4, 5],
      });
    });

    it("returns the extracted error message on non-ok responses", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ errorMessage: "rate limit" }, { status: 429 }));
      const result = await searchSonarrEpisodes({
        baseUrl: BASE,
        apiKey: KEY,
        episodeIds: [1],
      });
      expect(result).toEqual({ ok: false, message: "rate limit" });
    });
  });

  describe("ensureSonarrSeasonsMonitored", () => {
    it("short-circuits to ok when no seasons are requested", async () => {
      const result = await ensureSonarrSeasonsMonitored({
        baseUrl: BASE,
        apiKey: KEY,
        seriesId: 7,
        seasonNumbers: [],
      });
      expect(result).toEqual({ ok: true });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("fetches the series, sets monitored=true on requested seasons, and PUTs the merged payload", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          id: 7,
          monitored: false,
          title: "Show",
          seasons: [
            { seasonNumber: 0, monitored: false },
            { seasonNumber: 1, monitored: false },
            { seasonNumber: 2, monitored: true },
          ],
        }),
      );
      fetchMock.mockResolvedValueOnce(jsonResponse({}));

      const result = await ensureSonarrSeasonsMonitored({
        baseUrl: BASE,
        apiKey: KEY,
        seriesId: 7,
        seasonNumbers: [1],
      });

      expect(result).toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [getUrl, getOptions] = fetchMock.mock.calls[0]!;
      expect(getUrl).toBe("https://sonarr.test/api/v3/series/7");
      expect((getOptions as RequestInit).headers).toMatchObject({ "X-Api-Key": KEY });

      const [putUrl, putOptions] = fetchMock.mock.calls[1]!;
      expect(putUrl).toBe("https://sonarr.test/api/v3/series/7");
      const putInit = putOptions as RequestInit;
      expect(putInit.method).toBe("PUT");
      const body = JSON.parse(String(putInit.body));
      expect(body.monitored).toBe(true);
      expect(body.seasons).toEqual([
        { seasonNumber: 0, monitored: false },
        { seasonNumber: 1, monitored: true }, // requested -> flipped
        { seasonNumber: 2, monitored: true }, // already monitored -> preserved
      ]);
    });

    it("returns the fetch error when the initial GET fails", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: "auth" }, { status: 401 }));
      const result = await ensureSonarrSeasonsMonitored({
        baseUrl: BASE,
        apiKey: KEY,
        seriesId: 7,
        seasonNumbers: [1],
      });
      expect(result).toEqual({ ok: false, message: "auth" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("returns the update error when the PUT fails", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ id: 7, seasons: [] }));
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: "rejected" }, { status: 422 }));
      const result = await ensureSonarrSeasonsMonitored({
        baseUrl: BASE,
        apiKey: KEY,
        seriesId: 7,
        seasonNumbers: [1],
      });
      expect(result).toEqual({ ok: false, message: "rejected" });
    });

    it("translates throws and never leaks the api key", async () => {
      fetchMock.mockRejectedValueOnce("boom");
      const result = await ensureSonarrSeasonsMonitored({
        baseUrl: BASE,
        apiKey: KEY,
        seriesId: 7,
        seasonNumbers: [1],
      });
      expect(result).toEqual({
        ok: false,
        message: "Sonarr series update failed unexpectedly.",
      });
      if (!result.ok) {
        expect(result.message).not.toContain(KEY);
      }
    });
  });
});
