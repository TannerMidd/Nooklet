"use server";

import { headers } from "next/headers";

import { type BootstrapActionState } from "@/app/(auth)/bootstrap/action-state";
import { signIn } from "@/auth";
import { consumeBootstrapRateLimit } from "@/lib/security/bootstrap-rate-limit";
import { verifyBootstrapToken } from "@/lib/security/bootstrap-token";
import { formatRetryAfter } from "@/lib/security/rate-limit";
import { trustedClientAddressFromHeaders } from "@/lib/security/rate-limit-key";
import { bootstrapInputSchema } from "@/modules/identity-access/schemas/bootstrap";
import { createFirstAdmin } from "@/modules/identity-access/workflows/create-first-admin";

export async function submitBootstrapAction(
  _previousState: BootstrapActionState,
  formData: FormData,
): Promise<BootstrapActionState> {
  const parsedInput = bootstrapInputSchema.safeParse({
    bootstrapToken: formData.get("bootstrapToken"),
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
        bootstrapToken: flattenedErrors.bootstrapToken?.[0],
        displayName: flattenedErrors.displayName?.[0],
        email: flattenedErrors.email?.[0],
        password: flattenedErrors.password?.[0],
        confirmPassword: flattenedErrors.confirmPassword?.[0],
      },
    };
  }

  const requestHeaders = await headers();
  const rateLimit = consumeBootstrapRateLimit(
    parsedInput.data.bootstrapToken,
    trustedClientAddressFromHeaders(requestHeaders),
  );

  if (!rateLimit.ok) {
    return {
      status: "error",
      message: `Too many bootstrap attempts. Try again in ${formatRetryAfter(rateLimit.retryAfterMs)}.`,
    };
  }

  if (!verifyBootstrapToken(parsedInput.data.bootstrapToken)) {
    return {
      status: "error",
      message: "The setup token is invalid or web bootstrap is not enabled.",
      fieldErrors: { bootstrapToken: "Enter the setup token configured by the operator." },
    };
  }

  const { bootstrapToken: _bootstrapToken, ...adminInput } = parsedInput.data;
  void _bootstrapToken;
  const result = await createFirstAdmin(adminInput);

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

  await signIn("credentials", {
    email: parsedInput.data.email,
    password: parsedInput.data.password,
    redirectTo: "/setup",
  });

  return {
    status: "error",
    message: "The administrator was created, but automatic sign-in did not complete.",
  };
}
