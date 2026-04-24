export type LoginActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
};

export const initialLoginActionState: LoginActionState = {
  status: "idle",
};
