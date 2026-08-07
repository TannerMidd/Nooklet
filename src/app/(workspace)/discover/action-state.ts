export type DiscoverTitleRequestActionState = {
    status: "idle" | "error" | "warning" | "success";
    message?: string;
    outcome?:
        | "catalog_added"
        | "queued"
        | "partial_queue"
        | "no_match"
        | "search_failed"
        | "queue_failed";
};

export const initialDiscoverTitleRequestActionState: DiscoverTitleRequestActionState = {
    status: "idle",
};
