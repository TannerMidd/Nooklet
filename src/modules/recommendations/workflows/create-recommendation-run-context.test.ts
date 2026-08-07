import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
    decryptSecret: vi.fn((value: string) => `dec(${value})`),
}));
vi.mock("@/modules/media-library/queries/sample-library-taste", () => ({
    sampleLibraryTasteFromTitles: vi.fn(),
}));
vi.mock("@/modules/service-connections/ai-provider-endpoints", () => ({
    parseAiProviderFlavor: vi.fn(),
}));
vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
    findServiceConnectionByType: vi.fn(),
}));
vi.mock("@/modules/service-connections/workflows/verify-configured-service-connection", () => ({
    verifyConfiguredServiceConnection: vi.fn(),
}));

import { sampleLibraryTasteFromTitles } from "@/modules/media-library/queries/sample-library-taste";
import { parseAiProviderFlavor } from "@/modules/service-connections/ai-provider-endpoints";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { verifyConfiguredServiceConnection } from "@/modules/service-connections/workflows/verify-configured-service-connection";

import {
    ensureVerifiedAiProviderConnection,
    loadSampledLibraryTasteContext,
} from "./create-recommendation-run-context";

const findMock = vi.mocked(findServiceConnectionByType);
const verifyMock = vi.mocked(verifyConfiguredServiceConnection);
const sampleMock = vi.mocked(sampleLibraryTasteFromTitles);
const parseFlavorMock = vi.mocked(parseAiProviderFlavor);

const USER_ID = "user-1";

describe("loadSampledLibraryTasteContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns the native sampler result wrapped in an ok envelope", async () => {
        sampleMock.mockResolvedValue({
            totalCount: 12,
            sampledItems: [{ title: "Severance", year: 2022, genres: [] }],
            normalizedKeys: ["severance::2022"],
        });

        const result = await loadSampledLibraryTasteContext(USER_ID, "tv", [], 150);

        expect(sampleMock).toHaveBeenCalledWith(USER_ID, "tv", 150);
        expect(result).toEqual({
            ok: true,
            context: {
                totalCount: 12,
                sampledItems: [{ title: "Severance", year: 2022, genres: [] }],
                normalizedKeys: ["severance::2022"],
            },
        });
    });

    it("returns an empty context when the library has no titles for the media type", async () => {
        sampleMock.mockResolvedValue({ totalCount: 0, sampledItems: [], normalizedKeys: [] });

        const result = await loadSampledLibraryTasteContext(USER_ID, "movie", [], 150);

        expect(result).toEqual({
            ok: true,
            context: { totalCount: 0, sampledItems: [], normalizedKeys: [] },
        });
    });

    it("forwards the requested media type to the sampler", async () => {
        sampleMock.mockResolvedValue({ totalCount: 0, sampledItems: [], normalizedKeys: [] });

        await loadSampledLibraryTasteContext(USER_ID, "movie", [], 200);

        expect(sampleMock).toHaveBeenCalledWith(USER_ID, "movie", 200);
    });
});

describe("ensureVerifiedAiProviderConnection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        parseFlavorMock.mockReturnValue("openai-compatible");
    });

    it("fails when no AI provider is configured", async () => {
        findMock.mockResolvedValue(null);

        const result = await ensureVerifiedAiProviderConnection(USER_ID);

        expect(result).toEqual({
            ok: false,
            message: "Configure the AI provider connection before requesting recommendations.",
        });
        expect(verifyMock).not.toHaveBeenCalled();
    });

    it("returns the verified connection without re-verifying when it is already verified and has a known flavor", async () => {
        findMock.mockResolvedValue({
            connection: { baseUrl: "https://ai.test", status: "verified" },
            secret: { encryptedValue: "ai-enc" },
            metadata: { aiProviderFlavor: "openai-compatible" },
        } as never);
        parseFlavorMock.mockReturnValue("openai-compatible");

        const result = await ensureVerifiedAiProviderConnection(USER_ID);

        expect(verifyMock).not.toHaveBeenCalled();
        expect(result).toEqual({
            ok: true,
            baseUrl: "https://ai.test",
            encryptedSecret: "ai-enc",
            flavor: "openai-compatible",
        });
    });

    it("re-verifies legacy verified metadata that lacks the aiProviderFlavor seam", async () => {
        findMock
            .mockResolvedValueOnce({
                connection: { baseUrl: "https://ai.test", status: "verified" },
                secret: { encryptedValue: "ai-enc" },
                metadata: { availableModels: ["gpt-4"] },
            } as never)
            .mockResolvedValueOnce({
                connection: { baseUrl: "https://ai.test", status: "verified" },
                secret: { encryptedValue: "ai-enc" },
                metadata: { availableModels: ["gpt-4"], aiProviderFlavor: "openai-compatible" },
            } as never);
        parseFlavorMock.mockReturnValueOnce(null).mockReturnValue("openai-compatible");
        verifyMock.mockResolvedValue({ ok: true } as never);

        const result = await ensureVerifiedAiProviderConnection(USER_ID);

        expect(verifyMock).toHaveBeenCalledWith(USER_ID, "ai-provider");
        expect(result.ok).toBe(true);
    });
});
