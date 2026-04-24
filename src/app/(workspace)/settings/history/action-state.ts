export type ManualWatchHistoryActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"mediaType" | "entriesText", string>>;
};

export type TautulliWatchHistoryActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"mediaType" | "tautulliUserId" | "importLimit", string>>;
};

export const initialManualWatchHistoryActionState: ManualWatchHistoryActionState = {
  status: "idle",
};

export const initialTautulliWatchHistoryActionState: TautulliWatchHistoryActionState = {
  status: "idle",
};
