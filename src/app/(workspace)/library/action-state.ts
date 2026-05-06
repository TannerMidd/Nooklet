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
