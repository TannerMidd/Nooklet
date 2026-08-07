import { beforeEach, describe, expect, it, vi } from "vitest";

const userRepositoryMocks = vi.hoisted(() => ({
    findUserById: vi.fn(),
}));
const authSessionRepositoryMocks = vi.hoisted(() => ({
    isAuthSessionActive: vi.fn(),
    issueAuthSession: vi.fn(),
    revokeAuthSession: vi.fn(),
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
vi.mock("@/modules/identity-access/repositories/auth-session-repository", () => ({
    AUTH_SESSION_MAX_AGE_SECONDS: 24 * 60 * 60,
    ...authSessionRepositoryMocks,
}));

import { authCallbacks, authEvents } from "@/auth";

const findUserByIdMock = vi.mocked(userRepositoryMocks.findUserById);
const isAuthSessionActiveMock = vi.mocked(authSessionRepositoryMocks.isAuthSessionActive);
const issueAuthSessionMock = vi.mocked(authSessionRepositoryMocks.issueAuthSession);
const revokeAuthSessionMock = vi.mocked(authSessionRepositoryMocks.revokeAuthSession);

function runJwtCallback(token: Record<string, unknown>, user?: Record<string, unknown>) {
    return authCallbacks.jwt!({ token, user } as never);
}

function liveUser(passwordChangedAt: number, authGeneration = 3) {
    return {
        id: "user-1",
        role: "user",
        mustChangePassword: false,
        isDisabled: false,
        passwordChangedAt: new Date(passwordChangedAt),
        authGeneration,
    };
}

describe("auth JWT password-version callback", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isAuthSessionActiveMock.mockResolvedValue(true);
        issueAuthSessionMock.mockResolvedValue({
            id: "auth-session-1",
            expiresAt: new Date("2099-01-01T00:00:00.000Z"),
        });
    });

    it("persists revocation and password-version claims when a new session is issued", async () => {
        const token = { sub: "user-1" };

        const result = await runJwtCallback(token, {
            id: "user-1",
            role: "admin",
            mustChangePassword: true,
            passwordChangedAt: 1_000,
            authGeneration: 3,
        });

        expect(result).toMatchObject({
            role: "admin",
            mustChangePassword: true,
            pwdChangedAt: 1_000,
            authGeneration: 3,
            authSessionId: "auth-session-1",
        });
        expect(issueAuthSessionMock).toHaveBeenCalledWith("user-1", 3, 1_000);
        expect(findUserByIdMock).not.toHaveBeenCalled();
    });

    it("rejects a login payload without valid monotonic authentication state", async () => {
        await expect(
            runJwtCallback(
                { sub: "user-1" },
                {
                    id: "user-1",
                    role: "user",
                    mustChangePassword: false,
                    passwordChangedAt: 1_000,
                    authGeneration: 1.5,
                },
            ),
        ).resolves.toBeNull();

        expect(issueAuthSessionMock).not.toHaveBeenCalled();
    });

    it("rejects a login invalidated while its credentials were being verified", async () => {
        issueAuthSessionMock.mockResolvedValue(null);

        await expect(
            runJwtCallback(
                { sub: "user-1" },
                {
                    id: "user-1",
                    role: "user",
                    mustChangePassword: false,
                    passwordChangedAt: 1_000,
                    authGeneration: 3,
                },
            ),
        ).resolves.toBeNull();
    });

    it("rejects an authenticated token with no server-side session claim", async () => {
        await expect(
            runJwtCallback({
                sub: "user-1",
                pwdChangedAt: 1_000,
                authGeneration: 3,
            }),
        ).resolves.toBeNull();
        expect(isAuthSessionActiveMock).not.toHaveBeenCalled();
        expect(findUserByIdMock).not.toHaveBeenCalled();
    });

    it("rejects an authenticated token without a valid authentication generation", async () => {
        await expect(
            runJwtCallback({
                sub: "user-1",
                authSessionId: "auth-session-1",
                pwdChangedAt: 1_000,
                authGeneration: "3",
            }),
        ).resolves.toBeNull();

        expect(isAuthSessionActiveMock).not.toHaveBeenCalled();
        expect(findUserByIdMock).not.toHaveBeenCalled();
    });

    it("rejects a token whose server-side session was revoked", async () => {
        isAuthSessionActiveMock.mockResolvedValue(false);
        findUserByIdMock.mockResolvedValue(liveUser(1_000) as never);

        await expect(
            runJwtCallback({
                sub: "user-1",
                authSessionId: "auth-session-1",
                pwdChangedAt: 1_000,
                authGeneration: 3,
            }),
        ).resolves.toBeNull();
    });

    it("rejects a legacy authenticated token with no password-version claim", async () => {
        findUserByIdMock.mockResolvedValue(liveUser(1_000) as never);

        await expect(
            runJwtCallback({
                sub: "user-1",
                authSessionId: "auth-session-1",
                authGeneration: 3,
            }),
        ).resolves.toBeNull();
    });

    it("rejects an authenticated token with a malformed password-version claim", async () => {
        findUserByIdMock.mockResolvedValue(liveUser(1_000) as never);

        await expect(
            runJwtCallback({
                sub: "user-1",
                authSessionId: "auth-session-1",
                pwdChangedAt: "1000",
                authGeneration: 3,
            }),
        ).resolves.toBeNull();
    });

    it("rejects a token issued before the current password", async () => {
        findUserByIdMock.mockResolvedValue(liveUser(2_000) as never);

        await expect(
            runJwtCallback({
                sub: "user-1",
                authSessionId: "auth-session-1",
                pwdChangedAt: 1_000,
                authGeneration: 3,
            }),
        ).resolves.toBeNull();
    });

    it("rejects a token from an earlier authentication generation", async () => {
        findUserByIdMock.mockResolvedValue(liveUser(1_000, 4) as never);

        await expect(
            runJwtCallback({
                sub: "user-1",
                authSessionId: "auth-session-1",
                pwdChangedAt: 1_000,
                authGeneration: 3,
            }),
        ).resolves.toBeNull();
    });

    it("accepts a current claim and refreshes live authorization state", async () => {
        findUserByIdMock.mockResolvedValue({
            ...liveUser(2_000),
            role: "admin",
            mustChangePassword: true,
        } as never);

        const result = await runJwtCallback({
            sub: "user-1",
            authSessionId: "auth-session-1",
            pwdChangedAt: 2_000,
            authGeneration: 3,
            role: "user",
            mustChangePassword: false,
        });

        expect(result).toMatchObject({
            sub: "user-1",
            pwdChangedAt: 2_000,
            authGeneration: 3,
            role: "admin",
            mustChangePassword: true,
        });
        expect(isAuthSessionActiveMock).toHaveBeenCalledWith("auth-session-1", "user-1", 3);
    });

    it("keeps the revocation identifier server-only", () => {
        const result = authCallbacks.session!({
            session: {
                user: { name: "User", email: "user@nooklet.test" },
                expires: "2099-01-01T00:00:00.000Z",
            },
            token: {
                sub: "user-1",
                authSessionId: "auth-session-1",
                role: "user",
                mustChangePassword: false,
            },
        } as never);

        expect(result).toMatchObject({
            user: { id: "user-1" },
        });
        expect(result).not.toHaveProperty("authSessionId");
    });

    it("revokes the server-side record when the Auth.js sign-out protocol is used", async () => {
        await authEvents.signOut({
            token: { sub: "user-1", authSessionId: "auth-session-1" },
        } as never);

        expect(revokeAuthSessionMock).toHaveBeenCalledWith("auth-session-1", "user-1");
    });
});
