import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const handlerMocks = vi.hoisted(() => ({
    GET: vi.fn(),
    POST: vi.fn(),
}));

vi.mock("@/auth", () => ({ handlers: handlerMocks }));

import { GET, POST } from "./route";

describe("Auth.js route boundary", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        handlerMocks.GET.mockResolvedValue(new Response(null, { status: 204 }));
        handlerMocks.POST.mockResolvedValue(new Response(null, { status: 204 }));
    });

    it.each(["GET", "POST"] as const)(
        "keeps direct %s sign-out unavailable so logout remains fail-closed",
        async (method) => {
            const request = new NextRequest("http://localhost:3000/api/auth/signout", { method });
            const response = method === "GET" ? await GET(request) : await POST(request);

            expect(response.status).toBe(404);
            expect(response.headers.get("cache-control")).toBe("no-store");
            expect(handlerMocks[method]).not.toHaveBeenCalled();
        },
    );

    it("delegates all other Auth.js GET routes", async () => {
        const request = new NextRequest("http://localhost:3000/api/auth/session");

        await expect(GET(request)).resolves.toMatchObject({ status: 204 });
        expect(handlerMocks.GET).toHaveBeenCalledWith(request);
    });

    it("delegates all other Auth.js POST routes", async () => {
        const request = new NextRequest("http://localhost:3000/api/auth/callback/credentials", {
            method: "POST",
        });

        await expect(POST(request)).resolves.toMatchObject({ status: 204 });
        expect(handlerMocks.POST).toHaveBeenCalledWith(request);
    });
});
