import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/library-collections", () => ({
  setSonarrSeriesSeasonMonitoring: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { setSonarrSeriesSeasonMonitoring } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { updateSonarrSeriesSeasonMonitoringForUser } from "./update-sonarr-series-season-monitoring";

const findMock = vi.mocked(findServiceConnectionByType);
const setSeasonsMock = vi.mocked(setSonarrSeriesSeasonMonitoring);
const auditMock = vi.mocked(createAuditEvent);

const USER_ID = "user-1";

function verifiedSonarrConnection() {
  return {
    connection: { id: "conn-sonarr", baseUrl: "https://sonarr.test", status: "verified" },
    secret: { encryptedValue: "sonarr-enc" },
    metadata: null,
  } as never;
}

describe("updateSonarrSeriesSeasonMonitoringForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects when no Sonarr connection is configured", async () => {
    findMock.mockResolvedValue(null);

    const result = await updateSonarrSeriesSeasonMonitoringForUser(USER_ID, {
      seriesId: 5,
      monitoredSeasonNumbers: [1],
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

    const result = await updateSonarrSeriesSeasonMonitoringForUser(USER_ID, {
      seriesId: 5,
      monitoredSeasonNumbers: [1],
    });

    expect(result.message).toMatch(/Verify Sonarr/);
  });

  it("dedupes, drops negatives/non-integers, and sorts the season numbers before calling the adapter", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setSeasonsMock.mockResolvedValue({ ok: true, monitoredSeasonCount: 3 } as never);

    await updateSonarrSeriesSeasonMonitoringForUser(USER_ID, {
      seriesId: 42,
      monitoredSeasonNumbers: [3, 1, 2, 1, -1, 0, 0, 1.5 as number],
    });

    expect(setSeasonsMock).toHaveBeenCalledWith({
      baseUrl: "https://sonarr.test",
      apiKey: "dec(sonarr-enc)",
      seriesId: 42,
      monitoredSeasonNumbers: [0, 1, 2, 3],
    });
  });

  it("returns the no-seasons message when monitoredSeasonCount=0", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setSeasonsMock.mockResolvedValue({ ok: true, monitoredSeasonCount: 0 } as never);

    const result = await updateSonarrSeriesSeasonMonitoringForUser(USER_ID, {
      seriesId: 42,
      monitoredSeasonNumbers: [],
    });

    expect(result).toEqual({
      ok: true,
      monitoredSeasonCount: 0,
      message: "Updated Sonarr: no seasons monitored.",
    });
  });

  it("uses the singular season noun when monitoredSeasonCount=1", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setSeasonsMock.mockResolvedValue({ ok: true, monitoredSeasonCount: 1 } as never);

    const result = await updateSonarrSeriesSeasonMonitoringForUser(USER_ID, {
      seriesId: 42,
      monitoredSeasonNumbers: [1],
    });

    expect(result.message).toBe("Updated Sonarr: monitoring 1 season.");
  });

  it("uses the plural seasons noun when monitoredSeasonCount > 1", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setSeasonsMock.mockResolvedValue({ ok: true, monitoredSeasonCount: 3 } as never);

    const result = await updateSonarrSeriesSeasonMonitoringForUser(USER_ID, {
      seriesId: 42,
      monitoredSeasonNumbers: [1, 2, 3],
    });

    expect(result.message).toBe("Updated Sonarr: monitoring 3 seasons.");
  });

  it("emits a failure audit event and surfaces the adapter message when the update fails", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setSeasonsMock.mockResolvedValue({ ok: false, message: "503 Sonarr" } as never);

    const result = await updateSonarrSeriesSeasonMonitoringForUser(USER_ID, {
      seriesId: 42,
      monitoredSeasonNumbers: [1, 2],
    });

    expect(result).toEqual({
      ok: false,
      message: "Failed to update Sonarr monitoring: 503 Sonarr",
    });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.sonarr.season-monitoring.failed",
    );
    const payload = JSON.parse(auditMock.mock.calls[0]?.[0]?.payloadJson ?? "{}");
    expect(payload).toMatchObject({
      sonarrSeriesId: 42,
      monitoredSeasonNumbers: [1, 2],
      message: "503 Sonarr",
    });
  });
});
