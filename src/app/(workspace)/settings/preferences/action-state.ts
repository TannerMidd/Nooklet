export type UpdatePreferencesActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<
    Record<"defaultMediaMode" | "defaultResultCount" | "defaultTemperature" | "watchHistorySourceTypes", string>
  >;
};

export const initialUpdatePreferencesActionState: UpdatePreferencesActionState = {
  status: "idle",
};
