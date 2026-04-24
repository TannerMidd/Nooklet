export type BootstrapActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"displayName" | "email" | "password" | "confirmPassword", string>>;
};

export const initialBootstrapActionState: BootstrapActionState = {
  status: "idle",
};
