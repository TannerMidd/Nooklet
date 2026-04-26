import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
  decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/service-connections/adapters/library-collections", () => ({
  deleteRadarrMovie: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
  findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
  createAuditEvent: vi.fn(),
}));

import { deleteRadarrMovie } from "@/modules/service-connections/adapters/library-collections";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { deleteRadarrMovieForUser } from "./delete-radarr-movie";

const findMock = vi.mocked(findServiceConnectionByType);
const deleteMock = vi.mocked(deleteRadarrMovie);
const auditMock = vi.mocked(createAuditEvent);

const USER_ID = "user-1";

function verifiedRadarrConnection() {
  return {
    connection: { id: "conn-radarr-1", baseUrl: "https://radarr.test", status: "verified" },
    secret: { encryptedValue: "radarr-enc" },
    metadata: null,
  } as never;
}

describe("deleteRadarrMovieForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auditMock.mockResolvedValue(undefined as never);
  });

  it("rejects when no Radarr connection is configured", async () => {
    findMock.mockResolvedValue(null);

    const result = await deleteRadarrMovieForUser(USER_ID, { movieId: 5, deleteFiles: false });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Configure Radarr/);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("rejects when the Radarr connection is not yet verified", async () => {
    findMock.mockResolvedValue({
      connection: { id: "c", baseUrl: "https://r.test", status: "configured" },
      secret: { encryptedValue: "x" },
      metadata: null,
    } as never);

    const result = await deleteRadarrMovieForUser(USER_ID, { movieId: 5, deleteFiles: false });

    expect(result.message).toMatch(/Verify Radarr/);
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("invokes the adapter with the decrypted key and forwards both id and deleteFiles", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    deleteMock.mockResolvedValue({ ok: true } as never);

    await deleteRadarrMovieForUser(USER_ID, { movieId: 42, deleteFiles: true });

    expect(deleteMock).toHaveBeenCalledWith({
      baseUrl: "https://radarr.test",
      apiKey: "dec(radarr-enc)",
      movieId: 42,
      deleteFiles: true,
    });
  });

  it("returns the deleted-with-files success message when deleteFiles=true", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    deleteMock.mockResolvedValue({ ok: true } as never);

    const result = await deleteRadarrMovieForUser(USER_ID, { movieId: 42, deleteFiles: true });

    expect(result).toEqual({
      ok: true,
      message: "Deleted movie and files from Radarr.",
    });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "service-connections.radarr.movie-delete.succeeded",
    }));
    const payload = JSON.parse(auditMock.mock.calls[0]?.[0]?.payloadJson ?? "{}");
    expect(payload).toEqual({ radarrMovieId: 42, deleteFiles: true });
  });

  it("returns the kept-on-disk success message when deleteFiles=false", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    deleteMock.mockResolvedValue({ ok: true } as never);

    const result = await deleteRadarrMovieForUser(USER_ID, { movieId: 42, deleteFiles: false });

    expect(result.message).toBe("Removed movie from Radarr; files were kept on disk.");
  });

  it("emits a failure audit event and surfaces the adapter message when delete fails", async () => {
    findMock.mockResolvedValue(verifiedRadarrConnection());
    deleteMock.mockResolvedValue({ ok: false, message: "movie not found" } as never);

    const result = await deleteRadarrMovieForUser(USER_ID, { movieId: 42, deleteFiles: true });

    expect(result).toEqual({
      ok: false,
      message: "Failed to delete from Radarr: movie not found",
    });
    expect(auditMock.mock.calls[0]?.[0]?.eventType).toBe(
      "service-connections.radarr.movie-delete.failed",
    );
    const payload = JSON.parse(auditMock.mock.calls[0]?.[0]?.payloadJson ?? "{}");
    expect(payload).toMatchObject({
      radarrMovieId: 42,
      deleteFiles: true,
      message: "movie not found",
    });
  });
});
