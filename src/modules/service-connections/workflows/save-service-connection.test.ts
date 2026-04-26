import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  encryptSecret: vi.fn((value: string) => `enc(${value})`),
  maskSecret: vi.fn((value: string) => `mask(${value})`),
}));

vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
  saveServiceConnection: vi.fn(),
}));

vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { encryptSecret, maskSecret } from "@/lib/security/secret-box";
import {
  findServiceConnectionByType,
  saveServiceConnection,
} from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { saveConfiguredServiceConnection } from "./save-service-connection";

const findMock = vi.mocked(findServiceConnectionByType);
const saveMock = vi.mocked(saveServiceConnection);
const auditMock = vi.mocked(createAuditEvent);
const encryptMock = vi.mocked(encryptSecret);
const maskMock = vi.mocked(maskSecret);

const USER_ID = "user-1";

describe("saveConfiguredServiceConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMock.mockResolvedValue(null);
    saveMock.mockResolvedValue(undefined as never);
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects with field=apiKey when no API key is provided and no existing secret is on file", async () => {
    findMock.mockResolvedValue(null);

    const result = await saveConfiguredServiceConnection(USER_ID, {
      serviceType: "sonarr",
      baseUrl: "https://sonarr.test",
      apiKey: "",
    });

    expect(result).toEqual({
      ok: false,
      message: "Enter the API key for this service.",
      field: "apiKey",
    });
    expect(saveMock).not.toHaveBeenCalled();
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("encrypts and masks the supplied API key, persists the record, and emits an audit event", async () => {
    const result = await saveConfiguredServiceConnection(USER_ID, {
      serviceType: "sonarr",
      baseUrl: "https://sonarr.test",
      apiKey: "  sonarr-key  ",
    });

    expect(encryptMock).toHaveBeenCalledWith("sonarr-key");
    expect(maskMock).toHaveBeenCalledWith("sonarr-key");

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0]?.[0]).toMatchObject({
      userId: USER_ID,
      serviceType: "sonarr",
      baseUrl: "https://sonarr.test",
      status: "configured",
      statusMessage: "Configuration saved. Run verify to confirm connectivity.",
      secretUpdate: {
        encryptedValue: "enc(sonarr-key)",
        maskedValue: "mask(sonarr-key)",
      },
    });

    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock).toHaveBeenCalledWith({
      actorUserId: USER_ID,
      eventType: "service-connections.saved",
      subjectType: "service-connection",
      subjectId: "sonarr",
      payloadJson: JSON.stringify({
        serviceType: "sonarr",
        baseUrl: "https://sonarr.test",
      }),
    });

    const auditPayload = auditMock.mock.calls[0]?.[0]?.payloadJson ?? "";
    expect(auditPayload).not.toContain("sonarr-key");
    expect(auditPayload).not.toContain("enc(sonarr-key)");

    expect(result.ok).toBe(true);
  });

  it("preserves existing metadata when the base URL is unchanged and no new secret is supplied", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://sonarr.test" },
      secret: { encryptedValue: "old-enc", maskedValue: "old-mask" },
      metadata: { rootFolders: [{ path: "/tv", label: "TV" }] },
    } as never);

    await saveConfiguredServiceConnection(USER_ID, {
      serviceType: "sonarr",
      baseUrl: "https://sonarr.test",
      apiKey: "",
    });

    const args = saveMock.mock.calls[0]?.[0];
    expect(args?.metadata).toEqual({ rootFolders: [{ path: "/tv", label: "TV" }] });
    expect(args?.secretUpdate).toBeUndefined();
  });

  it("clears existing metadata when the base URL changes (forces re-verify)", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://old.sonarr.test" },
      secret: { encryptedValue: "old-enc", maskedValue: "old-mask" },
      metadata: { rootFolders: [{ path: "/tv", label: "TV" }] },
    } as never);

    await saveConfiguredServiceConnection(USER_ID, {
      serviceType: "sonarr",
      baseUrl: "https://new.sonarr.test",
      apiKey: "",
    });

    const args = saveMock.mock.calls[0]?.[0];
    expect(args?.metadata).toBeNull();
  });

  it("clears existing metadata when a fresh secret is supplied (defense-in-depth)", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://sonarr.test" },
      secret: { encryptedValue: "old-enc", maskedValue: "old-mask" },
      metadata: { rootFolders: [{ path: "/tv", label: "TV" }] },
    } as never);

    await saveConfiguredServiceConnection(USER_ID, {
      serviceType: "sonarr",
      baseUrl: "https://sonarr.test",
      apiKey: "rotated-key",
    });

    const args = saveMock.mock.calls[0]?.[0];
    expect(args?.metadata).toBeNull();
    expect(args?.secretUpdate).toEqual({
      encryptedValue: "enc(rotated-key)",
      maskedValue: "mask(rotated-key)",
    });
  });

  it("for ai-provider always overlays the new model on top of any preserved metadata", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://ai.test" },
      secret: { encryptedValue: "old-enc", maskedValue: "old-mask" },
      metadata: { aiProviderFlavor: "openai-compatible", model: "gpt-old" },
    } as never);

    await saveConfiguredServiceConnection(USER_ID, {
      serviceType: "ai-provider",
      baseUrl: "https://ai.test",
      apiKey: "",
      model: "gpt-new",
    });

    const args = saveMock.mock.calls[0]?.[0];
    expect(args?.metadata).toEqual({
      aiProviderFlavor: "openai-compatible",
      model: "gpt-new",
    });
  });

  it("for ai-provider with a base URL change drops preserved metadata but keeps the new model", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://old.ai.test" },
      secret: { encryptedValue: "old-enc", maskedValue: "old-mask" },
      metadata: { aiProviderFlavor: "openai-compatible", model: "gpt-old" },
    } as never);

    await saveConfiguredServiceConnection(USER_ID, {
      serviceType: "ai-provider",
      baseUrl: "https://new.ai.test",
      apiKey: "new-key",
      model: "gpt-new",
    });

    const args = saveMock.mock.calls[0]?.[0];
    expect(args?.metadata).toEqual({ model: "gpt-new" });
    expect(args?.metadata).not.toHaveProperty("aiProviderFlavor");
  });

  it("accepts a save when no new secret is supplied but an existing secret is on file", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://sonarr.test" },
      secret: { encryptedValue: "old-enc", maskedValue: "old-mask" },
      metadata: null,
    } as never);

    const result = await saveConfiguredServiceConnection(USER_ID, {
      serviceType: "sonarr",
      baseUrl: "https://sonarr.test",
      apiKey: "",
    });

    expect(result.ok).toBe(true);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0]?.[0]?.secretUpdate).toBeUndefined();
    expect(encryptMock).not.toHaveBeenCalled();
  });

  it("returns a service-named success message that does not leak the secret", async () => {
    const result = await saveConfiguredServiceConnection(USER_ID, {
      serviceType: "sonarr",
      baseUrl: "https://sonarr.test",
      apiKey: "super-secret-do-not-leak",
    });

    expect(result.ok).toBe(true);
    expect(result.message).toMatch(/saved\.$/);
    expect(JSON.stringify(result)).not.toContain("super-secret-do-not-leak");
  });
});
