"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  type CreateManagedUserActionState,
  type ManagedUserMutationActionState,
  type ResetManagedUserPasswordActionState,
} from "@/app/(workspace)/admin/action-state";
import {
  createManagedUserInputSchema,
  resetManagedUserPasswordInputSchema,
  updateManagedUserRoleInputSchema,
  updateManagedUserStatusInputSchema,
} from "@/modules/users/schemas/admin-user";
import { createManagedUser } from "@/modules/users/workflows/create-managed-user";
import { resetManagedUserPassword } from "@/modules/users/workflows/reset-managed-user-password";
import { updateManagedUserRole } from "@/modules/users/workflows/update-managed-user-role";
import { updateManagedUserStatus } from "@/modules/users/workflows/update-managed-user-status";

async function requireAdminActionSession() {
  const session = await auth();

  if (!session?.user?.id || session.user.role !== "admin") {
    return null;
  }

  return session;
}

export async function submitCreateManagedUserAction(
  _previousState: CreateManagedUserActionState,
  formData: FormData,
): Promise<CreateManagedUserActionState> {
  const session = await requireAdminActionSession();

  if (!session) {
    return {
      status: "error",
      message: "You need an active admin session to do that.",
    };
  }

  const parsedInput = createManagedUserInputSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    role: formData.get("role"),
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
        role: flattenedErrors.role?.[0],
        password: flattenedErrors.password?.[0],
        confirmPassword: flattenedErrors.confirmPassword?.[0],
      },
    };
  }

  const result = await createManagedUser(session.user.id, parsedInput.data);

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

  revalidatePath("/admin");

  return {
    status: "success",
    message: result.message,
  };
}

export async function submitUpdateManagedUserRoleAction(
  _previousState: ManagedUserMutationActionState,
  formData: FormData,
): Promise<ManagedUserMutationActionState> {
  const session = await requireAdminActionSession();

  if (!session) {
    return {
      status: "error",
      message: "You need an active admin session to do that.",
    };
  }

  const parsedInput = updateManagedUserRoleInputSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role"),
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Invalid role update request.",
    };
  }

  const result = await updateManagedUserRole(session.user.id, parsedInput.data);
  revalidatePath("/admin");

  return {
    status: result.ok ? "success" : "error",
    message: result.message,
  };
}

export async function submitUpdateManagedUserStatusAction(
  _previousState: ManagedUserMutationActionState,
  formData: FormData,
): Promise<ManagedUserMutationActionState> {
  const session = await requireAdminActionSession();

  if (!session) {
    return {
      status: "error",
      message: "You need an active admin session to do that.",
    };
  }

  const parsedInput = updateManagedUserStatusInputSchema.safeParse({
    userId: formData.get("userId"),
    isDisabled: formData.get("isDisabled") === "true",
  });

  if (!parsedInput.success) {
    return {
      status: "error",
      message: "Invalid account status request.",
    };
  }

  const result = await updateManagedUserStatus(session.user.id, parsedInput.data);
  revalidatePath("/admin");

  return {
    status: result.ok ? "success" : "error",
    message: result.message,
  };
}

export async function submitResetManagedUserPasswordAction(
  _previousState: ResetManagedUserPasswordActionState,
  formData: FormData,
): Promise<ResetManagedUserPasswordActionState> {
  const session = await requireAdminActionSession();

  if (!session) {
    return {
      status: "error",
      message: "You need an active admin session to do that.",
    };
  }

  const parsedInput = resetManagedUserPasswordInputSchema.safeParse({
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsedInput.success) {
    const flattenedErrors = parsedInput.error.flatten().fieldErrors;

    return {
      status: "error",
      message: "Review the password fields and try again.",
      fieldErrors: {
        newPassword: flattenedErrors.newPassword?.[0],
        confirmPassword: flattenedErrors.confirmPassword?.[0],
      },
    };
  }

  const result = await resetManagedUserPassword(session.user.id, parsedInput.data);
  revalidatePath("/admin");

  return {
    status: result.ok ? "success" : "error",
    message: result.message,
  };
}
