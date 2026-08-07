import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
    auth: vi.fn((handler: unknown) => handler),
}));

import { config, proxy } from "./proxy";

type ProxyRequest = {
    auth: {
        user?: {
            id: string;
            mustChangePassword?: boolean;
        };
    } | null;
    nextUrl: URL;
};

const invokeProxy = proxy as unknown as (request: ProxyRequest) => Response;

describe("protected page proxy", () => {
    it("does not route authenticated APIs through cookie-refreshing proxy middleware", () => {
        expect(config.matcher).not.toContain("/api/downloads/:path*");
        expect(config.matcher).not.toContain("/api/service-connections/:path*");
    });

    it("does not treat the password-change page as public for anonymous callers", () => {
        const response = invokeProxy({
            auth: null,
            nextUrl: new URL("http://localhost:42021/settings/account"),
        });

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe(
            "http://localhost:42021/login?callbackUrl=%2Fsettings%2Faccount",
        );
    });

    it("allows a temporary-password session to reach only the password-change page", () => {
        const response = invokeProxy({
            auth: { user: { id: "user-1", mustChangePassword: true } },
            nextUrl: new URL("http://localhost:42021/settings/account"),
        });

        expect(response.status).toBe(200);
        expect(response.headers.get("x-middleware-next")).toBe("1");
    });
});
