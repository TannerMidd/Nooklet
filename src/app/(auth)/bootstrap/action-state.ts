export type BootstrapActionState = {
    status: "idle" | "error";
    message?: string;
    fieldErrors?: Partial<
        Record<"bootstrapToken" | "displayName" | "email" | "password" | "confirmPassword", string>
    >;
};

export const initialBootstrapActionState: BootstrapActionState = {
    status: "idle",
};
