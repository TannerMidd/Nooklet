import { beforeEach, describe, expect, it, vi } from "vitest";

const jwtMocks = vi.hoisted(() => ({ getToken: vi.fn() }));
const repositoryMocks = vi.hoisted(() => ({ revokeAuthSession: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("next-auth/jwt", () => jwtMocks);
vi.mock("next/headers", () => ({
    headers: vi.fn(async () => new Headers({ cookie: "authjs.session-token=test" })),
}));
vi.mock("@/lib/env", () => ({
    env: {
        APP_URL: "http://localhost:3000",
        AUTH_SECRET: "test-auth-secret-with-sufficient-length",
    },
}));
vi.mock("@/modules/identity-access/repositories/auth-session-repository", () => repositoryMocks);

import { getToken } from "next-auth/jwt";
import { revokeAuthSession } from "@/modules/identity-access/repositories/auth-session-repository";

import { revokeRequestAuthSession } from "./revoke-request-auth-session";

const getTokenMock = vi.mocked(getToken);
const revokeAuthSessionMock = vi.mocked(revokeAuthSession);

describe("revokeRequestAuthSession", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("decodes the raw request cookie and revokes its durable session", async () => {
        getTokenMock.mockResolvedValue({
            sub: "user-1",
            authSessionId: "auth-session-1",
        });

        await expect(revokeRequestAuthSession()).resolves.toBe(true);

        expect(getTokenMock).toHaveBeenCalledWith(
            expect.objectContaining({
                secret: "test-auth-secret-with-sufficient-length",
                secureCookie: false,
            }),
        );
        expect(revokeAuthSessionMock).toHaveBeenCalledWith("auth-session-1", "user-1");
    });

    it("treats an absent or malformed authenticated claim as already signed out", async () => {
        getTokenMock.mockResolvedValue({ sub: "user-1" });

        await expect(revokeRequestAuthSession()).resolves.toBe(false);
        expect(revokeAuthSessionMock).not.toHaveBeenCalled();
    });

    it("propagates durable revocation failures before the cookie can be cleared", async () => {
        getTokenMock.mockResolvedValue({
            sub: "user-1",
            authSessionId: "auth-session-1",
        });
        revokeAuthSessionMock.mockRejectedValue(new Error("database unavailable"));

        await expect(revokeRequestAuthSession()).rejects.toThrow("database unavailable");
    });
});
