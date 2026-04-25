"use server";

import { redirect } from "next/navigation";

import { type BootstrapActionState } from "@/app/(auth)/bootstrap/action-state";
import { consumeRateLimit, formatRetryAfter } from "@/lib/security/rate-limit";
import { bootstrapInputSchema } from "@/modules/identity-access/schemas/bootstrap";
import { createFirstAdmin } from "@/modules/identity-access/workflows/create-first-admin";

export async function submitBootstrapAction(
  _previousState: BootstrapActionState,
  formData: FormData,
): Promise<BootstrapActionState> {
  const rateLimit = consumeRateLimit({
    key: "bootstrap:global",
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });

  if (!rateLimit.ok) {
    return {
      status: "error",
      message: `Too many bootstrap attempts. Try again in ${formatRetryAfter(rateLimit.retryAfterMs)}.`,
    };
  }

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
