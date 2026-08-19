import { z } from "zod";

export const youtubeLibraryViews = ["search", "sources", "videos"] as const;

export type YouTubeLibraryView = (typeof youtubeLibraryViews)[number];

export type YouTubeLibrarySearchParamsInput = {
    view?: string | string[];
    q?: string | string[];
};

const youtubeLibrarySearchParamsSchema = z.object({
    view: z.enum(youtubeLibraryViews).catch("search"),
    q: z.string().trim().max(500).catch(""),
});

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}

export function parseYouTubeLibrarySearchParams(
    input: YouTubeLibrarySearchParamsInput | undefined,
) {
    return youtubeLibrarySearchParamsSchema.parse({
        view: firstValue(input?.view) ?? "search",
        q: firstValue(input?.q) ?? "",
    });
}

export function youtubeLibraryHref(view: YouTubeLibraryView, query?: string) {
    const params = new URLSearchParams({ view });

    if (query?.trim()) {
        params.set("q", query.trim());
    }

    return `/library/youtube?${params.toString()}`;
}
