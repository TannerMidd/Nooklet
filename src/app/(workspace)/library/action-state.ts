export type LibraryPathActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialLibraryPathActionState: LibraryPathActionState = {
  status: "idle",
  message: null,
};

export type ScanLibraryActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialScanLibraryActionState: ScanLibraryActionState = {
  status: "idle",
  message: null,
};

export type LibraryPathMutationActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialLibraryPathMutationActionState: LibraryPathMutationActionState = {
  status: "idle",
  message: null,
};

export type MediaTitlePreferenceActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialMediaTitlePreferenceActionState: MediaTitlePreferenceActionState = {
  status: "idle",
  message: null,
};

export type LibraryItemSearchActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  downloadRequestId: string | null;
};

export const initialLibraryItemSearchActionState: LibraryItemSearchActionState = {
  status: "idle",
  message: null,
  downloadRequestId: null,
};

export type RemoveMediaTitleActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialRemoveMediaTitleActionState: RemoveMediaTitleActionState = {
  status: "idle",
  message: null,
};

export type TvEpisodeMonitoringActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialTvEpisodeMonitoringActionState: TvEpisodeMonitoringActionState = {
  status: "idle",
  message: null,
};

export type LibraryMonitoringActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialLibraryMonitoringActionState: LibraryMonitoringActionState = {
  status: "idle",
  message: null,
};

export type LibraryScanScheduleActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors?: {
    intervalMinutes?: string;
  };
};

export const initialLibraryScanScheduleActionState: LibraryScanScheduleActionState = {
  status: "idle",
  message: null,
};
