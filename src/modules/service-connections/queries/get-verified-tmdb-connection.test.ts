import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));

import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

import { getVerifiedTmdbConnection } from "./get-verified-tmdb-connection";

const findMock = vi.mocked(findServiceConnectionByType);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getVerifiedTmdbConnection", () => {
  it("returns a decrypted TMDB connection when the saved connection is verified", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://api.tmdb.test", status: "verified" },
      secret: { encryptedValue: "tmdb-enc" },
      metadata: { tmdbImageBaseUrl: "https://image.tmdb.test/t/p/" },
    } as never);

    await expect(getVerifiedTmdbConnection("u1")).resolves.toEqual({
      baseUrl: "https://api.tmdb.test",
      secret: "dec(tmdb-enc)",
      metadata: { tmdbImageBaseUrl: "https://image.tmdb.test/t/p/" },
    });
  });

  it("returns null when the connection is not verified", async () => {
    findMock.mockResolvedValue({
      connection: { baseUrl: "https://api.tmdb.test", status: "configured" },
      secret: { encryptedValue: "tmdb-enc" },
      metadata: null,
    } as never);

    await expect(getVerifiedTmdbConnection("u1")).resolves.toBeNull();
  });

  it("returns null when no connection is saved", async () => {
    findMock.mockResolvedValue(null as never);

    await expect(getVerifiedTmdbConnection("u1")).resolves.toBeNull();
  });
});
