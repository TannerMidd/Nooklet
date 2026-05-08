import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/jobs/repositories/job-repository", () => ({
  saveRecurringJob: vi.fn(),
}));
vi.mock("@/modules/users/commands/record-audit-event", () => ({
  recordAuditEvent: vi.fn(),
}));

import { saveRecurringJob } from "@/modules/jobs/repositories/job-repository";
import { recordAuditEvent } from "@/modules/users/commands/record-audit-event";

import { configureLibraryScanSchedule } from "./configure-library-scan-schedule";

const saveRecurringJobMock = vi.mocked(saveRecurringJob);
const recordAuditEventMock = vi.mocked(recordAuditEvent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("configureLibraryScanSchedule", () => {
  it("saves a recurring media-library scan job and records an audit event", async () => {
    saveRecurringJobMock.mockResolvedValue({ id: "job1" } as never);

    const result = await configureLibraryScanSchedule("user1", {
      enabled: true,
      intervalMinutes: 120,
    });

    expect(saveRecurringJobMock).toHaveBeenCalledWith({
      userId: "user1",
      jobType: "media-library-scan",
      targetType: "media-library",
      targetKey: "all",
      scheduleMinutes: 120,
      isEnabled: true,
    });
    expect(recordAuditEventMock).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: "user1",
      eventType: "media-library.scan.schedule.updated",
      subjectType: "media-library-scan-schedule",
      subjectId: "all",
    }));
    expect(result).toEqual({ ok: true, message: "Library scan enabled every 120 minutes." });
  });

  it("rejects intervals shorter than 15 minutes", async () => {
    await expect(configureLibraryScanSchedule("user1", {
      enabled: true,
      intervalMinutes: 5,
    })).rejects.toThrow(/15 minutes/);
  });
});