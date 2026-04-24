import { createAuditEvent, countActiveAdminUsers, findUserById, updateUserRole } from "@/modules/users/repositories/user-repository";
import { type UpdateManagedUserRoleInput } from "@/modules/users/schemas/admin-user";

type UpdateManagedUserRoleResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function updateManagedUserRole(
  actorUserId: string,
  input: UpdateManagedUserRoleInput,
): Promise<UpdateManagedUserRoleResult> {
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
      message: "Use a different admin account to change your own role.",
    };
  }

  if (targetUser.role === input.role) {
    return {
      ok: true,
      message: "Role already matches the requested value.",
    };
  }

  if (targetUser.role === "admin" && input.role !== "admin" && !targetUser.isDisabled) {
    const activeAdminCount = await countActiveAdminUsers();

    if (activeAdminCount <= 1) {
      return {
        ok: false,
        message: "Keep at least one active admin account.",
      };
    }
  }

  const updatedUser = await updateUserRole(targetUser.id, input.role);

  if (!updatedUser) {
    return {
      ok: false,
      message: "Unable to update the user role.",
    };
  }

  await createAuditEvent({
    actorUserId,
    eventType: "users.role-updated",
    subjectType: "user",
    subjectId: updatedUser.id,
    payloadJson: JSON.stringify({
      previousRole: targetUser.role,
      nextRole: updatedUser.role,
    }),
  });

  return {
    ok: true,
    message: `${updatedUser.displayName} is now ${updatedUser.role}.`,
  };
}
