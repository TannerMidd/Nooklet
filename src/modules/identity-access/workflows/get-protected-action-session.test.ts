import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
    auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
    redirect: vi.fn((destination: string) => {
        throw new Error(`NEXT_REDIRECT:${destination}`);
    }),
}));

import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { getProtectedActionSession } from "./get-protected-action-session";

const authMock = vi.mocked(auth);
const redirectMock = vi.mocked(redirect);

describe("getProtectedActionSession", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns an anonymous session so the action can preserve its typed auth error", async () => {
        authMock.mockResolvedValue(null as never);

        await expect(getProtectedActionSession()).resolves.toBeNull();
        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("returns a session whose password has already been replaced", async () => {
        const session = {
            user: { id: "user-1", mustChangePassword: false },
            expires: "2099-01-01T00:00:00.000Z",
        } as unknown as Awaited<ReturnType<typeof auth>>;

        authMock.mockResolvedValue(session);

        await expect(getProtectedActionSession()).resolves.toBe(session);
        expect(redirectMock).not.toHaveBeenCalled();
    });

    it("redirects a temporary-password session before a protected action can run", async () => {
        authMock.mockResolvedValue({
            user: { id: "user-1", mustChangePassword: true },
            expires: "2099-01-01T00:00:00.000Z",
        } as unknown as Awaited<ReturnType<typeof auth>>);

        await expect(getProtectedActionSession()).rejects.toThrow(
            "NEXT_REDIRECT:/settings/account?reason=temporary-password",
        );
        expect(redirectMock).toHaveBeenCalledWith("/settings/account?reason=temporary-password");
    });

    it("propagates auth infrastructure failures", async () => {
        authMock.mockRejectedValue(new Error("auth unavailable"));

        await expect(getProtectedActionSession()).rejects.toThrow("auth unavailable");
        expect(redirectMock).not.toHaveBeenCalled();
    });
});
