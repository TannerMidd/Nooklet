import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));
vi.mock("@/modules/preferences/repositories/preferences-repository", () => ({
  upsertPreferences: vi.fn(),
}));

import { upsertPreferences } from "@/modules/preferences/repositories/preferences-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { updatePreferences } from "./update-preferences";

const upsertMock = vi.mocked(upsertPreferences);
const auditMock = vi.mocked(createAuditEvent);

const baseInput = {
  defaultMediaMode: "tv" as const,
  defaultResultCount: 10,
  defaultTemperature: 0.9,
  watchHistoryOnly: false,
  watchHistorySourceTypes: ["plex"] as ("plex" | "jellyfin" | "tautulli" | "trakt" | "manual")[],
  historyHideExisting: false,
  historyHideLiked: false,
  historyHideDisliked: false,
  historyHideHidden: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updatePreferences", () => {
  it("forwards the userId plus the full input to upsertPreferences and returns the result", async () => {
    const stored = { userId: "u1", updatedAt: new Date() };
    upsertMock.mockResolvedValue(stored as never);

    const result = await updatePreferences("u1", baseInput);

    expect(upsertMock).toHaveBeenCalledWith({ userId: "u1", ...baseInput });
    expect(result).toBe(stored);
  });

  it("writes a preferences.updated audit event with a JSON payload of the visible fields", async () => {
    upsertMock.mockResolvedValue({ userId: "u1", updatedAt: new Date() } as never);

    await updatePreferences("u1", baseInput);

    expect(auditMock).toHaveBeenCalledTimes(1);
    const auditArg = auditMock.mock.calls[0][0];
    expect(auditArg.actorUserId).toBe("u1");
    expect(auditArg.eventType).toBe("preferences.updated");
    expect(auditArg.subjectType).toBe("preferences");
    expect(auditArg.subjectId).toBe("u1");

    expect(auditArg.payloadJson).toBeDefined();
    const parsed = JSON.parse(auditArg.payloadJson as string);
    expect(parsed).toEqual({
      defaultMediaMode: "tv",
      defaultResultCount: 10,
      defaultTemperature: 0.9,
      watchHistoryOnly: false,
      watchHistorySourceTypes: ["plex"],
    });
  });

  it("propagates upsert errors without recording an audit event", async () => {
    upsertMock.mockRejectedValue(new Error("db down"));

    await expect(updatePreferences("u1", baseInput)).rejects.toThrow(/db down/);
    expect(auditMock).not.toHaveBeenCalled();
  });
});
