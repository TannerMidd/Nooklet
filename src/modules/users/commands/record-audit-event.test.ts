import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { recordAuditEvent } from "./record-audit-event";

const createAuditEventMock = vi.mocked(createAuditEvent);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordAuditEvent", () => {
  it("delegates a validated audit event to the users repository", async () => {
    await recordAuditEvent({
      actorUserId: "user1",
      eventType: "download.queued",
      subjectType: "download-request",
      subjectId: "request1",
      payload: { resultCount: 1 },
    });

    expect(createAuditEventMock).toHaveBeenCalledWith({
      actorUserId: "user1",
      eventType: "download.queued",
      subjectType: "download-request",
      subjectId: "request1",
      payload: { resultCount: 1 },
    });
  });

  it("rejects empty event types", async () => {
    await expect(recordAuditEvent({
      eventType: "",
      subjectType: "download-request",
    })).rejects.toThrow();
  });
});
