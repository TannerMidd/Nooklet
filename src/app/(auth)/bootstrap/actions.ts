"use server";

import { redirect } from "next/navigation";

import { bootstrapInputSchema } from "@/modules/identity-access/schemas/bootstrap";
import { createFirstAdmin } from "@/modules/identity-access/workflows/create-first-admin";

export type BootstrapActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"displayName" | "email" | "password" | "confirmPassword", string>>;
};

export const initialBootstrapActionState: BootstrapActionState = {
  status: "idle",
};

export async function submitBootstrapAction(
  _previousState: BootstrapActionState,
  formData: FormData,
): Promise<BootstrapActionState> {
  const parsedInput = bootstrapInputSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsedInput.success) {
    const flattenedErrors = parsedInput.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the highlighted fields and try again.",
      fieldErrors: {
        displayName: flattenedErrors.displayName?.[0],
        email: flattenedErrors.email?.[0],
        password: flattenedErrors.password?.[0],
        confirmPassword: flattenedErrors.confirmPassword?.[0],
      },
    };
  }

  const result = await createFirstAdmin(parsedInput.data);

  if (!result.ok) {
    return {
      status: "error",
      message: result.message,
      fieldErrors: result.field
        ? {
            [result.field]: result.message,
          }
        : undefined,
    };
  }

  redirect("/login?bootstrapped=1");
}
