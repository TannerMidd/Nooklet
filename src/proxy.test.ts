import { describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn((handler: unknown) => handler),
}));

import { proxy } from "./proxy";

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

describe("proxy API session enforcement", () => {
  it("rejects a temporary-password session at a protected API boundary", async () => {
    const response = invokeProxy({
      auth: { user: { id: "user-1", mustChangePassword: true } },
      nextUrl: new URL("http://localhost:42021/api/downloads/queue"),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      code: "password_change_required",
      message: "Replace the temporary password before using this endpoint.",
    });
  });

  it("preserves an API-shaped unauthorized response for anonymous callers", async () => {
    const response = invokeProxy({
      auth: null,
      nextUrl: new URL("http://localhost:42021/api/downloads/queue"),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      code: "unauthorized",
      message: "Unauthorized",
    });
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
