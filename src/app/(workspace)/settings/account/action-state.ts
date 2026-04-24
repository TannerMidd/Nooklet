export type ChangePasswordActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<
    Record<"currentPassword" | "newPassword" | "confirmPassword", string>
  >;
};

export const initialChangePasswordActionState: ChangePasswordActionState = {
  status: "idle",
};
