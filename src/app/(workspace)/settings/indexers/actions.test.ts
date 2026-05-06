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

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { addIndexerCommand } from "@/modules/indexers/commands/add-indexer";

import { addIndexerAction } from "./actions";
import { initialIndexerActionState } from "./action-state";

const authMock = vi.mocked(auth);
const addIndexerMock = vi.mocked(addIndexerCommand);
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
