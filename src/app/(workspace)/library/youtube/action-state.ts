export type YouTubeActionState = {
    status: "idle" | "success" | "error";
    message: string | null;
    fieldErrors?: Partial<
        Record<
            | "query"
            | "url"
            | "sourceId"
            | "videoId"
            | "videoIds"
            | "libraryPathId"
            | "qualityProfile"
            | "intervalMinutes",
            string
        >
    >;
};

export const initialYouTubeActionState: YouTubeActionState = {
    status: "idle",
    message: null,
};
