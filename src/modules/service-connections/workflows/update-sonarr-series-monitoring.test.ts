import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/library-collections", () => ({
  setSonarrSeriesMonitoring: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { setSonarrSeriesMonitoring } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { updateSonarrSeriesMonitoringForUser } from "./update-sonarr-series-monitoring";

const findMock = vi.mocked(findServiceConnectionByType);
const setMonitoringMock = vi.mocked(setSonarrSeriesMonitoring);
const auditMock = vi.mocked(createAuditEvent);

const USER_ID = "user-1";

function verifiedSonarrConnection() {
  return {
    connection: { id: "conn-sonarr", baseUrl: "https://sonarr.test", status: "verified" },
    secret: { encryptedValue: "sonarr-enc" },
    metadata: null,
  } as never;
}

describe("updateSonarrSeriesMonitoringForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects when no Sonarr connection is configured", async () => {
    findMock.mockResolvedValue(null);

    const result = await updateSonarrSeriesMonitoringForUser(USER_ID, {
      seriesId: 5,
      monitored: true,
      applyToAllSeasons: false,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Configure Sonarr/);
    expect(setMonitoringMock).not.toHaveBeenCalled();
  });

  it("rejects when the Sonarr connection is not yet verified", async () => {
    findMock.mockResolvedValue({
      connection: { id: "c", baseUrl: "https://s.test", status: "configured" },
      secret: { encryptedValue: "x" },
      metadata: null,
    } as never);

    const result = await updateSonarrSeriesMonitoringForUser(USER_ID, {
      seriesId: 5,
      monitored: true,
      applyToAllSeasons: false,
    });

    expect(result.message).toMatch(/Verify Sonarr/);
    expect(setMonitoringMock).not.toHaveBeenCalled();
  });

  it("forwards seriesId, monitored, and the applyToAllSeasons shortcut to the adapter", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setMonitoringMock.mockResolvedValue({
      ok: true,
      monitored: true,
      monitoredSeasonCount: 4,
    } as never);

    await updateSonarrSeriesMonitoringForUser(USER_ID, {
      seriesId: 42,
      monitored: true,
      applyToAllSeasons: true,
    });

    expect(setMonitoringMock).toHaveBeenCalledWith({
      baseUrl: "https://sonarr.test",
      apiKey: "dec(sonarr-enc)",
      seriesId: 42,
      monitored: true,
      applyToAllSeasons: true,
    });
  });

  it("returns a series-only success message and no season suffix when applyToAllSeasons=false", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setMonitoringMock.mockResolvedValue({
      ok: true,
      monitored: true,
      monitoredSeasonCount: 4,
    } as never);

    const result = await updateSonarrSeriesMonitoringForUser(USER_ID, {
      seriesId: 42,
      monitored: true,
      applyToAllSeasons: false,
    });

    expect(result).toEqual({
      ok: true,
      monitored: true,
      monitoredSeasonCount: 4,
      message: "Updated Sonarr: monitoring this series.",
    });
  });

  it("appends a season-count suffix using plural noun when applyToAllSeasons=true and count != 1", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setMonitoringMock.mockResolvedValue({
      ok: true,
      monitored: true,
      monitoredSeasonCount: 4,
    } as never);

    const result = await updateSonarrSeriesMonitoringForUser(USER_ID, {
      seriesId: 42,
      monitored: true,
      applyToAllSeasons: true,
    });

    expect(result.message).toBe("Updated Sonarr: monitoring this series (4 seasons monitored).");
  });

  it("uses the singular season noun when monitoredSeasonCount=1 and applyToAllSeasons=true", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setMonitoringMock.mockResolvedValue({
      ok: true,
      monitored: true,
      monitoredSeasonCount: 1,
    } as never);

    const result = await updateSonarrSeriesMonitoringForUser(USER_ID, {
      seriesId: 42,
      monitored: true,
      applyToAllSeasons: true,
    });

    expect(result.message).toBe("Updated Sonarr: monitoring this series (1 season monitored).");
  });

  it("uses the ignoring verb when adapter reports monitored=false", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setMonitoringMock.mockResolvedValue({
      ok: true,
      monitored: false,
      monitoredSeasonCount: 0,
    } as never);

    const result = await updateSonarrSeriesMonitoringForUser(USER_ID, {
      seriesId: 42,
      monitored: false,
      applyToAllSeasons: true,
    });

    expect(result.message).toBe("Updated Sonarr: ignoring this series (0 seasons monitored).");
  });

  it("emits a failure audit event and surfaces the adapter message when the update fails", async () => {
    findMock.mockResolvedValue(verifiedSonarrConnection());
    setMonitoringMock.mockResolvedValue({ ok: false, message: "Series not found" } as never);

    const result = await updateSonarrSeriesMonitoringForUser(USER_ID, {
      seriesId: 42,
      monitored: true,
      applyToAllSeasons: true,
    });

    expect(result).toEqual({
      ok: false,
      message: "Failed to update Sonarr monitoring: Series not found",
    });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.sonarr.series-monitoring.failed",
    );
    const payload = JSON.parse(auditMock.mock.calls[0]?.[0]?.payloadJson ?? "{}");
    expect(payload).toMatchObject({
      sonarrSeriesId: 42,
      monitored: true,
      applyToAllSeasons: true,
      message: "Series not found",
    });
  });
});
