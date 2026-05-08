import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/modules/indexers/commands/add-indexer", () => ({
  addIndexerCommand: vi.fn(),
}));
vi.mock("@/modules/indexers/commands/update-indexer", () => ({
  updateIndexerCommand: vi.fn(),
}));
vi.mock("@/modules/indexers/workflows/test-indexer", () => ({
  TestIndexerWorkflowError: class TestIndexerWorkflowError extends Error {
    constructor(
      message: string,
      public readonly code: "not_found" | "missing_secret" | "missing_categories",
    ) {
      super(message);
      this.name = "TestIndexerWorkflowError";
    }
  },
  testIndexerWorkflow: vi.fn(),
}));

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { addIndexerCommand } from "@/modules/indexers/commands/add-indexer";
import { updateIndexerCommand } from "@/modules/indexers/commands/update-indexer";
import {
  testIndexerWorkflow,
  TestIndexerWorkflowError,
} from "@/modules/indexers/workflows/test-indexer";

import { addIndexerAction, testIndexerAction, updateIndexerAction } from "./actions";
import { initialIndexerActionState } from "./action-state";

const authMock = vi.mocked(auth);
const addIndexerMock = vi.mocked(addIndexerCommand);
const updateIndexerMock = vi.mocked(updateIndexerCommand);
const testIndexerMock = vi.mocked(testIndexerWorkflow);
const revalidateMock = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addIndexerAction", () => {
  function validForm() {
    const form = new FormData();
    form.set("name", "NZBGeek");
    form.set("protocol", "newznab");
    form.set("baseUrl", "https://api.example.test");
    form.set("apiPath", "/api");
    form.set("apiKey", "secret");
    form.set("priority", "5");
    form.set("movieCategories", "2000, 2040");
    form.set("tvCategories", "5000");
    form.set("isEnabled", "on");
    return form;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await addIndexerAction(initialIndexerActionState, validForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(addIndexerMock).not.toHaveBeenCalled();
  });

  it("requires at least one category", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    const form = validForm();
    form.set("movieCategories", "");
    form.set("tvCategories", "");

    const result = await addIndexerAction(initialIndexerActionState, form);

    expect(result).toEqual({ status: "error", message: "Add at least one movie or TV category." });
    expect(addIndexerMock).not.toHaveBeenCalled();
  });

  it("adds an indexer and revalidates settings", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    addIndexerMock.mockResolvedValue(undefined as never);

    const result = await addIndexerAction(initialIndexerActionState, validForm());

    expect(addIndexerMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      name: "NZBGeek",
      protocol: "newznab",
      baseUrl: "https://api.example.test",
      apiPath: "/api",
      apiKey: "secret",
      isEnabled: true,
      priority: 5,
      categories: [
        { mediaType: "movie", categoryId: "2000", label: "Movies" },
        { mediaType: "movie", categoryId: "2040", label: "Movies" },
        { mediaType: "tv", categoryId: "5000", label: "TV" },
      ],
    }));
    expect(revalidateMock).toHaveBeenCalledWith("/settings/indexers");
    expect(result).toEqual({ status: "success", message: "Indexer added." });
  });

  it("passes disabled state when the checkbox is unchecked", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    addIndexerMock.mockResolvedValue(undefined as never);
    const form = validForm();
    form.delete("isEnabled");

    await addIndexerAction(initialIndexerActionState, form);

    expect(addIndexerMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      isEnabled: false,
    }));
  });
});

describe("updateIndexerAction", () => {
  function validForm() {
    const form = new FormData();
    form.set("id", "idx1");
    form.set("name", "NZBGeek");
    form.set("protocol", "torznab");
    form.set("baseUrl", "https://api.example.test");
    form.set("apiPath", "/torznab");
    form.set("priority", "7");
    form.set("movieCategories", "2000");
    form.set("tvCategories", "5000, 5040");
    form.set("isEnabled", "on");
    return form;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await updateIndexerAction(initialIndexerActionState, validForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(updateIndexerMock).not.toHaveBeenCalled();
  });

  it("saves updates and omits blank API keys", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    updateIndexerMock.mockResolvedValue(undefined as never);
    const form = validForm();
    form.set("apiKey", "");

    const result = await updateIndexerAction(initialIndexerActionState, form);

    expect(updateIndexerMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      id: "idx1",
      name: "NZBGeek",
      protocol: "torznab",
      baseUrl: "https://api.example.test",
      apiPath: "/torznab",
      apiKey: undefined,
      isEnabled: true,
      priority: 7,
      categories: [
        { mediaType: "movie", categoryId: "2000", label: "Movies" },
        { mediaType: "tv", categoryId: "5000", label: "TV" },
        { mediaType: "tv", categoryId: "5040", label: "TV" },
      ],
    }));
    expect(revalidateMock).toHaveBeenCalledWith("/settings/indexers");
    expect(result).toEqual({ status: "success", message: "Indexer saved." });
  });

  it("passes replacement API keys", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    updateIndexerMock.mockResolvedValue(undefined as never);
    const form = validForm();
    form.set("apiKey", "new-secret");

    await updateIndexerAction(initialIndexerActionState, form);

    expect(updateIndexerMock).toHaveBeenCalledWith("u1", expect.objectContaining({
      apiKey: "new-secret",
    }));
  });
});

describe("testIndexerAction", () => {
  function validForm() {
    const form = new FormData();
    form.set("id", "idx1");
    return form;
  }

  it("returns sign-in error when there is no session", async () => {
    authMock.mockResolvedValue(null as never);

    const result = await testIndexerAction(initialIndexerActionState, validForm());

    expect(result).toEqual({ status: "error", message: "You need to sign in again." });
    expect(testIndexerMock).not.toHaveBeenCalled();
  });

  it("tests saved indexer settings and revalidates settings", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    testIndexerMock.mockResolvedValue({
      ok: true,
      message: "Indexer test succeeded with 0 results.",
      resultCount: 0,
      testedAt: new Date("2026-05-08T00:00:00.000Z"),
    });

    const result = await testIndexerAction(initialIndexerActionState, validForm());

    expect(testIndexerMock).toHaveBeenCalledWith("u1", { id: "idx1" });
    expect(revalidateMock).toHaveBeenCalledWith("/settings/indexers");
    expect(result).toEqual({ status: "success", message: "Indexer test succeeded with 0 results." });
  });

  it("returns failed test messages", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    testIndexerMock.mockResolvedValue({
      ok: false,
      message: "Indexer search failed with HTTP 401.",
      resultCount: 0,
      testedAt: new Date("2026-05-08T00:00:00.000Z"),
    });

    const result = await testIndexerAction(initialIndexerActionState, validForm());

    expect(result).toEqual({ status: "error", message: "Indexer search failed with HTTP 401." });
  });

  it("returns typed workflow errors without exposing unexpected errors", async () => {
    authMock.mockResolvedValue({ user: { id: "u1" } } as never);
    testIndexerMock.mockRejectedValueOnce(
      new TestIndexerWorkflowError("Save an API key before testing this indexer.", "missing_secret"),
    );

    const typedResult = await testIndexerAction(initialIndexerActionState, validForm());

    testIndexerMock.mockRejectedValueOnce(new Error("database exploded"));

    const unexpectedResult = await testIndexerAction(initialIndexerActionState, validForm());

    expect(typedResult).toEqual({ status: "error", message: "Save an API key before testing this indexer." });
    expect(unexpectedResult).toEqual({ status: "error", message: "Indexer test failed." });
  });
});
