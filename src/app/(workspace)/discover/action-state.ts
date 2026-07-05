export type DiscoverTitleRequestActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const initialDiscoverTitleRequestActionState: DiscoverTitleRequestActionState = {
  status: "idle",
};
