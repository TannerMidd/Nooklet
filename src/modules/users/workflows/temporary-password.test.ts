import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/users/password-hasher", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed-password"),
  verifyPassword: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
  createUser: vi.fn(),
  findUserByEmail: vi.fn(),
  findUserById: vi.fn(),
  updateUserPassword: vi.fn(),
}));

import { createUser, findUserByEmail, findUserById, updateUserPassword } from "@/modules/users/repositories/user-repository";
import { changePassword } from "./change-password";
import { createManagedUser } from "./create-managed-user";
import { resetManagedUserPassword } from "./reset-managed-user-password";

const storedUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "viewer@example.com",
  displayName: "Viewer",
  passwordHash: "old-hash",
  role: "user",
  isDisabled: false,
  mustChangePassword: false,
  failedLoginAttempts: 0,
  lockedUntil: null,
  passwordChangedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
} as const;

describe("temporary password lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(createUser).mockResolvedValue(storedUser as never);
    vi.mocked(findUserById).mockResolvedValue(storedUser as never);
    vi.mocked(updateUserPassword).mockResolvedValue(storedUser as never);
  });

  it("marks administrator-created accounts for a first-sign-in password change", async () => {
    await createManagedUser("admin-id", {
      displayName: "Viewer",
      email: "viewer@example.com",
      role: "user",
      password: "Temporary123",
      confirmPassword: "Temporary123",
    });

    expect(createUser).toHaveBeenCalledWith(expect.objectContaining({ mustChangePassword: true }));
  });

  it("marks administrator-reset passwords as temporary", async () => {
    await resetManagedUserPassword("admin-id", {
      userId: storedUser.id,
      newPassword: "Temporary123",
      confirmPassword: "Temporary123",
    });

    expect(updateUserPassword).toHaveBeenCalledWith(
      storedUser.id,
      "hashed-password",
      { mustChangePassword: true },
    );
  });

  it("clears the temporary-password requirement after the owner changes it", async () => {
    await changePassword(storedUser.id, {
      currentPassword: "Temporary123",
      newPassword: "Permanent456",
      confirmPassword: "Permanent456",
    });

    expect(updateUserPassword).toHaveBeenCalledWith(
      storedUser.id,
      "hashed-password",
      { mustChangePassword: false },
    );
  });
});
