"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { loginInputSchema } from "@/modules/identity-access/schemas/login";

export type LoginActionState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
};

export const initialLoginActionState: LoginActionState = {
  status: "idle",
};

export async function submitLoginAction(
  _previousState: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsedInput = loginInputSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsedInput.success) {
    const flattenedErrors = parsedInput.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the highlighted fields and try again.",
      fieldErrors: {
        email: flattenedErrors.email?.[0],
        password: flattenedErrors.password?.[0],
      },
    };
  }

  try {
    await signIn("credentials", {
      email: parsedInput.data.email,
      password: parsedInput.data.password,
      redirectTo: "/tv",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        status: "error",
        message: "Invalid email or password.",
      };
    }

    throw error;
  }

  return {
    status: "error",
    message: "Unable to sign in.",
  };
}
