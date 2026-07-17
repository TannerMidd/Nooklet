import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({
  consumeRateLimit: vi.fn(() => ({ ok: true })),
  formatRetryAfter: vi.fn(() => "one minute"),
}));
vi.mock("@/modules/service-connections/workflows/disconnect-service-connection", () => ({
  disconnectServiceConnection: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/save-service-connection", () => ({
  saveConfiguredServiceConnection: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/test-and-save-service-connection", () => ({
  testAndSaveServiceConnection: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/verify-configured-service-connection", () => ({
  verifyConfiguredServiceConnection: vi.fn(),
}));

import { auth } from "@/auth";
import { saveConfiguredServiceConnection } from "@/modules/service-connections/workflows/save-service-connection";
import { testAndSaveServiceConnection } from "@/modules/service-connections/workflows/test-and-save-service-connection";

import { initialConnectionActionState } from "./action-state";
import { submitConnectionAction } from "./actions";

const authMock = vi.mocked(auth);
const saveMock = vi.mocked(saveConfiguredServiceConnection);
const testAndSaveMock = vi.mocked(testAndSaveServiceConnection);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("submitConnectionAction", () => {
  it("lets a regular user save their personal Trakt connection with structured fields", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } } as never);
    saveMock.mockResolvedValue({ ok: true, message: "Trakt configuration saved." });
    const form = new FormData();
    form.set("intent", "save");
    form.set("serviceType", "trakt");
    form.set("baseUrl", "https://api.trakt.tv");
    form.set("traktClientId", "client-id");
    form.set("traktAccessToken", "oauth-token");

    const result = await submitConnectionAction(initialConnectionActionState, form);

    expect(saveMock).toHaveBeenCalledWith("user-1", {
      serviceType: "trakt",
      baseUrl: "https://api.trakt.tv",
      apiKey: JSON.stringify({ clientId: "client-id", accessToken: "oauth-token" }),
    });
    expect(result).toEqual({ status: "success", message: "Trakt configuration saved.", fieldErrors: undefined });
  });

  it("keeps shared instance connections administrator-only", async () => {
    authMock.mockResolvedValue({ user: { id: "user-1", role: "user" } } as never);
    const form = new FormData();
    form.set("intent", "save");
    form.set("serviceType", "tmdb");

    const result = await submitConnectionAction(initialConnectionActionState, form);

    expect(result).toEqual({
      status: "error",
      message: "Only an administrator can change or verify shared server connections.",
    });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("uses test-and-save for an administrator's structured Usenet draft", async () => {
    authMock.mockResolvedValue({ user: { id: "admin-1", role: "admin" } } as never);
    testAndSaveMock.mockResolvedValue({ ok: true, message: "Usenet server connected and saved." });
    const form = new FormData();
    form.set("intent", "test-save");
    form.set("serviceType", "usenet-server");
    form.set("usenetHost", "news.example.test");
    form.set("usenetPort", "563");
    form.set("usenetConnections", "8");
    form.set("usenetUsername", "reader");
    form.set("usenetPassword", "secret");

    const result = await submitConnectionAction(initialConnectionActionState, form);

    expect(testAndSaveMock).toHaveBeenCalledWith("admin-1", {
      serviceType: "usenet-server",
      baseUrl: "nntps://news.example.test:563?connections=8",
      apiKey: "reader::secret",
    });
    expect(result).toEqual({ status: "success", message: "Usenet server connected and saved.", fieldErrors: undefined });
  });
});
