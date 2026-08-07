import { z } from "zod";

export type LibraryBrowseSearchParamsInput = Record<string, string | string[] | undefined>;

function firstSearchParamValue(value: unknown) {
    return Array.isArray(value) ? value[0] : value;
}

function optionalSearchParamValue(value: unknown) {
    const normalized = firstSearchParamValue(value);

    return normalized === "" || normalized === "all" ? undefined : normalized;
}

const libraryBrowseSearchParamsSchema = z.object({
    q: z
        .preprocess((value) => {
            const normalized = firstSearchParamValue(value);

            return normalized === "" ? undefined : normalized;
        }, z.string().trim().max(120).optional())
        .catch(undefined),
    page: z.preprocess(firstSearchParamValue, z.coerce.number().int().min(1).catch(1)),
    details: z.preprocess(optionalSearchParamValue, z.string().uuid().optional()).catch(undefined),
    status: z
        .preprocess(
            optionalSearchParamValue,
            z.enum(["available", "requested", "missing"]).optional(),
        )
        .catch(undefined),
    monitored: z
        .preprocess(optionalSearchParamValue, z.enum(["yes", "no"]).optional())
        .catch(undefined),
    library: z
        .preprocess(
            optionalSearchParamValue,
            z.union([z.string().uuid(), z.literal("unassigned")]).optional(),
        )
        .catch(undefined),
    sort: z.preprocess(
        optionalSearchParamValue,
        z.enum(["title", "recent", "year", "status"]).catch("title"),
    ),
    view: z.preprocess(optionalSearchParamValue, z.enum(["list", "grid"]).catch("list")),
});

export function parseLibraryBrowseSearchParams(input: LibraryBrowseSearchParamsInput = {}) {
    return libraryBrowseSearchParamsSchema.parse(input);
}
