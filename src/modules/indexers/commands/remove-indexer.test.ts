import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/indexers/repositories/indexer-repository", () => ({
    deleteIndexer: vi.fn(),
    findIndexerById: vi.fn(),
}));
vi.mock("@/modules/users/repositories/user-repository", () => ({
    createAuditEvent: vi.fn(),
}));

import { deleteIndexer, findIndexerById } from "@/modules/indexers/repositories/indexer-repository";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

import { removeIndexerCommand, RemoveIndexerCommandError } from "./remove-indexer";

const deleteMock = vi.mocked(deleteIndexer);
const findMock = vi.mocked(findIndexerById);
const auditMock = vi.mocked(createAuditEvent);

describe("removeIndexerCommand", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("removes an owned indexer and records a secret-free audit event", async () => {
        findMock.mockResolvedValue({ id: "indexer-1", userId: "user-1", name: "NZBGeek" } as never);
        deleteMock.mockReturnValue(true);

        await expect(removeIndexerCommand("user-1", "indexer-1")).resolves.toEqual({
            ok: true,
            name: "NZBGeek",
        });
        expect(deleteMock).toHaveBeenCalledWith("user-1", "indexer-1");
        expect(auditMock).toHaveBeenCalledWith(
            expect.objectContaining({
                eventType: "indexer.removed",
                payload: { name: "NZBGeek" },
            }),
        );
    });

    it("does not remove a shared indexer that the caller does not own", async () => {
        findMock.mockResolvedValue({
            id: "indexer-1",
            userId: "admin-1",
            name: "NZBGeek",
        } as never);

        await expect(removeIndexerCommand("user-1", "indexer-1")).rejects.toBeInstanceOf(
            RemoveIndexerCommandError,
        );
        expect(deleteMock).not.toHaveBeenCalled();
    });
});
