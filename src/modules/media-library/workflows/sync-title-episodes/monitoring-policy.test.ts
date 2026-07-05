import { describe, expect, it } from "vitest";

import {
  episodeMonitoring,
  seasonMonitoring,
  type EpisodeSyncMonitoringPolicy,
} from "./monitoring-policy";

describe("seasonMonitoring", () => {
  it("monitors every season except specials for entire-series selections", () => {
    const policy: EpisodeSyncMonitoringPolicy = { kind: "selections", selections: { mode: "all" } };

    expect(seasonMonitoring(policy, 0)).toEqual({ monitoredOnInsert: false, forceMonitored: false });
    expect(seasonMonitoring(policy, 1)).toEqual({ monitoredOnInsert: true, forceMonitored: false });
  });

  it("monitors and re-monitors only the selected seasons", () => {
    const policy: EpisodeSyncMonitoringPolicy = { kind: "selections", selections: { mode: "seasons", seasons: [2] } };

    expect(seasonMonitoring(policy, 2)).toEqual({ monitoredOnInsert: true, forceMonitored: true });
    expect(seasonMonitoring(policy, 1)).toEqual({ monitoredOnInsert: false, forceMonitored: false });
  });

  it("monitors only the season that owns the selected episodes", () => {
    const policy: EpisodeSyncMonitoringPolicy = {
      kind: "selections",
      selections: { mode: "episodes", season: 3, episodes: [1, 2] },
    };

    expect(seasonMonitoring(policy, 3)).toEqual({ monitoredOnInsert: true, forceMonitored: true });
    expect(seasonMonitoring(policy, 1)).toEqual({ monitoredOnInsert: false, forceMonitored: false });
  });

  it("never re-monitors existing rows on refresh and follows the title flag for new rows", () => {
    expect(seasonMonitoring({ kind: "refresh", titleMonitored: true }, 4)).toEqual({
      monitoredOnInsert: true,
      forceMonitored: false,
    });
    expect(seasonMonitoring({ kind: "refresh", titleMonitored: true }, 0)).toEqual({
      monitoredOnInsert: false,
      forceMonitored: false,
    });
    expect(seasonMonitoring({ kind: "refresh", titleMonitored: false }, 4)).toEqual({
      monitoredOnInsert: false,
      forceMonitored: false,
    });
  });
});

describe("episodeMonitoring", () => {
  it("monitors only the explicitly selected episodes", () => {
    const policy: EpisodeSyncMonitoringPolicy = {
      kind: "selections",
      selections: { mode: "episodes", season: 1, episodes: [3] },
    };

    expect(episodeMonitoring(policy, 1, 3)).toEqual({ monitoredOnInsert: true, forceMonitored: true });
    expect(episodeMonitoring(policy, 1, 4)).toEqual({ monitoredOnInsert: false, forceMonitored: false });
    expect(episodeMonitoring(policy, 2, 3)).toEqual({ monitoredOnInsert: false, forceMonitored: false });
  });

  it("monitors episodes of selected seasons", () => {
    const policy: EpisodeSyncMonitoringPolicy = { kind: "selections", selections: { mode: "seasons", seasons: [1] } };

    expect(episodeMonitoring(policy, 1, 5)).toEqual({ monitoredOnInsert: true, forceMonitored: true });
    expect(episodeMonitoring(policy, 2, 5)).toEqual({ monitoredOnInsert: false, forceMonitored: false });
  });

  it("keeps specials unmonitored for entire-series selections", () => {
    const policy: EpisodeSyncMonitoringPolicy = { kind: "selections", selections: { mode: "all" } };

    expect(episodeMonitoring(policy, 0, 1)).toEqual({ monitoredOnInsert: false, forceMonitored: false });
    expect(episodeMonitoring(policy, 1, 1)).toEqual({ monitoredOnInsert: true, forceMonitored: false });
  });
});
