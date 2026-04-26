import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/users/password-hasher", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@/modules/users/repositories/user-repository", () => ({
  clearFailedLogins: vi.fn(),
  findUserByEmail: vi.fn(),
  recordFailedLogin: vi.fn(),
}));

import { verifyPassword } from "@/modules/users/password-hasher";
import {
  clearFailedLogins,
  findUserByEmail,
  recordFailedLogin,
} from "@/modules/users/repositories/user-repository";
import { authenticateWithPassword } from "./authenticate-with-password";

const findUserByEmailMock = vi.mocked(findUserByEmail);
const verifyPasswordMock = vi.mocked(verifyPassword);
const recordFailedLoginMock = vi.mocked(recordFailedLogin);
const clearFailedLoginsMock = vi.mocked(clearFailedLogins);

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
    failedLoginAttempts: 0,
    lockedUntil: null,
    passwordChangedAt,
    createdAt: new Date("2025-12-01T00:00:00.000Z"),
    updatedAt: new Date("2025-12-15T00:00:00.000Z"),
    ...overrides,
  } as StoredUser;
}

describe("authenticateWithPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("returns a sanitized session payload on a successful login", async () => {
    findUserByEmailMock.mockResolvedValue(buildStoredUser());
    verifyPasswordMock.mockReturnValue(true);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).toEqual({
      id: "user-1",
      email: "user@example.com",
      displayName: "User One",
      role: "user",
      passwordChangedAt: passwordChangedAt.getTime(),
    });
    // No password hash or lockout state should be exposed to the caller.
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("lockedUntil");
    expect(recordFailedLoginMock).not.toHaveBeenCalled();
    expect(clearFailedLoginsMock).not.toHaveBeenCalled();
  });

  it("returns null when the user does not exist and never touches lockout state", async () => {
    findUserByEmailMock.mockResolvedValue(null);

    const result = await authenticateWithPassword({
      email: "missing@example.com",
      password: "anything",
    });

    expect(result).toBeNull();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
    expect(recordFailedLoginMock).not.toHaveBeenCalled();
    expect(clearFailedLoginsMock).not.toHaveBeenCalled();
  });

  it("returns null for a disabled user without performing password verification", async () => {
    findUserByEmailMock.mockResolvedValue(buildStoredUser({ isDisabled: true }));

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).toBeNull();
    expect(verifyPasswordMock).not.toHaveBeenCalled();
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
    verifyPasswordMock.mockReturnValue(true);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).toBeNull();
    // Critical: do NOT verify the password while locked - prevents both timing
    // signal and accidental unlock.
    expect(verifyPasswordMock).not.toHaveBeenCalled();
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
    verifyPasswordMock.mockReturnValue(true);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).not.toBeNull();
    // Stale lockout + non-zero attempt counter must be cleared on success.
    expect(clearFailedLoginsMock).toHaveBeenCalledWith("user-1");
  });

  it("records a failed login with the documented threshold and window when password is wrong", async () => {
    findUserByEmailMock.mockResolvedValue(buildStoredUser());
    verifyPasswordMock.mockReturnValue(false);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "wrong",
    });

    expect(result).toBeNull();
    expect(recordFailedLoginMock).toHaveBeenCalledTimes(1);
    expect(recordFailedLoginMock).toHaveBeenCalledWith("user-1", 5, 15 * 60 * 1000);
    expect(clearFailedLoginsMock).not.toHaveBeenCalled();
  });

  it("clears failed-login counters on success when prior attempts were recorded", async () => {
    findUserByEmailMock.mockResolvedValue(
      buildStoredUser({ failedLoginAttempts: 3, lockedUntil: null }),
    );
    verifyPasswordMock.mockReturnValue(true);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).not.toBeNull();
    expect(clearFailedLoginsMock).toHaveBeenCalledWith("user-1");
  });

  it("does not call clearFailedLogins on success when there is nothing to clear", async () => {
    findUserByEmailMock.mockResolvedValue(
      buildStoredUser({ failedLoginAttempts: 0, lockedUntil: null }),
    );
    verifyPasswordMock.mockReturnValue(true);

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
    verifyPasswordMock.mockReturnValue(true);

    const result = await authenticateWithPassword({
      email: "user@example.com",
      password: "correct-horse",
    });

    expect(result).not.toBeNull();
    expect(clearFailedLoginsMock).not.toHaveBeenCalled();
  });
});
