import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
    findDownloadFulfillmentById: vi.fn(),
    listDownloadFulfillmentEpisodes: vi.fn(),
}));

vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
    findTvEpisodeByIdForUser: vi.fn(),
}));

import {
    findDownloadFulfillmentById,
    listDownloadFulfillmentEpisodes,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import { findTvEpisodeByIdForUser } from "@/modules/media-library/repositories/media-library-repository";

import { QueueIndexerResultWorkflowError } from "./errors";
import { validateQueueIndexerResultFulfillmentContext } from "./fulfillment-context-validation";

const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const listEpisodeStatesMock = vi.mocked(listDownloadFulfillmentEpisodes);
const findEpisodeMock = vi.mocked(findTvEpisodeByIdForUser);

const titleId = "title-1";
const seasonId = "season-1";
const episodeId = "episode-1";

const seasonRequest = {
    resultId: "result-1",
    mediaTitleId: titleId,
    seasonId,
};

function workLease(fulfillmentId: string) {
    return {
        id: `lease-${fulfillmentId}`,
        userId: "user-1",
        requestKey: `season-fulfillment:${fulfillmentId}:work`,
        expiresAt: new Date("2026-07-16T18:15:00.000Z"),
    };
}

function fulfillment(strategy: "season_pack" | "episodes" = "season_pack") {
    return {
        id: "fulfillment-1",
        userId: "user-1",
        mediaTitleId: titleId,
        seasonId,
        strategy,
        status: "active",
    };
}

async function expectInvalid(
    request: Parameters<typeof validateQueueIndexerResultFulfillmentContext>[1],
    context: Parameters<typeof validateQueueIndexerResultFulfillmentContext>[2],
) {
    const leasedContext =
        context && typeof context.fulfillmentId === "string"
            ? { ...context, workLease: context.workLease ?? workLease(context.fulfillmentId) }
            : context;
    const error = await validateQueueIndexerResultFulfillmentContext(
        "user-1",
        request,
        leasedContext,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(QueueIndexerResultWorkflowError);
    expect((error as QueueIndexerResultWorkflowError).code).toBe("invalid_fulfillment_context");
}

beforeEach(() => {
    vi.clearAllMocks();
    listEpisodeStatesMock.mockResolvedValue([]);
});

describe("validateQueueIndexerResultFulfillmentContext", () => {
    it("accepts an absent context without touching fulfillment persistence", async () => {
        await expect(
            validateQueueIndexerResultFulfillmentContext("user-1", seasonRequest, {
                fulfillmentId: null,
                attemptStrategy: null,
                attemptNumber: null,
            }),
        ).resolves.toEqual({});

        expect(findFulfillmentMock).not.toHaveBeenCalled();
        expect(findEpisodeMock).not.toHaveBeenCalled();
    });

    it.each([
        [{ fulfillmentId: "fulfillment-1", attemptStrategy: null, attemptNumber: 1 }],
        [{ fulfillmentId: "fulfillment-1", attemptStrategy: "season_pack", attemptNumber: 0 }],
        [{ fulfillmentId: "fulfillment-1", attemptStrategy: "season_pack", attemptNumber: 1.5 }],
        [{ fulfillmentId: null, attemptStrategy: "season_pack", attemptNumber: 1 }],
    ])("rejects partial or non-positive attempt metadata %#", async (context) => {
        await expectInvalid(seasonRequest, context as never);
        expect(findFulfillmentMock).not.toHaveBeenCalled();
    });

    it("rejects a fulfillment that is missing or belongs to another user", async () => {
        findFulfillmentMock.mockResolvedValue(null);

        await expectInvalid(seasonRequest, {
            fulfillmentId: "foreign-fulfillment",
            attemptStrategy: "season_pack",
            attemptNumber: 1,
        });

        expect(findFulfillmentMock).toHaveBeenCalledWith("user-1", "foreign-fulfillment");
    });

    it.each([
        [{ ...seasonRequest, mediaTitleId: "title-2" }, fulfillment("season_pack")],
        [{ ...seasonRequest, seasonId: "season-2" }, fulfillment("season_pack")],
        [{ ...seasonRequest, episodeId }, fulfillment("season_pack")],
        [seasonRequest, fulfillment("episodes")],
    ])(
        "rejects a season-pack context that is not the plan's exact target %#",
        async (request, storedFulfillment) => {
            findFulfillmentMock.mockResolvedValue(storedFulfillment as never);

            await expectInvalid(request, {
                fulfillmentId: "fulfillment-1",
                attemptStrategy: "season_pack",
                attemptNumber: 1,
            });
        },
    );

    it("accepts an exact season-pack context", async () => {
        findFulfillmentMock.mockResolvedValue(fulfillment("season_pack") as never);

        await expect(
            validateQueueIndexerResultFulfillmentContext("user-1", seasonRequest, {
                fulfillmentId: "fulfillment-1",
                attemptStrategy: "season_pack",
                attemptNumber: 2,
                workLease: workLease("fulfillment-1"),
            }),
        ).resolves.toEqual({
            fulfillmentId: "fulfillment-1",
            attemptStrategy: "season_pack",
            attemptNumber: 2,
        });

        expect(findEpisodeMock).not.toHaveBeenCalled();
    });

    it("rejects a terminal season plan", async () => {
        findFulfillmentMock.mockResolvedValue({
            ...fulfillment("season_pack"),
            status: "cancelled",
        } as never);

        await expectInvalid(seasonRequest, {
            fulfillmentId: "fulfillment-1",
            attemptStrategy: "season_pack",
            attemptNumber: 2,
        });
    });

    it("rejects a season plan with a durable cancellation request", async () => {
        findFulfillmentMock.mockResolvedValue({
            ...fulfillment("season_pack"),
            cancellationRequestedAt: new Date("2026-07-16T18:00:00.000Z"),
        } as never);

        await expectInvalid(seasonRequest, {
            fulfillmentId: "fulfillment-1",
            attemptStrategy: "season_pack",
            attemptNumber: 2,
        });
    });

    it.each([
        [null],
        [{ title: { id: titleId }, episode: { id: episodeId, seasonId: "season-2" } }],
        [{ title: { id: "title-2" }, episode: { id: episodeId, seasonId } }],
    ])("rejects an episode outside the fulfillment target %#", async (episode) => {
        findFulfillmentMock.mockResolvedValue(fulfillment("episodes") as never);
        findEpisodeMock.mockResolvedValue(episode as never);

        await expectInvalid(
            { ...seasonRequest, episodeId },
            {
                fulfillmentId: "fulfillment-1",
                attemptStrategy: "episode",
                attemptNumber: 1,
            },
        );

        expect(findEpisodeMock).toHaveBeenCalledWith("user-1", episodeId);
    });

    it("rejects episode strategy until the fulfillment has switched to episode fallback", async () => {
        findFulfillmentMock.mockResolvedValue(fulfillment("season_pack") as never);

        await expectInvalid(
            { ...seasonRequest, episodeId },
            {
                fulfillmentId: "fulfillment-1",
                attemptStrategy: "episode",
                attemptNumber: 1,
            },
        );

        expect(findEpisodeMock).not.toHaveBeenCalled();
    });

    it("accepts only an owned episode in the fulfillment's exact season", async () => {
        findFulfillmentMock.mockResolvedValue(fulfillment("episodes") as never);
        findEpisodeMock.mockResolvedValue({
            title: { id: titleId },
            episode: { id: episodeId, seasonId, hasFile: false },
        } as never);

        await expect(
            validateQueueIndexerResultFulfillmentContext(
                "user-1",
                { ...seasonRequest, episodeId },
                {
                    fulfillmentId: "fulfillment-1",
                    attemptStrategy: "episode",
                    attemptNumber: 3,
                    workLease: workLease("fulfillment-1"),
                },
            ),
        ).resolves.toEqual({
            fulfillmentId: "fulfillment-1",
            attemptStrategy: "episode",
            attemptNumber: 3,
        });
    });

    it("rejects an episode that was imported while its search was in flight", async () => {
        findFulfillmentMock.mockResolvedValue(fulfillment("episodes") as never);
        findEpisodeMock.mockResolvedValue({
            title: { id: titleId },
            episode: { id: episodeId, seasonId, hasFile: true },
        } as never);

        await expectInvalid(
            { ...seasonRequest, episodeId },
            {
                fulfillmentId: "fulfillment-1",
                attemptStrategy: "episode",
                attemptNumber: 3,
            },
        );
    });
});
