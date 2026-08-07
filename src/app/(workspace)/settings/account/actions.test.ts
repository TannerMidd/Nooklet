import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  signOut: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: mocks.auth,
  signOut: mocks.signOut,
}));

vi.mock("@/modules/users/workflows/change-password", () => ({
  changePassword: mocks.changePassword,
}));

import { initialChangePasswordActionState } from "./action-state";
import { submitChangePasswordAction } from "./actions";

function validPasswordForm() {
  const formData = new FormData();
  formData.set("currentPassword", "Temporary1234");
  formData.set("newPassword", "Permanent5678");
  formData.set("confirmPassword", "Permanent5678");
  return formData;
}

describe("submitChangePasswordAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("ends the password-version-stale session and sends the user to sign in again", async () => {
    mocks.changePassword.mockResolvedValue({ ok: true });
    // Auth.js redirects by throwing in production. Resolving the mock lets us
    // also verify the defensive fallback state if a redirect adapter returns.
    mocks.signOut.mockResolvedValue(undefined);

    const result = await submitChangePasswordAction(
      initialChangePasswordActionState,
      validPasswordForm(),
    );

    expect(mocks.changePassword).toHaveBeenCalledWith("user-1", {
      currentPassword: "Temporary1234",
      newPassword: "Permanent5678",
      confirmPassword: "Permanent5678",
    });
    expect(mocks.signOut).toHaveBeenCalledWith({
      redirectTo: "/login?passwordChanged=1&callbackUrl=%2Fhome",
    });
    expect(result).toEqual({
      status: "success",
      message: "Password updated. Sign in again with your new password.",
    });
  });

  it("keeps the current session when the password change fails", async () => {
    mocks.changePassword.mockResolvedValue({
      ok: false,
      message: "Current password is incorrect.",
      field: "currentPassword",
    });

    const result = await submitChangePasswordAction(
      initialChangePasswordActionState,
      validPasswordForm(),
    );

    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "error",
      message: "Current password is incorrect.",
      fieldErrors: { currentPassword: "Current password is incorrect." },
    });
  });
});
