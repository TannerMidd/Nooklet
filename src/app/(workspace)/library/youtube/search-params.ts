import { z } from "zod";

export const youtubeLibraryViews = ["search", "sources", "videos"] as const;

export type YouTubeLibraryView = (typeof youtubeLibraryViews)[number];

export type YouTubeLibrarySearchParamsInput = {
    view?: string | string[];
    q?: string | string[];
    sourceId?: string | string[];
    page?: string | string[];
};

const youtubeLibrarySearchParamsSchema = z.object({
    view: z.enum(youtubeLibraryViews).catch("search"),
    q: z.string().trim().max(500).catch(""),
    sourceId: z.string().trim().max(200).catch(""),
    page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export function parseYouTubeLibrarySearchParams(
    input: YouTubeLibrarySearchParamsInput | undefined,
) {
    const parsed = youtubeLibrarySearchParamsSchema.parse({
        view: firstValue(input?.view) ?? "search",
        q: firstValue(input?.q) ?? "",
        sourceId: firstValue(input?.sourceId) ?? "",
        page: firstValue(input?.page) ?? "1",
    });

    return {
        view: parsed.view,
        q: parsed.q,
        ...(parsed.sourceId ? { sourceId: parsed.sourceId } : {}),
        ...(parsed.page > 1 ? { page: parsed.page } : {}),
    };
}

export function youtubeLibraryHref(
    view: YouTubeLibraryView,
    query?: string,
    options: { sourceId?: string; page?: number } = {},
) {
    const params = new URLSearchParams({ view });

    if (query?.trim()) {
        params.set("q", query.trim());
    }

    if (options.sourceId?.trim()) {
        params.set("sourceId", options.sourceId.trim());
    }

    if (options.page && Number.isInteger(options.page) && options.page > 1) {
        params.set("page", String(options.page));
    }

    return `/library/youtube?${params.toString()}`;
}
