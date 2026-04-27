import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/integrations/http-helpers", () => ({
  fetchWithTimeout: vi.fn(),
  trimTrailingSlash: (value: string) => value.replace(/\/+$/, ""),
}));

import { fetchWithTimeout } from "@/lib/integrations/http-helpers";

import { verifyAiProvider } from "./verify-ai-provider";
import { SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS } from "./verify-service-connection-constants";
import type { VerifyServiceConnectionInput } from "./verify-service-connection-types";

const fetchWithTimeoutMock = vi.mocked(fetchWithTimeout);

function buildInput(overrides: Partial<VerifyServiceConnectionInput> = {}): VerifyServiceConnectionInput {
  return {
    serviceType: "ai-provider",
    baseUrl: "https://api.openai.test/v1",
    secret: "sk-test-token",
    metadata: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
}

describe("verifyAiProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls /models on the configured base URL with a Bearer token and no caching", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({ data: [{ id: "gpt-4o-mini" }] }),
    );

    await verifyAiProvider(buildInput());

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit, calledTimeout] = fetchWithTimeoutMock.mock.calls[0]!;
    expect(calledUrl).toBe("https://api.openai.test/v1/models");
    expect(calledInit).toMatchObject({
      cache: "no-store",
      headers: { Authorization: "Bearer sk-test-token" },
    });
    expect(calledTimeout).toBe(SERVICE_CONNECTION_VERIFICATION_TIMEOUT_MS);
  });

  it("strips a trailing slash from the configured base URL when building the /models URL", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ data: [{ id: "m" }] }));

    await verifyAiProvider(buildInput({ baseUrl: "https://api.openai.test/v1/" }));

    expect(fetchWithTimeoutMock.mock.calls[0]?.[0]).toBe("https://api.openai.test/v1/models");
  });

  it("returns success with the openai-compatible flavor and sorted unique model list", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        data: [
          { id: "gpt-4o" },
          { id: "gpt-3.5-turbo" },
          { id: "gpt-4o" }, // dup -> deduped
          { id: "" }, // empty -> dropped
        ],
      }),
    );

    const result = await verifyAiProvider(buildInput());

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/Loaded 2 models/);
    expect(result.metadata).toMatchObject({
      availableModels: ["gpt-3.5-turbo", "gpt-4o"],
      aiProviderFlavor: "openai-compatible",
    });
  });

  it("detects the LM Studio native flavor from a `models[].key` payload shape", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({
        models: [
          { key: "qwen2.5-coder", display_name: "Qwen Coder" },
          { key: "llama-3.1-8b" },
        ],
      }),
    );

    const result = await verifyAiProvider(buildInput({ baseUrl: "http://lm.test/api/v1" }));

    expect(result.ok).toBe(true);
    expect(result.metadata).toMatchObject({
      availableModels: ["llama-3.1-8b", "qwen2.5-coder"],
      aiProviderFlavor: "lm-studio-native",
    });
  });

  it("preserves user metadata while overlaying availableModels and aiProviderFlavor", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ data: [{ id: "gpt-4o" }] }));

    const result = await verifyAiProvider(
      buildInput({
        metadata: { customNote: "personal", aiProviderFlavor: "lm-studio-native" },
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.metadata).toMatchObject({
      customNote: "personal", // preserved
      availableModels: ["gpt-4o"],
      aiProviderFlavor: "openai-compatible", // overwritten by detection
    });
  });

  it("confirms the configured model is available when set in metadata", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      jsonResponse({ data: [{ id: "gpt-4o" }, { id: "gpt-3.5-turbo" }] }),
    );

    const result = await verifyAiProvider(buildInput({ metadata: { model: "gpt-4o" } }));

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/confirmed "gpt-4o"/);
  });

  it("fails (with metadata still attached) when the configured model is not in the returned list", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ data: [{ id: "gpt-4o" }] }));

    const result = await verifyAiProvider(buildInput({ metadata: { model: "claude-3" } }));

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/"claude-3" was not returned/);
    expect(result.metadata).toMatchObject({
      model: "claude-3",
      availableModels: ["gpt-4o"],
      aiProviderFlavor: "openai-compatible",
    });
  });

  it("returns a failure with the HTTP status when the provider rejects the request", async () => {
    fetchWithTimeoutMock.mockResolvedValue(
      new Response("Unauthorized", { status: 401 }),
    );

    const result = await verifyAiProvider(buildInput());

    expect(result).toEqual({
      ok: false,
      message: "AI provider verification failed with status 401.",
    });
  });

  it("never includes the bearer secret in the failure message", async () => {
    fetchWithTimeoutMock.mockResolvedValue(new Response("nope", { status: 403 }));

    const result = await verifyAiProvider(buildInput({ secret: "sk-leak-this-please" }));

    expect(result.ok).toBe(false);
    expect(result.message).not.toContain("sk-leak-this-please");
    expect(JSON.stringify(result)).not.toContain("sk-leak-this-please");
  });

  it("propagates network errors so the dispatcher can convert them into a generic failure", async () => {
    // The dispatcher (verify-service-connection.ts) is responsible for
    // catching and translating thrown errors. The verifier itself must NOT
    // swallow network errors silently — that would let "service down" look
    // identical to a successful empty model list.
    fetchWithTimeoutMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(verifyAiProvider(buildInput())).rejects.toThrow("ECONNREFUSED");
  });

  it("treats an empty-but-successful response as openai-compatible with zero models", async () => {
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({}));

    const result = await verifyAiProvider(buildInput());

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/Loaded 0 models/);
    expect(result.metadata).toMatchObject({
      availableModels: [],
      aiProviderFlavor: "openai-compatible",
    });
  });

  it("treats an unconfigured-model + empty-list response as 'connected'", async () => {
    // Edge case: provider returns no models but user hasn't picked one yet.
    // This must be ok=true so the user can save the connection and then pick.
    fetchWithTimeoutMock.mockResolvedValue(jsonResponse({ data: [] }));

    const result = await verifyAiProvider(buildInput({ metadata: null }));

    expect(result.ok).toBe(true);
  });
});
