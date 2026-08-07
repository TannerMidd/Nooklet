import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
    checkpointDownloadRequestCancellationForTitleRetirement: vi.fn(),
    listDownloadRequestsBlockingTitleRemoval: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
    listCancellableSeasonFulfillmentsForTitle: vi.fn(),
}));
vi.mock("@/modules/downloads/queries/has-active-download-association", () => ({
    hasActiveDownloadAssociationForTitle: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/cancel-season-fulfillment", async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import("@/modules/downloads/workflows/cancel-season-fulfillment")
        >();

    return { ...actual, cancelSeasonFulfillmentWorkflow: vi.fn() };
});
vi.mock("@/modules/media-library/commands/remove-media-title", async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import("@/modules/media-library/commands/remove-media-title")
        >();

    return { ...actual, removeMediaTitleCommand: vi.fn() };
});
vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
    findMediaTitleByIdForUser: vi.fn(),
}));

import {
    checkpointDownloadRequestCancellationForTitleRetirement,
    listDownloadRequestsBlockingTitleRemoval,
} from "@/modules/downloads/repositories/download-repository";
import { listCancellableSeasonFulfillmentsForTitle } from "@/modules/downloads/repositories/season-fulfillment-repository";
import { hasActiveDownloadAssociationForTitle } from "@/modules/downloads/queries/has-active-download-association";
import {
    cancelSeasonFulfillmentWorkflow,
    CancelSeasonFulfillmentWorkflowError,
} from "@/modules/downloads/workflows/cancel-season-fulfillment";
import {
    removeMediaTitleCommand,
    RemoveMediaTitleCommandError,
} from "@/modules/media-library/commands/remove-media-title";
import { findMediaTitleByIdForUser } from "@/modules/media-library/repositories/media-library-repository";

import { retireMediaTitlePreservingFilesWorkflow } from "./retire-media-title-preserving-files";

const checkpointRequestMock = vi.mocked(checkpointDownloadRequestCancellationForTitleRetirement);
const listRequestsMock = vi.mocked(listDownloadRequestsBlockingTitleRemoval);
const listFulfillmentsMock = vi.mocked(listCancellableSeasonFulfillmentsForTitle);
const hasActiveMock = vi.mocked(hasActiveDownloadAssociationForTitle);
const cancelFulfillmentMock = vi.mocked(cancelSeasonFulfillmentWorkflow);
const removeTitleMock = vi.mocked(removeMediaTitleCommand);
const findTitleMock = vi.mocked(findMediaTitleByIdForUser);

const title = {
    id: "33333333-3333-4333-8333-333333333333",
    userId: "user-1",
    libraryId: null,
    mediaType: "tv",
    title: "Duplicate Show",
    sortTitle: "duplicate show",
    normalizedKey: "duplicate-show::2020",
    year: 2020,
};

beforeEach(() => {
    vi.clearAllMocks();
    findTitleMock.mockResolvedValue(title as never);
    listFulfillmentsMock.mockResolvedValue([]);
    listRequestsMock.mockResolvedValue([]);
    hasActiveMock.mockResolvedValue(false);
    removeTitleMock.mockResolvedValue(title as never);
});

describe("retireMediaTitlePreservingFilesWorkflow", () => {
    it("checkpoints plan and standalone request cancellations before deferring removal", async () => {
        listFulfillmentsMock.mockResolvedValue([
            { id: "fulfillment-1", cancellationRequestedAt: null },
            { id: "fulfillment-already-pending", cancellationRequestedAt: new Date() },
        ] as never);
        listRequestsMock.mockResolvedValue([
            { id: "request-1", cancellationRequestedAt: null },
        ] as never);
        cancelFulfillmentMock.mockResolvedValue({
            cancelled: false,
            cancellationPending: true,
            message: "Cancellation started.",
        });
        checkpointRequestMock.mockResolvedValue({
            id: "request-1",
            cancellationRequestedAt: new Date(),
        } as never);
        hasActiveMock.mockResolvedValue(true);

        const result = await retireMediaTitlePreservingFilesWorkflow("user-1", title.id);

        expect(cancelFulfillmentMock).toHaveBeenCalledTimes(1);
        expect(cancelFulfillmentMock).toHaveBeenCalledWith("user-1", "fulfillment-1");
        expect(checkpointRequestMock).toHaveBeenCalledWith({
            userId: "user-1",
            requestId: "request-1",
            mediaTitleId: title.id,
        });
        expect(removeTitleMock).not.toHaveBeenCalled();
        expect(result).toEqual({
            status: "pending",
            removedTitle: null,
            cancellationCheckpointCount: 2,
        });
    });

    it("removes only the title record after every active association clears", async () => {
        const result = await retireMediaTitlePreservingFilesWorkflow("user-1", title.id);

        expect(removeTitleMock).toHaveBeenCalledWith("user-1", { titleId: title.id });
        expect(result).toEqual({
            status: "removed",
            removedTitle: title,
            cancellationCheckpointCount: 0,
        });
    });

    it("is idempotent when another worker pass already removed the title", async () => {
        findTitleMock.mockResolvedValue(null);

        await expect(retireMediaTitlePreservingFilesWorkflow("user-1", title.id)).resolves.toEqual({
            status: "removed",
            removedTitle: null,
            cancellationCheckpointCount: 0,
        });

        expect(listFulfillmentsMock).not.toHaveBeenCalled();
        expect(removeTitleMock).not.toHaveBeenCalled();
    });

    it("keeps the durable removal pending across cancellation and deletion races", async () => {
        listFulfillmentsMock.mockResolvedValue([
            { id: "fulfillment-busy", cancellationRequestedAt: null },
        ] as never);
        cancelFulfillmentMock.mockRejectedValue(
            new CancelSeasonFulfillmentWorkflowError(
                "fulfillment_busy",
                "Season recovery is updating this plan.",
            ),
        );
        removeTitleMock.mockRejectedValue(
            new RemoveMediaTitleCommandError("A new download appeared.", "active_download"),
        );

        const result = await retireMediaTitlePreservingFilesWorkflow("user-1", title.id);

        expect(result.status).toBe("pending");
        expect(result.removedTitle).toBeNull();
    });

    it("continues removal when an active plan completes before cancellation is checkpointed", async () => {
        listFulfillmentsMock.mockResolvedValue([
            { id: "fulfillment-completed", cancellationRequestedAt: null },
        ] as never);
        cancelFulfillmentMock.mockRejectedValue(
            new CancelSeasonFulfillmentWorkflowError(
                "fulfillment_not_cancellable",
                "That season recovery plan is already complete.",
            ),
        );
        hasActiveMock.mockResolvedValue(false);

        const result = await retireMediaTitlePreservingFilesWorkflow("user-1", title.id);

        expect(removeTitleMock).toHaveBeenCalledWith("user-1", { titleId: title.id });
        expect(result).toEqual({
            status: "removed",
            removedTitle: title,
            cancellationCheckpointCount: 0,
        });
    });
});
