import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/jobs/repositories/job-repository", () => ({
  saveRecurringJob: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));
vi.mock("@/modules/watch-history/repositories/watch-history-repository", () => ({
  findWatchHistorySourceByType: vi.fn(),
}));

import { saveRecurringJob } from "@/modules/jobs/repositories/job-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { findWatchHistorySourceByType } from "@/modules/watch-history/repositories/watch-history-repository";

import { configureWatchHistorySchedule } from "./configure-watch-history-schedule";

const findSourceMock = vi.mocked(findWatchHistorySourceByType);
const saveJobMock = vi.mocked(saveRecurringJob);
const auditMock = vi.mocked(createAuditEvent);

const USER_ID = "user-1";

describe("configureWatchHistorySchedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    saveJobMock.mockResolvedValue(undefined as never);
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects with field=sourceType when enabling auto-sync without an existing source", async () => {
    findSourceMock.mockResolvedValue(null);

    const result = await configureWatchHistorySchedule(USER_ID, {
      sourceType: "plex",
      enabled: true,
      intervalHours: 6,
    });

    expect(result).toEqual({
      ok: false,
      message: "Run a manual sync once before enabling auto-sync for this source.",
      field: "sourceType",
    });
    expect(saveJobMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("persists a recurring job with the converted minute interval and emits an audit event when enabling", async () => {
    findSourceMock.mockResolvedValue({ id: "src-1", sourceType: "plex" } as never);

    const result = await configureWatchHistorySchedule(USER_ID, {
      sourceType: "plex",
      enabled: true,
      intervalHours: 6,
    });

    expect(saveJobMock).toHaveBeenCalledWith({
      userId: USER_ID,
      jobType: "watch-history-sync",
      targetType: "watch-history-source",
      targetKey: "plex",
      scheduleMinutes: 360,
      isEnabled: true,
    });

    expect(auditMock).toHaveBeenCalledWith({
      actorUserId: USER_ID,
      eventType: "watch-history.schedule.updated",
      subjectType: "watch-history-schedule",
      subjectId: "plex",
      payloadJson: JSON.stringify({ sourceType: "plex", enabled: true, intervalHours: 6 }),
    });

    expect(result).toEqual({
      ok: true,
      message: "Auto-sync enabled every 6 hours.",
    });
  });

  it("uses the singular hour noun for an interval of exactly one", async () => {
    findSourceMock.mockResolvedValue({ id: "src-1", sourceType: "plex" } as never);

    const result = await configureWatchHistorySchedule(USER_ID, {
      sourceType: "plex",
      enabled: true,
      intervalHours: 1,
    });

    expect(result.message).toBe("Auto-sync enabled every 1 hour.");
    expect(saveJobMock.mock.calls[0]?.[0]?.scheduleMinutes).toBe(60);
  });

  it("does not require an existing source when disabling and persists a disabled job", async () => {
    findSourceMock.mockResolvedValue(null);

    const result = await configureWatchHistorySchedule(USER_ID, {
      sourceType: "tautulli",
      enabled: false,
      intervalHours: 12,
    });

    expect(findSourceMock).not.toHaveBeenCalled();
    expect(saveJobMock).toHaveBeenCalledWith({
      userId: USER_ID,
      jobType: "watch-history-sync",
      targetType: "watch-history-source",
      targetKey: "tautulli",
      scheduleMinutes: 720,
      isEnabled: false,
    });
    expect(result).toEqual({
      ok: true,
      message: "Auto-sync disabled.",
    });
  });

  it("forwards the sourceType into both the targetKey and the audit payload", async () => {
    findSourceMock.mockResolvedValue({ id: "src-1", sourceType: "tautulli" } as never);

    await configureWatchHistorySchedule(USER_ID, {
      sourceType: "tautulli",
      enabled: true,
      intervalHours: 24,
    });

    expect(saveJobMock.mock.calls[0]?.[0]?.targetKey).toBe("tautulli");
    expect(auditMock.mock.calls[0]?.[0]?.subjectId).toBe("tautulli");
  });
});
