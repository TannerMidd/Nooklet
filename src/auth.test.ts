import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
  findUserById: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    handlers: {},
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
  })),
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn((configuration) => configuration),
}));

vi.mock("@/lib/env", () => ({
  env: {
    APP_URL: "http://localhost:3000",
    AUTH_SECRET: "test-auth-secret-with-sufficient-length",
    TRUST_PROXY_HEADERS: false,
  },
}));

vi.mock("@/modules/users/repositories/user-repository", () => userRepositoryMocks);

import { authCallbacks } from "@/auth";

const findUserByIdMock = vi.mocked(userRepositoryMocks.findUserById);

function runJwtCallback(token: Record<string, unknown>, user?: Record<string, unknown>) {
  return authCallbacks.jwt!({ token, user } as never);
}

function liveUser(passwordChangedAt: number) {
  return {
    id: "user-1",
    role: "user",
    mustChangePassword: false,
    isDisabled: false,
    passwordChangedAt: new Date(passwordChangedAt),
  };
}

describe("auth JWT password-version callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("populates the password-version claim when a new session is issued", async () => {
    const token = { sub: "user-1" };

    const result = await runJwtCallback(token, {
      id: "user-1",
      role: "admin",
      mustChangePassword: true,
      passwordChangedAt: 1_000,
    });

    expect(result).toMatchObject({
      role: "admin",
      mustChangePassword: true,
      pwdChangedAt: 1_000,
    });
    expect(findUserByIdMock).not.toHaveBeenCalled();
  });

  it("rejects a legacy authenticated token with no password-version claim", async () => {
    findUserByIdMock.mockResolvedValue(liveUser(1_000) as never);

    await expect(runJwtCallback({ sub: "user-1" })).resolves.toBeNull();
  });

  it("rejects an authenticated token with a malformed password-version claim", async () => {
    findUserByIdMock.mockResolvedValue(liveUser(1_000) as never);

    await expect(runJwtCallback({ sub: "user-1", pwdChangedAt: "1000" })).resolves.toBeNull();
  });

  it("rejects a token issued before the current password", async () => {
    findUserByIdMock.mockResolvedValue(liveUser(2_000) as never);

    await expect(runJwtCallback({ sub: "user-1", pwdChangedAt: 1_000 })).resolves.toBeNull();
  });

  it("accepts a current claim and refreshes live authorization state", async () => {
    findUserByIdMock.mockResolvedValue({
      ...liveUser(2_000),
      role: "admin",
      mustChangePassword: true,
    } as never);

    const result = await runJwtCallback({
      sub: "user-1",
      pwdChangedAt: 2_000,
      role: "user",
      mustChangePassword: false,
    });

    expect(result).toMatchObject({
      sub: "user-1",
      pwdChangedAt: 2_000,
      role: "admin",
      mustChangePassword: true,
    });
  });
});
