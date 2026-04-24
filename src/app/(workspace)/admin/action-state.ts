export type CreateManagedUserActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<
    Record<"displayName" | "email" | "role" | "password" | "confirmPassword", string>
  >;
};

export const initialCreateManagedUserActionState: CreateManagedUserActionState = {
  status: "idle",
};

export type ManagedUserMutationActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const initialManagedUserMutationActionState: ManagedUserMutationActionState = {
  status: "idle",
};

export type ResetManagedUserPasswordActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<"newPassword" | "confirmPassword", string>>;
};

export const initialResetManagedUserPasswordActionState: ResetManagedUserPasswordActionState = {
  status: "idle",
};
