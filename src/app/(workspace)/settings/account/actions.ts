"use server";

import { type ChangePasswordActionState } from "@/app/(workspace)/settings/account/action-state";
import { auth } from "@/auth";
import { changePasswordInputSchema } from "@/modules/users/schemas/change-password";
import { changePassword } from "@/modules/users/workflows/change-password";

export async function submitChangePasswordAction(
  _previousState: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      status: "error",
      message: "You need to sign in again.",
    };
  }

  const parsedInput = changePasswordInputSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsedInput.success) {
    const flattenedErrors = parsedInput.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the highlighted fields and try again.",
      fieldErrors: {
        currentPassword: flattenedErrors.currentPassword?.[0],
        newPassword: flattenedErrors.newPassword?.[0],
        confirmPassword: flattenedErrors.confirmPassword?.[0],
      },
    };
  }

  const result = await changePassword(session.user.id, parsedInput.data);

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

  return {
    status: "success",
    message: "Password updated.",
  };
}
