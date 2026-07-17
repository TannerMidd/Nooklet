import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyUsenetServer } from "./verify-usenet-server";

const clientMocks = vi.hoisted(() => ({
  connect: vi.fn(),
  date: vi.fn(),
  quit: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock("@/modules/download-engine/nntp/nntp-client", () => ({
  NntpClient: vi.fn(function NntpClient() {
    return clientMocks;
  }),
}));

vi.mock("@/lib/security/safe-fetch", () => ({
  assertOutboundHostAllowed: vi.fn().mockResolvedValue([
    { address: "203.0.113.10", family: 4 },
  ]),
}));

beforeEach(() => {
  clientMocks.connect.mockReset().mockResolvedValue(undefined);
  clientMocks.date.mockReset().mockResolvedValue("20260717000000");
  clientMocks.quit.mockReset().mockResolvedValue(undefined);
  clientMocks.destroy.mockReset();
});

describe("verifyUsenetServer", () => {
  it("reports a successful TLS verification with pool metadata", async () => {
    const result = await verifyUsenetServer({
      serviceType: "usenet-server",
      baseUrl: "nntps://news.example.test:563?connections=10",
      secret: "reader::secret",
      metadata: null,
    });

    expect(result).toMatchObject({
      ok: true,
      message: expect.stringContaining("(TLS, 10 connections) and authenticated"),
      metadata: { host: "news.example.test", port: 563, tls: true, authenticated: true },
    });
    expect(clientMocks.connect).toHaveBeenCalledOnce();
    expect(clientMocks.date).toHaveBeenCalledOnce();
  });

  it("rejects a saved plaintext URL with the migration message without dialing", async () => {
    const result = await verifyUsenetServer({
      serviceType: "usenet-server",
      baseUrl: "nntp://news.example.test:119",
      secret: "",
      metadata: null,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Plaintext nntp:\/\/ is no longer supported/);
    expect(clientMocks.connect).not.toHaveBeenCalled();
  });

  it("surfaces dial failures as a safe verification error", async () => {
    clientMocks.connect.mockRejectedValue(new Error("Could not connect to news.example.test:563."));

    const result = await verifyUsenetServer({
      serviceType: "usenet-server",
      baseUrl: "nntps://news.example.test:563",
      secret: "",
      metadata: null,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Could not connect");
    expect(clientMocks.destroy).toHaveBeenCalled();
  });
});
