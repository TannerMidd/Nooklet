import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/save-arr-indexer", () => ({
  saveArrIndexerForUser: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/delete-arr-indexer", () => ({
  deleteArrIndexerForUser: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/test-arr-indexer", () => ({
  testArrIndexerForUser: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { deleteArrIndexerForUser } from "@/modules/service-connections/workflows/delete-arr-indexer";
import { saveArrIndexerForUser } from "@/modules/service-connections/workflows/save-arr-indexer";
import { testArrIndexerForUser } from "@/modules/service-connections/workflows/test-arr-indexer";

import { initialArrIndexerActionState } from "./arr-indexer-action-state";
import {
  submitDeleteArrIndexerAction,
  submitSaveArrIndexerAction,
  submitTestArrIndexerAction,
} from "./arr-indexer-actions";

const authMock = vi.mocked(auth);
const saveMock = vi.mocked(saveArrIndexerForUser);
const deleteMock = vi.mocked(deleteArrIndexerForUser);
const testMock = vi.mocked(testArrIndexerForUser);
const revalidateMock = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
});

function validSaveForm() {
  const data = new FormData();
  data.set("serviceType", "sonarr");
  data.set("name", "MyIndexer");
  data.set("implementation", "Newznab");
  data.set("implementationName", "Newznab");
  data.set("configContract", "NewznabSettings");
  data.set("protocol", "usenet");
  data.set("priority", "25");
  data.set("enableRss", "true");
  data.set("enableAutomaticSearch", "true");
  data.set("enableInteractiveSearch", "true");
  data.set("tags", JSON.stringify([1, 2]));
  data.set(
    "fields",
    JSON.stringify([
      { name: "baseUrl", value: "https://news.example" },
      { name: "apiKey", value: "secret" },
    ]),
  );
  data.set("returnTo", "/sonarr");
  return data;
}

describe("submitSaveArrIndexerAction", () => {
  it("rejects without a session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitSaveArrIndexerAction(initialArrIndexerActionState, validSaveForm());
    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("returns validation error when fields are missing", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const empty = new FormData();
    empty.set("returnTo", "/sonarr");
    const result = await submitSaveArrIndexerAction(initialArrIndexerActionState, empty);
    expect(result.status).toBe("error");
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("delegates to the workflow on success and revalidates", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    saveMock.mockResolvedValue({
      ok: true,
      message: "Added new indexer to Sonarr.",
      indexer: { id: 9 } as never,
    });

    const result = await submitSaveArrIndexerAction(initialArrIndexerActionState, validSaveForm());

    expect(saveMock).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({
        serviceType: "sonarr",
        name: "MyIndexer",
        tags: [1, 2],
        fields: [
          { name: "baseUrl", value: "https://news.example" },
          { name: "apiKey", value: "secret" },
        ],
      }),
    );
    expect(revalidateMock).toHaveBeenCalled();
    expect(result).toEqual({ status: "success", message: "Added new indexer to Sonarr." });
  });
});

describe("submitDeleteArrIndexerAction", () => {
  function validDeleteForm() {
    const data = new FormData();
    data.set("serviceType", "radarr");
    data.set("id", "9");
    data.set("returnTo", "/radarr");
    return data;
  }

  it("rejects without a session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitDeleteArrIndexerAction(
      initialArrIndexerActionState,
      validDeleteForm(),
    );
    expect(result.status).toBe("error");
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("delegates to the workflow on success", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    deleteMock.mockResolvedValue({ ok: true, message: "Removed indexer from Radarr." });

    const result = await submitDeleteArrIndexerAction(
      initialArrIndexerActionState,
      validDeleteForm(),
    );

    expect(deleteMock).toHaveBeenCalledWith("u1", { serviceType: "radarr", id: 9 });
    expect(revalidateMock).toHaveBeenCalled();
    expect(result).toEqual({ status: "success", message: "Removed indexer from Radarr." });
  });
});

describe("submitTestArrIndexerAction", () => {
  function validTestForm() {
    const data = validSaveForm();
    data.delete("returnTo");
    return data;
  }

  it("rejects without a session", async () => {
    authMock.mockResolvedValue(null as never);
    const result = await submitTestArrIndexerAction(
      initialArrIndexerActionState,
      validTestForm(),
    );
    expect(result.status).toBe("error");
    expect(testMock).not.toHaveBeenCalled();
  });

  it("returns success when upstream test succeeds", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    testMock.mockResolvedValue({ ok: true, value: { ok: true } });

    const result = await submitTestArrIndexerAction(
      initialArrIndexerActionState,
      validTestForm(),
    );

    expect(result).toEqual({ status: "success", message: "Indexer test succeeded." });
  });

  it("returns test-failed with failures when upstream rejects fields", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    testMock.mockResolvedValue({
      ok: true,
      value: { ok: false, failures: [{ field: "apiKey", message: "Required" }] },
    });

    const result = await submitTestArrIndexerAction(
      initialArrIndexerActionState,
      validTestForm(),
    );

    expect(result.status).toBe("test-failed");
    expect(result.testFailures).toEqual([{ field: "apiKey", message: "Required" }]);
  });

  it("returns error when adapter call fails", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    testMock.mockResolvedValue({ ok: false, message: "boom" });

    const result = await submitTestArrIndexerAction(
      initialArrIndexerActionState,
      validTestForm(),
    );

    expect(result).toEqual({ status: "error", message: "boom" });
  });
});
