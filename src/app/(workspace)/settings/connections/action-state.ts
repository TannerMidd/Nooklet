export type ConnectionActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"baseUrl" | "apiKey" | "model", string>>;
};

export const initialConnectionActionState: ConnectionActionState = {
  status: "idle",
};
