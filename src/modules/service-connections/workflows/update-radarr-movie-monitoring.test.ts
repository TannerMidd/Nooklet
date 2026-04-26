import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/library-collections", () => ({
  setRadarrMovieMonitoring: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { setRadarrMovieMonitoring } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { updateRadarrMovieMonitoringForUser } from "./update-radarr-movie-monitoring";

const findMock = vi.mocked(findServiceConnectionByType);
const setMonitoringMock = vi.mocked(setRadarrMovieMonitoring);
const auditMock = vi.mocked(createAuditEvent);

const USER_ID = "user-1";

function verifiedRadarrConnection() {
  return {
    connection: { id: "conn-radarr-1", baseUrl: "https://radarr.test", status: "verified" },
    secret: { encryptedValue: "radarr-enc" },
    metadata: null,
  } as never;
}

describe("updateRadarrMovieMonitoringForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects when no Radarr connection is configured", async () => {
    findMock.mockResolvedValue(null);

    const result = await updateRadarrMovieMonitoringForUser(USER_ID, { movieId: 5, monitored: true });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Configure Radarr/);
    expect(setMonitoringMock).not.toHaveBeenCalled();
  });

  it("rejects when the Radarr connection is configured but not verified", async () => {
    findMock.mockResolvedValue({
      connection: { id: "c", baseUrl: "https://r.test", status: "configured" },
      secret: { encryptedValue: "x" },
      metadata: null,
    } as never);

    const result = await updateRadarrMovieMonitoringForUser(USER_ID, { movieId: 5, monitored: true });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Verify Radarr/);
    expect(setMonitoringMock).not.toHaveBeenCalled();
  });

  it("invokes the adapter with the decrypted key, base URL, movieId, and monitored flag", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    setMonitoringMock.mockResolvedValue({ ok: true, monitored: true } as never);

    await updateRadarrMovieMonitoringForUser(USER_ID, { movieId: 42, monitored: true });

    expect(setMonitoringMock).toHaveBeenCalledWith({
      baseUrl: "https://radarr.test",
      apiKey: "dec(radarr-enc)",
      movieId: 42,
      monitored: true,
    });
  });

  it("returns the monitored success message and emits a success audit event", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    setMonitoringMock.mockResolvedValue({ ok: true, monitored: true } as never);

    const result = await updateRadarrMovieMonitoringForUser(USER_ID, { movieId: 42, monitored: true });

    expect(result).toEqual({
      ok: true,
      monitored: true,
      message: "Updated Radarr: monitoring this movie.",
    });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "service-connections.radarr.movie-monitoring.succeeded",
      subjectId: "conn-radarr-1",
    }));
  });

  it("returns the ignoring message when the adapter reports monitored=false", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    setMonitoringMock.mockResolvedValue({ ok: true, monitored: false } as never);

    const result = await updateRadarrMovieMonitoringForUser(USER_ID, { movieId: 42, monitored: false });

    expect(result.message).toBe("Updated Radarr: ignoring this movie.");
    expect(auditMock.mock.calls[0]?.[0]?.payloadJson).toBe(
      JSON.stringify({ radarrMovieId: 42, monitored: false }),
    );
  });

  it("emits a failure audit event and surfaces the adapter message when monitoring update fails", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    setMonitoringMock.mockResolvedValue({ ok: false, message: "401 Unauthorized" } as never);

    const result = await updateRadarrMovieMonitoringForUser(USER_ID, { movieId: 42, monitored: true });

    expect(result).toEqual({
      ok: false,
      message: "Failed to update Radarr monitoring: 401 Unauthorized",
    });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "service-connections.radarr.movie-monitoring.failed",
    }));
    const payload = JSON.parse(auditMock.mock.calls[0]?.[0]?.payloadJson ?? "{}");
    expect(payload).toMatchObject({
      radarrMovieId: 42,
      monitored: true,
      message: "401 Unauthorized",
    });
  });
});
