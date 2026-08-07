import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/users/password-hasher", () => ({
  hashPassword: vi.fn(),
  passwordHashNeedsUpgrade: vi.fn(),
  verifyPassword: vi.fn(),
}));

vi.mock("@/modules/users/repositories/user-repository", () => ({
  clearFailedLogins: vi.fn(),
  findUserByEmail: vi.fn(),
  recordFailedLogin: vi.fn(),
  updateUserPassword: vi.fn(),
}));

import {
  hashPassword,
  passwordHashNeedsUpgrade,
  verifyPassword,
} from "@/modules/users/password-hasher";
import {
  clearFailedLogins,
  findUserByEmail,
  recordFailedLogin,
  updateUserPassword,
} from "@/modules/users/repositories/user-repository";
import { authenticateWithPassword } from "./authenticate-with-password";

const findUserByEmailMock = vi.mocked(findUserByEmail);
const verifyPasswordMock = vi.mocked(verifyPassword);
const hashPasswordMock = vi.mocked(hashPassword);
const passwordHashNeedsUpgradeMock = vi.mocked(passwordHashNeedsUpgrade);
const recordFailedLoginMock = vi.mocked(recordFailedLogin);
const clearFailedLoginsMock = vi.mocked(clearFailedLogins);
const updateUserPasswordMock = vi.mocked(updateUserPassword);

const passwordChangedAt = new Date("2026-01-01T00:00:00.000Z");

type StoredUser = NonNullable<Awaited<ReturnType<typeof findUserByEmail>>>;

function buildStoredUser(overrides: Partial<StoredUser> = {}): StoredUser {
  return {
    id: "user-1",
    email: "user@example.com",
    displayName: "User One",
    passwordHash: "scrypt$salt$hash",
    role: "user",
    isDisabled: false,
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt,
    authGeneration: 0,
    createdAt: new Date("2025-12-01T00:00:00.000Z"),
    updatedAt: new Date("2025-12-15T00:00:00.000Z"),
    ...overrides,
  } as StoredUser;
}

