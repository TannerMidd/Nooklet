import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/library-collections", () => ({
  triggerRadarrMovieSearch: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { triggerRadarrMovieSearch } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { triggerRadarrMovieSearchForUser } from "./trigger-radarr-movie-search";

const findMock = vi.mocked(findServiceConnectionByType);
const searchMock = vi.mocked(triggerRadarrMovieSearch);
const auditMock = vi.mocked(createAuditEvent);

function verifiedRadarrConnection() {
  return {
    connection: { id: "conn-radarr", baseUrl: "https://radarr.test", status: "verified" },
    secret: { encryptedValue: "radarr-enc" },
    metadata: null,
  } as never;
}

describe("triggerRadarrMovieSearchForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("forwards the decrypted connection and movie id to the adapter", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    searchMock.mockResolvedValue({ ok: true } as never);

    const result = await triggerRadarrMovieSearchForUser("user-1", { movieId: 7 });

    expect(searchMock).toHaveBeenCalledWith({
      baseUrl: "https://radarr.test",
      apiKey: "dec(radarr-enc)",
      movieId: 7,
    });
    expect(result).toEqual({
      ok: true,
      message: "Triggered Radarr search for this movie.",
    });
  });

  it("audits and surfaces adapter failures", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    searchMock.mockResolvedValue({ ok: false, message: "Command queue rejected it" } as never);

    const result = await triggerRadarrMovieSearchForUser("user-1", { movieId: 7 });

    expect(result).toEqual({
      ok: false,
      message: "Failed to trigger Radarr search: Command queue rejected it",
    });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.radarr.movie-search.failed",
    );
  });
});