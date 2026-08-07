import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
    findEngineDownloadById: vi.fn(),
    requestEngineDownloadControl: vi.fn(),
}));

import {
    findEngineDownloadById,
    requestEngineDownloadControl,
} from "@/modules/download-engine/queue/engine-repository";

import { removeAndVerifyEngineItems } from "./verified-engine-removal";

const findMock = vi.mocked(findEngineDownloadById);
const controlMock = vi.mocked(requestEngineDownloadControl);

beforeEach(() => {
    vi.clearAllMocks();
    findMock.mockResolvedValue({ id: "engine-1", state: "queued" } as never);
    controlMock.mockResolvedValue({ id: "engine-1", controlIntent: "cancel" } as never);
});

describe("removeAndVerifyEngineItems", () => {
    it("persists cancellation and leaves cleanup pending for the isolated worker", async () => {
        const beforeExternalPhase = vi.fn().mockResolvedValue(undefined);

        const result = await removeAndVerifyEngineItems("user-1", ["engine-1"], {
            beforeExternalPhase,
        });

        expect(beforeExternalPhase).toHaveBeenCalledOnce();
        expect(controlMock).toHaveBeenCalledWith("user-1", "engine-1", "cancel");
        expect(result.get("engine-1")).toEqual({
            removed: false,
            externalRemoved: false,
            message: expect.stringContaining("isolated worker"),
        });
    });

    it("treats an absent row as verified removal", async () => {
        findMock.mockResolvedValue(null);

        const result = await removeAndVerifyEngineItems("user-1", ["engine-1"]);

        expect(controlMock).not.toHaveBeenCalled();
        expect(result.get("engine-1")).toEqual({
            removed: true,
            externalRemoved: true,
        });
    });

    it("reports a lost intent race as pending while the row still exists", async () => {
        controlMock.mockResolvedValue(null);

        const result = await removeAndVerifyEngineItems("user-1", ["engine-1"]);

        expect(findMock).toHaveBeenCalledTimes(2);
        expect(result.get("engine-1")).toMatchObject({
            removed: false,
            externalRemoved: false,
            message: expect.stringContaining("changed"),
        });
    });

    it("deduplicates repeated engine ids", async () => {
        await removeAndVerifyEngineItems("user-1", ["engine-1", "engine-1"]);

        expect(controlMock).toHaveBeenCalledOnce();
    });
});
