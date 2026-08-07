import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  signOut: vi.fn(),
}));
vi.mock("@/modules/identity-access/workflows/revoke-request-auth-session", () => ({
  revokeRequestAuthSession: vi.fn(),
}));

import { signOut } from "@/auth";
import {
  revokeRequestAuthSession,
} from "@/modules/identity-access/workflows/revoke-request-auth-session";

import { submitSignOutAction } from "./sign-out-actions";

const revokeRequestAuthSessionMock = vi.mocked(revokeRequestAuthSession);
const signOutMock = vi.mocked(signOut);

describe("submitSignOutAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    revokeRequestAuthSessionMock.mockResolvedValue(true);
  });

  it("revokes the server-side session before clearing the browser cookie", async () => {
    await submitSignOutAction();

    expect(revokeRequestAuthSessionMock).toHaveBeenCalledOnce();
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: "/login" });
    expect(revokeRequestAuthSessionMock.mock.invocationCallOrder[0])
      .toBeLessThan(signOutMock.mock.invocationCallOrder[0]);
  });

  it("still clears an anonymous or already-invalid browser cookie", async () => {
    revokeRequestAuthSessionMock.mockResolvedValue(false);

    await submitSignOutAction();

    expect(revokeRequestAuthSessionMock).toHaveBeenCalledOnce();
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: "/login" });
  });

  it("does not claim sign-out succeeded when durable revocation fails", async () => {
    revokeRequestAuthSessionMock.mockRejectedValue(new Error("database unavailable"));

    await expect(submitSignOutAction()).rejects.toThrow("database unavailable");
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
