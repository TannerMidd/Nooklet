import { beforeEach, describe, expect, it, vi } from "vitest";

import { applySonarrEpisodeMonitoring } from "./apply-sonarr-episode-monitoring";

type EpisodeFixture = { id: number; seasonNumber: number; monitored: boolean };

function buildDeps(overrides: Partial<{
  episodes: EpisodeFixture[];
  listOk: boolean;
  listMessage: string;
  setMonitoredImpl: ReturnType<typeof vi.fn>;
  searchOk: boolean;
  searchMessage: string;
  ensureOk: boolean;
  ensureMessage: string;
}> = {}) {
  const listEpisodes = vi.fn(async () =>
    overrides.listOk === false
      ? { ok: false as const, message: overrides.listMessage ?? "list err" }
      : { ok: true as const, episodes: overrides.episodes ?? [] },
  );
  const setMonitored =
    overrides.setMonitoredImpl ?? vi.fn(async () => ({ ok: true as const }));
  const searchEpisodes = vi.fn(async () =>
    overrides.searchOk === false
      ? { ok: false as const, message: overrides.searchMessage ?? "search err" }
      : { ok: true as const },
  );
  const ensureSeasonsMonitored = vi.fn(async () =>
    overrides.ensureOk === false
      ? { ok: false as const, message: overrides.ensureMessage ?? "ensure err" }
      : { ok: true as const },
  );

  return { listEpisodes, setMonitored, searchEpisodes, ensureSeasonsMonitored };
}

const INPUT = { baseUrl: "https://sonarr.test", apiKey: "k", seriesId: 7, requestedEpisodeIds: [] as number[] };

describe("applySonarrEpisodeMonitoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stage=list when the episode list adapter fails", async () => {
    const deps = buildDeps({ listOk: false, listMessage: "503" });

    const result = await applySonarrEpisodeMonitoring({ ...INPUT, requestedEpisodeIds: [1] }, deps);

    expect(result).toEqual({ ok: false, stage: "list", message: "503" });
  });

  it("rejects with field=episodeIds when a requested ID is not in the listed episodes", async () => {
    const deps = buildDeps({
      episodes: [
        { id: 1, seasonNumber: 1, monitored: false },
        { id: 2, seasonNumber: 1, monitored: false },
      ],
    });

    const result = await applySonarrEpisodeMonitoring(
      { ...INPUT, requestedEpisodeIds: [1, 99] },
      deps,
    );

    expect(result).toEqual({
      ok: false,
      stage: "monitor",
      message: "Select only episodes returned by Sonarr for this series.",
      field: "episodeIds",
    });
  });

  it("on success: ensures season monitored, disables previously-monitored unselected episodes, enables requested, triggers search", async () => {
    const setMonitoredImpl = vi.fn(async () => ({ ok: true as const }));
    const deps = buildDeps({
      episodes: [
        { id: 1, seasonNumber: 1, monitored: false },
        { id: 2, seasonNumber: 1, monitored: true }, // previously monitored, NOT requested -> disable
        { id: 3, seasonNumber: 2, monitored: true }, // previously monitored, requested -> stays
        { id: 4, seasonNumber: 2, monitored: false },
      ],
      setMonitoredImpl,
    });

    const result = await applySonarrEpisodeMonitoring(
      { ...INPUT, requestedEpisodeIds: [1, 3] },
      deps,
    );

    // Ensure-seasons covers the *requested* episodes' seasons (1 and 2), deduped.
    expect(deps.ensureSeasonsMonitored).toHaveBeenCalledWith({
      baseUrl: "https://sonarr.test",
      apiKey: "k",
      seriesId: 7,
      seasonNumbers: expect.arrayContaining([1, 2]),
    });
    expect(deps.ensureSeasonsMonitored.mock.calls[0]?.[0]?.seasonNumbers).toHaveLength(2);

    // Two setMonitored calls: first disable (id 2), then enable (1, 3).
    expect(setMonitoredImpl).toHaveBeenCalledTimes(2);
    expect(setMonitoredImpl.mock.calls[0]?.[0]).toMatchObject({
      episodeIds: [2],
      monitored: false,
    });
    expect(setMonitoredImpl.mock.calls[1]?.[0]).toMatchObject({
      episodeIds: [1, 3],
      monitored: true,
    });

    expect(deps.searchEpisodes).toHaveBeenCalledWith({
      baseUrl: "https://sonarr.test",
      apiKey: "k",
      episodeIds: [1, 3],
    });

    expect(result).toEqual({
      ok: true,
      monitoredEpisodeCount: 2,
      unmonitoredEpisodeCount: 1,
      searchTriggered: true,
      searchWarning: undefined,
    });
  });

  it("skips ensure-seasons and the disable call when there is nothing to do for those steps", async () => {
    const setMonitoredImpl = vi.fn(async () => ({ ok: true as const }));
    const deps = buildDeps({
      episodes: [{ id: 1, seasonNumber: 1, monitored: false }],
      setMonitoredImpl,
    });

    const result = await applySonarrEpisodeMonitoring(
      { ...INPUT, requestedEpisodeIds: [] },
      deps,
    );

    // No requested seasons -> ensure-seasons not called.
    expect(deps.ensureSeasonsMonitored).not.toHaveBeenCalled();
    // No previously-monitored to disable -> only the enable call (with empty array).
    expect(setMonitoredImpl).toHaveBeenCalledTimes(1);
    expect(setMonitoredImpl.mock.calls[0]?.[0]).toMatchObject({
      episodeIds: [],
      monitored: true,
    });

    expect(result).toMatchObject({
      ok: true,
      monitoredEpisodeCount: 0,
      unmonitoredEpisodeCount: 0,
      searchTriggered: true,
    });
  });

  it("returns stage=ensure-seasons when ensuring season monitoring fails", async () => {
    const deps = buildDeps({
      episodes: [{ id: 1, seasonNumber: 1, monitored: false }],
      ensureOk: false,
      ensureMessage: "ensure failed",
    });

    const result = await applySonarrEpisodeMonitoring(
      { ...INPUT, requestedEpisodeIds: [1] },
      deps,
    );

    expect(result).toEqual({
      ok: false,
      stage: "ensure-seasons",
      message: "ensure failed",
    });
  });

  it("returns stage=unmonitor when disabling previously-monitored episodes fails", async () => {
    let call = 0;
    const setMonitoredImpl = vi.fn(async () => {
      call += 1;
      return call === 1
        ? ({ ok: false as const, message: "disable failed" })
        : ({ ok: true as const });
    });
    const deps = buildDeps({
      episodes: [
        { id: 1, seasonNumber: 1, monitored: true }, // disable target
        { id: 2, seasonNumber: 1, monitored: false },
      ],
      setMonitoredImpl,
    });

    const result = await applySonarrEpisodeMonitoring(
      { ...INPUT, requestedEpisodeIds: [2] },
      deps,
    );

    expect(result).toEqual({
      ok: false,
      stage: "unmonitor",
      message: "disable failed",
    });
  });

  it("returns stage=monitor when enabling requested episodes fails", async () => {
    const setMonitoredImpl = vi.fn(async () => ({ ok: false as const, message: "enable failed" }));
    const deps = buildDeps({
      episodes: [{ id: 1, seasonNumber: 1, monitored: false }],
      setMonitoredImpl,
    });

    const result = await applySonarrEpisodeMonitoring(
      { ...INPUT, requestedEpisodeIds: [1] },
      deps,
    );

    expect(result).toEqual({
      ok: false,
      stage: "monitor",
      message: "enable failed",
    });
  });

  it("treats a search failure as a soft warning (searchTriggered=false) but reports overall success", async () => {
    const deps = buildDeps({
      episodes: [{ id: 1, seasonNumber: 1, monitored: false }],
      searchOk: false,
      searchMessage: "search rate-limited",
    });

    const result = await applySonarrEpisodeMonitoring(
      { ...INPUT, requestedEpisodeIds: [1] },
      deps,
    );

    expect(result).toMatchObject({
      ok: true,
      monitoredEpisodeCount: 1,
      searchTriggered: false,
      searchWarning: "search rate-limited",
    });
  });
});
