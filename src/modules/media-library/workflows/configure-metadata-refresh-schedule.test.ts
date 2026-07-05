import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/jobs/repositories/job-repository", () => ({
  saveRecurringJob: vi.fn(),
}));
vi.mock("@/modules/users/commands/record-audit-event", () => ({
  recordAuditEvent: vi.fn(),
}));

import { saveRecurringJob } from "@/modules/jobs/repositories/job-repository";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

import { configureMetadataRefreshSchedule } from "./configure-metadata-refresh-schedule";

const saveRecurringJobMock = vi.mocked(saveRecurringJob);
const recordAuditEventMock = vi.mocked(recordAuditEvent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("configureMetadataRefreshSchedule", () => {
  it("saves a recurring metadata refresh job and records an audit event", async () => {
    saveRecurringJobMock.mockResolvedValue({ id: "job1" } as never);

    const result = await configureMetadataRefreshSchedule("user1", {
      enabled: true,
      intervalMinutes: 720,
    });

    expect(saveRecurringJobMock).toHaveBeenCalledWith({
      userId: "user1",
      jobType: "metadata-refresh",
      targetType: "media-library",
      targetKey: "all",
      scheduleMinutes: 720,
      isEnabled: true,
    });
    expect(recordAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: "user1",
      eventType: "media-library.metadata-refresh.schedule.updated",
      subjectType: "media-library-metadata-refresh-schedule",
      subjectId: "all",
    }));
    expect(result).toEqual({ ok: true, message: "Series metadata refresh enabled every 720 minutes." });
  });

  it("rejects intervals shorter than 15 minutes", async () => {
    await expect(configureMetadataRefreshSchedule("user1", {
      enabled: true,
      intervalMinutes: 5,
    })).rejects.toThrow(/15 minutes/);
  });
});
