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

export type PlexWatchHistoryActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"mediaType" | "plexUserId" | "importLimit", string>>;
};

export type TraktWatchHistoryActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"mediaType" | "importLimit", string>>;
};

export type WatchHistoryScheduleActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"sourceType" | "intervalHours", string>>;
};

export const initialManualWatchHistoryActionState: ManualWatchHistoryActionState = {
  status: "idle",
};

export const initialTautulliWatchHistoryActionState: TautulliWatchHistoryActionState = {
  status: "idle",
};

export const initialPlexWatchHistoryActionState: PlexWatchHistoryActionState = {
  status: "idle",
};

export const initialTraktWatchHistoryActionState: TraktWatchHistoryActionState = {
  status: "idle",
};

export const initialWatchHistoryScheduleActionState: WatchHistoryScheduleActionState = {
  status: "idle",
};
