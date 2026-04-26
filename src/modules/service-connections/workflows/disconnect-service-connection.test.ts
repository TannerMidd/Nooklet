import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  deleteServiceConnection: vi.fn(),
}));

vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { deleteServiceConnection } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { disconnectServiceConnection } from "./disconnect-service-connection";

const deleteMock = vi.mocked(deleteServiceConnection);
const auditMock = vi.mocked(createAuditEvent);

const USER_ID = "user-1";

describe("disconnectServiceConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("deletes the service connection and emits an audit event when a record was removed", async () => {
    deleteMock.mockResolvedValue(true);

    const result = await disconnectServiceConnection(USER_ID, "sonarr");

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledWith(USER_ID, "sonarr");

    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock).toHaveBeenCalledWith({
      actorUserId: USER_ID,
      eventType: "service-connections.disconnected",
      subjectType: "service-connection",
      subjectId: "sonarr",
      payloadJson: JSON.stringify({ serviceType: "sonarr" }),
    });

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/disconnected\.$/);
  });

  it("does NOT emit an audit event when there was nothing to delete (idempotent no-op)", async () => {
    deleteMock.mockResolvedValue(false);

    const result = await disconnectServiceConnection(USER_ID, "sonarr");

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(auditMock).not.toHaveBeenCalled();

    expect(result).toEqual({
      ok: false,
      message: "Nothing to disconnect.",
    });
  });

  it.each([
    ["ai-provider"],
    ["sonarr"],
    ["radarr"],
    ["tautulli"],
    ["plex"],
    ["sabnzbd"],
  ] as const)("forwards the %s service type to the repository and audit subject", async (serviceType) => {
    deleteMock.mockResolvedValue(true);

    await disconnectServiceConnection(USER_ID, serviceType);

    expect(deleteMock).toHaveBeenCalledWith(USER_ID, serviceType);
    expect(auditMock.mock.calls[0]?.[0]?.subjectId).toBe(serviceType);
    expect(auditMock.mock.calls[0]?.[0]?.payloadJson).toBe(
      JSON.stringify({ serviceType }),
    );
  });

  it("does not include any secret-shaped data in the audit payload", async () => {
    deleteMock.mockResolvedValue(true);

    await disconnectServiceConnection(USER_ID, "sonarr");

    const payload = auditMock.mock.calls[0]?.[0]?.payloadJson ?? "";
    expect(payload).not.toMatch(/apiKey|secret|encryptedValue|maskedValue/i);
  });
});
