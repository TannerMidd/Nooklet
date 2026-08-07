"use server";

import { AuthError } from "next-auth";

import { type LoginActionState } from "@/app/(auth)/login/action-state";
import { signIn } from "@/auth";
import { loginInputSchema } from "@/modules/identity-access/schemas/login";
import { safeCallbackUrl } from "./safe-callback-url";

export async function submitLoginAction(
    _previousState: LoginActionState,
    formData: FormData,
): Promise<LoginActionState> {
    const parsedInput = loginInputSchema.safeParse({
        email: formData.get("email"),
        password: formData.get("password"),
    });
    const callbackUrl = safeCallbackUrl(formData.get("callbackUrl"));

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
            redirectTo: callbackUrl,
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
