export type DownloadActivityActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
};

export const initialDownloadActivityActionState: DownloadActivityActionState = {
  status: "idle",
  message: null,
};
