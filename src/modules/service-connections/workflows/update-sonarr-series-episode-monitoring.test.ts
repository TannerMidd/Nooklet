import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/apply-sonarr-episode-monitoring", () => ({
  applySonarrEpisodeMonitoring: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { applySonarrEpisodeMonitoring } from "@/modules/service-connections/workflows/apply-sonarr-episode-monitoring";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { updateSonarrSeriesEpisodeMonitoringForUser } from "./update-sonarr-series-episode-monitoring";

const findMock = vi.mocked(findServiceConnectionByType);
const applyMock = vi.mocked(applySonarrEpisodeMonitoring);
const auditMock = vi.mocked(createAuditEvent);

const USER_ID = "user-1";

function verifiedSonarrConnection() {
  return {
    connection: { id: "conn-sonarr", baseUrl: "https://sonarr.test", status: "verified" },
    secret: { encryptedValue: "sonarr-enc" },
    metadata: null,
  } as never;
}

describe("updateSonarrSeriesEpisodeMonitoringForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects when no Sonarr connection is configured", async () => {
    findMock.mockResolvedValue(null);

    const result = await updateSonarrSeriesEpisodeMonitoringForUser(USER_ID, {
      seriesId: 5,
      episodeIds: [1],
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Configure Sonarr/);
  });

  it("rejects when the Sonarr connection is not yet verified", async () => {
    findMock.mockResolvedValue({
      connection: { id: "c", baseUrl: "https://s.test", status: "configured" },
      secret: { encryptedValue: "x" },
      metadata: null,
    } as never);

    const result = await updateSonarrSeriesEpisodeMonitoringForUser(USER_ID, {
      seriesId: 5,
      episodeIds: [1],
    });

    expect(result.message).toMatch(/Verify Sonarr/);
  });

  it("dedupes and filters out non-positive / non-integer episode IDs before invoking the worker", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    applyMock.mockResolvedValue({
      ok: true,
      monitoredEpisodeCount: 2,
      unmonitoredEpisodeCount: 0,
      searchTriggered: false,
    } as never);

    await updateSonarrSeriesEpisodeMonitoringForUser(USER_ID, {
      seriesId: 42,
      episodeIds: [1, 2, 2, 0, -3, 1.5 as number, 7],
    });

    expect(applyMock).toHaveBeenCalledWith({
      baseUrl: "https://sonarr.test",
      apiKey: "dec(sonarr-enc)",
      seriesId: 42,
      requestedEpisodeIds: [1, 2, 7],
    });
  });

  it("returns no-episodes message when zero monitored", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    applyMock.mockResolvedValue({
      ok: true,
      monitoredEpisodeCount: 0,
      unmonitoredEpisodeCount: 5,
      searchTriggered: false,
    } as never);

    const result = await updateSonarrSeriesEpisodeMonitoringForUser(USER_ID, {
      seriesId: 42,
      episodeIds: [],
    });

    expect(result).toEqual({
      ok: true,
      monitoredEpisodeCount: 0,
      searchTriggered: false,
      searchWarning: undefined,
      message: "Updated Sonarr: no episodes monitored.",
    });
  });

  it("uses singular noun for monitoredEpisodeCount=1", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    applyMock.mockResolvedValue({
      ok: true,
      monitoredEpisodeCount: 1,
      unmonitoredEpisodeCount: 0,
      searchTriggered: true,
    } as never);

    const result = await updateSonarrSeriesEpisodeMonitoringForUser(USER_ID, {
      seriesId: 42,
      episodeIds: [10],
    });

    expect(result.message).toBe("Updated Sonarr: monitoring 1 episode.");
    if (result.ok) {
      expect(result.searchTriggered).toBe(true);
    }
  });

  it("uses plural noun for monitoredEpisodeCount > 1 and forwards searchWarning", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    applyMock.mockResolvedValue({
      ok: true,
      monitoredEpisodeCount: 3,
      unmonitoredEpisodeCount: 0,
      searchTriggered: false,
      searchWarning: "search command rejected",
    } as never);

    const result = await updateSonarrSeriesEpisodeMonitoringForUser(USER_ID, {
      seriesId: 42,
      episodeIds: [1, 2, 3],
    });

    expect(result.message).toBe("Updated Sonarr: monitoring 3 episodes.");
    if (result.ok) {
      expect(result.searchWarning).toBe("search command rejected");
    }
  });

  it("emits a failure audit event with stage and forwards the field hint when the worker fails", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    applyMock.mockResolvedValue({
      ok: false,
      stage: "fetch-episodes",
      message: "no episodes returned",
      field: "episodeIds",
    } as never);

    const result = await updateSonarrSeriesEpisodeMonitoringForUser(USER_ID, {
      seriesId: 42,
      episodeIds: [1, 2, 3],
    });

    expect(result).toEqual({
      ok: false,
      message: "Failed to update Sonarr monitoring: no episodes returned",
      field: "episodeIds",
    });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.sonarr.episode-monitoring.failed",
    );
    const payload = JSON.parse(auditMock.mock.calls[0]?.[0]?.payloadJson ?? "{}");
    expect(payload).toMatchObject({
      sonarrSeriesId: 42,
      stage: "fetch-episodes",
      message: "no episodes returned",
      requestedEpisodeIds: [1, 2, 3],
    });
  });
});
