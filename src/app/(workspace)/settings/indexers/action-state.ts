export type IndexerActionState = {
    status: "idle" | "success" | "error";
    message: string | null;
};

export const initialIndexerActionState: IndexerActionState = {
    status: "idle",
    message: null,
};
