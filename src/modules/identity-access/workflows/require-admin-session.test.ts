import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    // Next's real `redirect` throws a NEXT_REDIRECT control-flow error so the
    // calling component aborts. We mirror that by throwing a tagged error so
    // tests can assert the destination AND verify control flow stops.
    const error = new Error(`NEXT_REDIRECT:${destination}`);
    (error as Error & { digest?: string }).digest = `NEXT_REDIRECT;replace;${destination};307;`;
    throw error;
  }),
}));

import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { requireAdminSession } from "./require-admin-session";

const authMock = vi.mocked(auth);
const redirectMock = vi.mocked(redirect);

function buildSession(overrides: { role?: string; email?: string } = {}) {
  return {
    user: {
      id: "user-1",
      email: overrides.email ?? "user@example.com",
      name: "User One",
      role: overrides.role ?? "user",
    },
    expires: "2099-01-01T00:00:00.000Z",
  } as unknown as Awaited<ReturnType<typeof auth>>;
}

describe("requireAdminSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session unchanged for an admin user", async () => {
    const adminSession = buildSession({ role: "admin", email: "admin@example.com" });
    authMock.mockResolvedValue(adminSession);

    const result = await requireAdminSession();

    expect(result).toBe(adminSession);
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("redirects to /login when there is no active session", async () => {
    authMock.mockResolvedValue(null as never);

    await expect(requireAdminSession()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to /login when the session has no user payload", async () => {
    authMock.mockResolvedValue({ expires: "2099-01-01T00:00:00.000Z" } as unknown as Awaited<
      ReturnType<typeof auth>
    >);

    await expect(requireAdminSession()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects a signed-in non-admin to /tv (does not leak admin existence)", async () => {
    authMock.mockResolvedValue(buildSession({ role: "user" }));

    await expect(requireAdminSession()).rejects.toThrow(/NEXT_REDIRECT:\/tv/);
    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/tv");
  });

  it("treats unknown role values as non-admin and redirects to /tv", async () => {
    authMock.mockResolvedValue(
      buildSession({ role: "superuser" as unknown as string }),
    );

    await expect(requireAdminSession()).rejects.toThrow(/NEXT_REDIRECT:\/tv/);
    expect(redirectMock).toHaveBeenCalledWith("/tv");
  });

  it("redirects when the role field is missing entirely", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1", email: "u@example.com", name: "U" },
      expires: "2099-01-01T00:00:00.000Z",
    } as unknown as Awaited<ReturnType<typeof auth>>);

    await expect(requireAdminSession()).rejects.toThrow(/NEXT_REDIRECT:\/tv/);
    expect(redirectMock).toHaveBeenCalledWith("/tv");
  });

  it("propagates auth() failures rather than redirecting on infrastructure errors", async () => {
    // If the auth provider is down we MUST surface the error, never silently
    // send the user to /login (which would mask outages and confuse retry UX).
    authMock.mockRejectedValue(new Error("auth provider unavailable"));

    await expect(requireAdminSession()).rejects.toThrow("auth provider unavailable");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
