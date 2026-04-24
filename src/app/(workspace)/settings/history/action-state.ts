export type ManualWatchHistoryActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"mediaType" | "entriesText", string>>;
};

export const initialManualWatchHistoryActionState: ManualWatchHistoryActionState = {
  status: "idle",
};