describe("authenticateWithPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    verifyPasswordMock.mockResolvedValue(true);
    hashPasswordMock.mockResolvedValue("scrypt$2$32768$8$3$salt$hash");
    passwordHashNeedsUpgradeMock.mockReturnValue(false);
  });

  it("returns a sanitized session payload on a successful login", async () => {
    findUserByEmailMock.mockResolvedValue(buildStoredUser());
    verifyPasswordMock.mockResolvedValue(true);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).toEqual({
      id: "user-1",
      email: "user@example.com",
      displayName: "User One",
      role: "user",
      mustChangePassword: false,
      passwordChangedAt: passwordChangedAt.getTime(),
      authGeneration: 0,
    });
    // No password hash or lockout state should be exposed to the caller.
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("lockedUntil");
    expect(recordFailedLoginMock).not.toHaveBeenCalled();
    expect(clearFailedLoginsMock).not.toHaveBeenCalled();
  });

  it("returns null when the user does not exist and performs a dummy password check", async () => {
    findUserByEmailMock.mockResolvedValue(null);

    const result = await authenticateWithPassword({
      email: "missing@example.com",
      password: "anything",
    });

    expect(result).toBeNull();
    expect(verifyPasswordMock).toHaveBeenCalledWith("anything", expect.stringMatching(/^scrypt\$/));
    expect(recordFailedLoginMock).not.toHaveBeenCalled();
    expect(clearFailedLoginsMock).not.toHaveBeenCalled();
  });

  it("returns null for a disabled user after a dummy password check", async () => {
    findUserByEmailMock.mockResolvedValue(buildStoredUser({ isDisabled: true }));

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).toBeNull();
    expect(verifyPasswordMock).toHaveBeenCalledWith(
      "correct-horse",
      expect.stringMatching(/^scrypt\$/),
    );
    expect(recordFailedLoginMock).not.toHaveBeenCalled();
  });

  it("returns null when the account is currently locked, even with the correct password", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    findUserByEmailMock.mockResolvedValue(
      buildStoredUser({
        failedLoginAttempts: 5,
        lockedUntil: new Date("2026-04-26T12:10:00.000Z"),
      }),
    );
    verifyPasswordMock.mockResolvedValue(true);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).toBeNull();
    expect(verifyPasswordMock).toHaveBeenCalledWith(
      "correct-horse",
      expect.stringMatching(/^scrypt\$/),
    );
    expect(recordFailedLoginMock).not.toHaveBeenCalled();
    expect(clearFailedLoginsMock).not.toHaveBeenCalled();
  });

  it("authenticates after a previous lockout window has elapsed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-26T12:00:00.000Z"));
    findUserByEmailMock.mockResolvedValue(
      buildStoredUser({
        failedLoginAttempts: 5,
        lockedUntil: new Date("2026-04-26T11:30:00.000Z"),
      }),
    );
    verifyPasswordMock.mockResolvedValue(true);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).not.toBeNull();
    // Stale lockout + non-zero attempt counter must be cleared on success.
    expect(clearFailedLoginsMock).toHaveBeenCalledWith("user-1");
  });

  it("records a failed login without creating an unauthenticated hard lockout", async () => {
    findUserByEmailMock.mockResolvedValue(buildStoredUser());
    verifyPasswordMock.mockResolvedValue(false);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "wrong",
    });

    expect(result).toBeNull();
    expect(recordFailedLoginMock).toHaveBeenCalledTimes(1);
    expect(recordFailedLoginMock).toHaveBeenCalledWith("user-1");
    expect(clearFailedLoginsMock).not.toHaveBeenCalled();
  });

  it("clears failed-login counters on success when prior attempts were recorded", async () => {
    findUserByEmailMock.mockResolvedValue(
      buildStoredUser({ failedLoginAttempts: 3, lockedUntil: null }),
    );
    verifyPasswordMock.mockResolvedValue(true);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).not.toBeNull();
    expect(clearFailedLoginsMock).toHaveBeenCalledWith("user-1");
  });

  it("upgrades a legacy password hash after successful verification", async () => {
    const upgradedAt = new Date("2026-05-01T00:00:00.000Z");
    findUserByEmailMock.mockResolvedValue(buildStoredUser());
    passwordHashNeedsUpgradeMock.mockReturnValue(true);
    hashPasswordMock.mockResolvedValue("scrypt$2$32768$8$3$new-salt$new-key");
    updateUserPasswordMock.mockResolvedValue(buildStoredUser({
      passwordHash: "scrypt$2$32768$8$3$new-salt$new-key",
      passwordChangedAt: upgradedAt,
      authGeneration: 1,
    }));

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(hashPasswordMock).toHaveBeenCalledWith("correct-horse");
    expect(updateUserPasswordMock).toHaveBeenCalledWith(
      "user-1",
      "scrypt$2$32768$8$3$new-salt$new-key",
    );
    expect(result?.passwordChangedAt).toBe(upgradedAt.getTime());
    expect(result?.authGeneration).toBe(1);
    expect(clearFailedLoginsMock).not.toHaveBeenCalled();
  });

  it("does not call clearFailedLogins on success when there is nothing to clear", async () => {
    findUserByEmailMock.mockResolvedValue(
      buildStoredUser({ failedLoginAttempts: 0, lockedUntil: null }),
    );
    verifyPasswordMock.mockResolvedValue(true);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).not.toBeNull();
    expect(clearFailedLoginsMock).not.toHaveBeenCalled();
  });

  it("treats a null failedLoginAttempts column as zero", async () => {
    findUserByEmailMock.mockResolvedValue(
      buildStoredUser({
        failedLoginAttempts: null as unknown as number,
        lockedUntil: null,
      }),
    );
    verifyPasswordMock.mockResolvedValue(true);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).not.toBeNull();
    expect(clearFailedLoginsMock).not.toHaveBeenCalled();
  });
});
