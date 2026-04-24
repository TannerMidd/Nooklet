import { createAuditEvent, countActiveAdminUsers, findUserById, updateUserDisabledState } from "@/modules/users/repositories/user-repository";
import { type UpdateManagedUserStatusInput } from "@/modules/users/schemas/admin-user";

type UpdateManagedUserStatusResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function updateManagedUserStatus(
  actorUserId: string,
  input: UpdateManagedUserStatusInput,
): Promise<UpdateManagedUserStatusResult> {
  const targetUser = await findUserById(input.userId);

  if (!targetUser) {
    return {
      ok: false,
      message: "User not found.",
    };
  }

  if (targetUser.id === actorUserId) {
    return {
      ok: false,
      message: "Use another admin account to change your own status.",
    };
  }

  if (targetUser.isDisabled === input.isDisabled) {
    return {
      ok: true,
      message: input.isDisabled ? "User is already disabled." : "User is already active.",
    };
  }

  if (input.isDisabled && targetUser.role === "admin") {
    const activeAdminCount = await countActiveAdminUsers();

    if (!targetUser.isDisabled && activeAdminCount <= 1) {
      return {
        ok: false,
        message: "Keep at least one active admin account.",
      };
    }
  }

  const updatedUser = await updateUserDisabledState(targetUser.id, input.isDisabled);

  if (!updatedUser) {
    return {
      ok: false,
      message: "Unable to update the account status.",
    };
  }

  await createAuditEvent({
    actorUserId,
    eventType: updatedUser.isDisabled ? "users.disabled" : "users.enabled",
    subjectType: "user",
    subjectId: updatedUser.id,
    payloadJson: JSON.stringify({
      role: updatedUser.role,
    }),
  });

  return {
    ok: true,
    message: updatedUser.isDisabled
      ? `${updatedUser.displayName} has been disabled.`
      : `${updatedUser.displayName} has been re-enabled.`,
  };
}
